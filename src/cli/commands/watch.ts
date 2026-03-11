import { Command } from 'commander'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import type { CommandResult } from '../../core/types.js'

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

export class Watcher {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private cycles = 0
  private totalCost = 0
  private startTime = 0
  private previousSnapshot = ''

  constructor(
    private topic: string,
    private options: WatchOptions,
  ) {}

  async start(grokKey: string): Promise<void> {
    const { GrokAdapter } = await import('../../core/grok-adapter.js')
    const grok = new GrokAdapter(grokKey)

    this.running = true
    this.startTime = Date.now()
    this.cycles = 0
    this.totalCost = 0

    // Run first check immediately
    await this.check(grok)

    // Check if first run already hit the limit
    if (this.options.maxCycles > 0 && this.cycles >= this.options.maxCycles) {
      this.stop()
      return
    }

    // Schedule next check only after current one completes (no pile-up)
    this.scheduleNext(grok)
  }

  private scheduleNext(grok: import('../../core/grok-adapter.js').GrokAdapter): void {
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

  private async check(grok: import('../../core/grok-adapter.js').GrokAdapter): Promise<void> {
    try {
      const prompt = this.previousSnapshot
        ? `Monitor X for changes on: ${this.topic}\n\nPrevious snapshot:\n${this.previousSnapshot}`
        : `Monitor X for the current state of: ${this.topic}`

      const response = await grok.query(prompt, {
        systemPrompt: SYSTEM_PROMPT,
        enableXSearch: true,
        maxTokens: 2048,
      })

      this.cycles++
      this.totalCost += response.usage.costUsd
      this.previousSnapshot = response.text

      const result: CommandResult = {
        command: 'watch',
        query: this.topic,
        response: response.text,
        cost: response.usage.costUsd,
        cached: false,
        timestamp: Date.now(),
      }

      this.options.onUpdate(result)
    } catch (err) {
      this.options.onError(err instanceof Error ? err : new Error(String(err)))
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
    .action(async (topicParts: string[], options: { interval: string; max: string; cost?: boolean }) => {
      const topic = topicParts.join(' ')
      const intervalSec = Math.max(parseInt(options.interval, 10) || 60, 10)
      const maxCycles = Math.max(parseInt(options.max, 10) || 0, 0)
      const auth = new AuthManager(ConfigManager.defaultDir())

      const chalk = (await import('chalk')).default

      const grokKey = auth.getGrokKey()
      if (!grokKey) {
        console.log(chalk.red('\n  No Grok API key found. Run: corvus auth setup\n'))
        process.exit(1)
      }

      if (options.cost) {
        const { MODEL_PRICING, DEFAULT_MODEL } = await import('../../core/grok-adapter.js')
        const pricing = MODEL_PRICING[DEFAULT_MODEL]
        const perCycle = (500 * pricing.input + 2000 * pricing.output) / 1_000_000
        console.log(chalk.dim(`\n  Model: ${DEFAULT_MODEL}`))
        console.log(chalk.dim(`  Estimated cost per cycle: $${perCycle.toFixed(6)}`))
        console.log(chalk.dim(`  Interval: ${intervalSec}s`))
        if (maxCycles > 0) {
          console.log(chalk.dim(`  Max cycles: ${maxCycles}`))
          console.log(chalk.dim(`  Estimated total: $${(perCycle * maxCycles).toFixed(6)}`))
        } else {
          console.log(chalk.dim(`  Runs until stopped (Ctrl+C)`))
          console.log(chalk.dim(`  Estimated per hour: $${(perCycle * (3600 / intervalSec)).toFixed(6)}`))
        }
        console.log()
        return
      }

      const { formatOutput } = await import('../output.js')

      console.log(chalk.bold(`\n  watching: ${topic}`))
      console.log(chalk.dim(`  interval: ${intervalSec}s${maxCycles > 0 ? `, max ${maxCycles} cycles` : ''}`))
      console.log(chalk.dim('  press Ctrl+C to stop\n'))

      const watcher = new Watcher(topic, {
        interval: intervalSec * 1000,
        maxCycles,
        onUpdate: (result) => {
          console.log(chalk.dim(`  ── ${new Date().toLocaleTimeString()} ──`))
          console.log(formatOutput(result, 'table'))
        },
        onError: (err) => {
          console.log(chalk.red(`  error: ${err.message}`))
        },
        onStop: (summary) => {
          console.log(chalk.dim(`\n  watch stopped: ${summary.cycles} cycles, $${summary.totalCost.toFixed(4)} total, ${Math.round(summary.duration / 1000)}s\n`))
        },
      })

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        watcher.stop()
        process.exit(0)
      })

      await watcher.start(grokKey)
    })
}
