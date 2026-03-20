import { Command } from 'commander'
import { t } from '../theme.js'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import { formatOutput } from '../output.js'
import { validateDateRange } from './ask.js'
import type { GrokAdapter } from '../../core/grok-adapter.js'
import type { CommandResult, QueryOptions } from '../../core/types.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst monitoring X (Twitter) in real-time.
Compare the current state of discourse to the previous snapshot.
Report only what has CHANGED since the last check:
- New developments or breaking signals
- Shifts in sentiment or momentum
- New key voices entering the conversation
- Engagement spikes or drops
If nothing meaningful has changed, say "No significant changes."
Be extremely concise. No emoji. No markdown headers.`

export interface WatchOptions {
  interval: number
  maxCycles: number
  queryOptions?: Partial<QueryOptions>
  onUpdate: (result: CommandResult) => void
  onError: (err: Error) => void
  onStop: (summary: WatchSummary) => void
}

export interface WatchSummary {
  topic: string
  cycles: number
  totalCost: number
  duration: number
}

const MAX_CONSECUTIVE_ERRORS = 5

export class Watcher {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private cycles = 0
  private totalCost = 0
  private startTime = 0
  private previousSnapshot = ''
  private consecutiveErrors = 0

  constructor(
    private topic: string,
    private options: WatchOptions,
  ) {}

  async start(grokKey: string): Promise<void> {
    const { GrokAdapter: Grok } = await import('../../core/grok-adapter.js')
    const grok = new Grok(grokKey)

    this.running = true
    this.startTime = Date.now()
    this.cycles = 0
    this.totalCost = 0

    await this.check(grok)

    if (this.options.maxCycles > 0 && this.cycles >= this.options.maxCycles) {
      this.stop()
      return
    }

    this.scheduleNext(grok)
  }

  private scheduleNext(grok: GrokAdapter): void {
    if (!this.running) return
    this.timer = setTimeout(async () => {
      if (!this.running) return
      await this.check(grok)
      if (this.options.maxCycles > 0 && this.cycles >= this.options.maxCycles) {
        this.stop()
      } else {
        this.scheduleNext(grok)
      }
    }, this.options.interval)
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.options.onStop({
      topic: this.topic,
      cycles: this.cycles,
      totalCost: this.totalCost,
      duration: Date.now() - this.startTime,
    })
  }

  get isRunning(): boolean {
    return this.running
  }

  private async check(grok: GrokAdapter): Promise<void> {
    try {
      const prompt = this.previousSnapshot
        ? `Monitor X for changes on: ${this.topic}\n\nPrevious snapshot:\n${this.previousSnapshot}`
        : `Monitor X for the current state of: ${this.topic}`

      const response = await grok.query(prompt, {
        systemPrompt: SYSTEM_PROMPT,
        enableXSearch: true,
        maxTokens: 2048,
        ...this.options.queryOptions,
      })

      // If stopped while the request was in-flight, discard the result
      if (!this.running) return

      this.cycles++
      this.totalCost += response.usage.costUsd
      this.previousSnapshot = response.text.slice(-4000)
      this.consecutiveErrors = 0

      this.options.onUpdate({
        command: 'watch',
        query: this.topic,
        response: response.text,
        cost: response.usage.costUsd,
        cached: false,
        timestamp: Date.now(),
      })
    } catch (err) {
      if (!this.running) return
      this.consecutiveErrors++
      this.options.onError(err instanceof Error ? err : new Error(String(err)))
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.stop()
      }
    }
  }
}

export function registerWatchCommand(program: Command): void {
  program
    .command('watch <topic...>')
    .description('Live-monitor a topic on X with periodic updates')
    .option('-i, --interval <seconds>', 'check interval in seconds', '60')
    .option('-n, --max <cycles>', 'maximum number of checks (0 = unlimited)', '0')
    .option('--cost', 'show estimated cost per cycle')
    .option('--from <date>', 'filter x_search from date (YYYY-MM-DD)')
    .option('--to <date>', 'filter x_search to date (YYYY-MM-DD)')
    .option('--handle <name...>', 'filter x_search to specific handles (max 10)')
    .action(
      async (
        topicParts: string[],
        options: {
          interval: string
          max: string
          cost?: boolean
          from?: string
          to?: string
          handle?: string[]
        },
      ) => {
        const topic = topicParts.join(' ')
        validateDateRange(options.from, options.to)
        const intervalSec = Math.max(parseInt(options.interval, 10) || 60, 10)
        const maxCycles = Math.max(parseInt(options.max, 10) || 0, 0)
        const auth = new AuthManager(ConfigManager.defaultDir())

        const grokKey = auth.getGrokKey()
        if (!grokKey) {
          console.log(t.error('\n  No Grok API key found. Run: corvus auth setup\n'))
          process.exit(1)
        }

        if (options.cost) {
          const { MODEL_PRICING, DEFAULT_MODEL } = await import('../../core/grok-adapter.js')
          const pricing = MODEL_PRICING[DEFAULT_MODEL]
          const perCycle = (500 * pricing.input + 2000 * pricing.output) / 1_000_000
          console.log(t.muted(`\n  Model: ${DEFAULT_MODEL}`))
          console.log(t.muted(`  Estimated cost per cycle: $${perCycle.toFixed(6)}`))
          console.log(t.muted(`  Interval: ${intervalSec}s`))
          if (maxCycles > 0) {
            console.log(t.muted(`  Max cycles: ${maxCycles}`))
            console.log(t.muted(`  Estimated total: $${(perCycle * maxCycles).toFixed(6)}`))
          } else {
            console.log(t.muted(`  Runs until stopped (Ctrl+C)`))
            console.log(
              t.muted(`  Estimated per hour: $${(perCycle * (3600 / intervalSec)).toFixed(6)}`),
            )
          }
          console.log()
          return
        }

        console.log(t.heading(`\n  watching: ${topic}`))
        console.log(
          t.muted(`  interval: ${intervalSec}s${maxCycles > 0 ? `, max ${maxCycles} cycles` : ''}`),
        )
        console.log(t.muted('  press Ctrl+C to stop\n'))

        const handles = options.handle?.length
          ? options.handle.map((h) => h.replace(/^@/, ''))
          : undefined
        if (handles && handles.length > 10) {
          console.log(t.error('\n  Maximum 10 handles allowed (xAI limit)\n'))
          process.exit(1)
        }

        const watcher = new Watcher(topic, {
          interval: intervalSec * 1000,
          maxCycles,
          queryOptions: {
            xSearchFromDate: options.from,
            xSearchToDate: options.to,
            xSearchHandles: handles,
          },
          onUpdate: (result) => {
            console.log(t.muted(`  ── ${new Date().toLocaleTimeString()} ──`))
            console.log(formatOutput(result, 'table'))
          },
          onError: (err) => {
            console.log(t.error(`  error: ${err.message}`))
          },
          onStop: (summary) => {
            console.log(
              t.muted(
                `\n  watch stopped: ${summary.cycles} cycles, $${summary.totalCost.toFixed(4)} total, ${Math.round(summary.duration / 1000)}s\n`,
              ),
            )
          },
        })

        process.on('SIGINT', () => {
          watcher.stop()
        })

        await watcher.start(grokKey)
      },
    )
}
