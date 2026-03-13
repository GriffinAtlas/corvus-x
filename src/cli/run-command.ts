import ora from 'ora'
import { t, divider } from './theme.js'
import { AuthManager } from '../infra/auth.js'
import { ConfigManager } from '../infra/config.js'
import { GrokAdapter } from '../core/grok-adapter.js'
import { XAdapter } from '../core/x-adapter.js'
import { QueryCache } from '../core/cache.js'
import { executeStructuredQuery } from '../core/orchestrator.js'
import { formatOutput, formatStructuredOutput } from './output.js'
import type {
  GrokResponse,
  CommandResult,
  StructuredCommandResult,
  BuildResult,
  CorvusDeps,
} from '../core/types.js'
import type { OutputFormat } from './output.js'
import type { Snapshot, MatchKeys } from '../core/schemas.js'

function initDeps(): CorvusDeps {
  const auth = new AuthManager(ConfigManager.defaultDir())
  const grokKey = auth.getGrokKey()
  if (!grokKey) {
    console.log(t.error('\n  No Grok API key found. Run: corvus auth setup\n'))
    process.exit(1)
  }
  const xToken = auth.getXToken()
  return {
    grok: new GrokAdapter(grokKey),
    x: xToken ? new XAdapter(xToken) : null,
  }
}

async function showCostAndExit(): Promise<void> {
  const { MODEL_PRICING, DEFAULT_MODEL } = await import('../core/grok-adapter.js')
  const pricing = MODEL_PRICING[DEFAULT_MODEL]
  console.log(t.muted(`\n  Model: ${DEFAULT_MODEL}`))
  console.log(t.muted(`  Input:  $${pricing.input.toFixed(2)}/M tokens`))
  console.log(t.muted(`  Output: $${pricing.output.toFixed(2)}/M tokens\n`))
}

export interface RunCommandOptions {
  command: string
  query: string
  format: OutputFormat
  cost?: boolean
  spinnerText: string
  requiresXToken?: boolean
  execute: (deps: CorvusDeps) => Promise<GrokResponse>
  executeStream?: (deps: CorvusDeps, onChunk: (text: string) => void) => Promise<GrokResponse>
}

export async function runCommand(opts: RunCommandOptions): Promise<void> {
  if (opts.cost) {
    await showCostAndExit()
    return
  }

  const auth = new AuthManager(ConfigManager.defaultDir())
  if (opts.requiresXToken && !auth.getXToken()) {
    console.log(t.error(`\n  X API token required for ${opts.command}. Run: corvus auth setup\n`))
    process.exit(1)
  }

  const cache = new QueryCache(ConfigManager.defaultDir())
  const cached = cache.get(opts.command, opts.query)
  if (cached) {
    const result: CommandResult = {
      command: opts.command,
      query: opts.query,
      response: cached.response,
      cost: 0,
      cached: true,
      timestamp: Date.now(),
    }
    console.log(formatOutput(result, opts.format))
    return
  }

  const deps = initDeps()
  const spinner = ora({ text: opts.spinnerText, indent: 2 }).start()

  try {
    let response: GrokResponse
    let receivedContent = true

    if (opts.executeStream && opts.format === 'table') {
      let firstChunk = true
      response = await opts.executeStream(deps, (text) => {
        if (firstChunk) {
          spinner.stop()
          console.log(`\n  ${t.heading(opts.command)} ${t.muted('·')} ${opts.query}`)
          console.log(`  ${divider()}\n`)
          process.stdout.write('  ')
          firstChunk = false
        }
        process.stdout.write(text)
      })
      receivedContent = !firstChunk
      if (receivedContent) {
        console.log('\n')
        console.log(`  ${t.muted(`cost: $${response.usage.costUsd.toFixed(4)}`)}`)
        console.log()
      }
    } else {
      response = await opts.execute(deps)
      spinner.stop()

      const result: CommandResult = {
        command: opts.command,
        query: opts.query,
        response: response.text,
        cost: response.usage.costUsd,
        cached: false,
        timestamp: Date.now(),
      }
      console.log(formatOutput(result, opts.format))
    }

    if (receivedContent) {
      cache.set(opts.command, opts.query, response.text, response.usage.costUsd)
    }
  } catch (err) {
    spinner.stop()
    const msg = err instanceof Error ? err.message : String(err)
    console.log(t.error(`\n  Error: ${msg}\n`))
    process.exit(1)
  }
}

export interface RunStructuredCommandOptions<T extends Snapshot> {
  command: string
  topic: string
  format: OutputFormat
  cost?: boolean
  spinnerText: string
  matchKeys: MatchKeys
  renderSnapshot: (data: T) => string
  buildSnapshot: (deps: CorvusDeps) => Promise<BuildResult<T>>
}

export async function runStructuredCommand<T extends Snapshot>(
  opts: RunStructuredCommandOptions<T>,
): Promise<void> {
  if (opts.cost) {
    await showCostAndExit()
    return
  }

  const deps = initDeps()
  const spinner = ora({ text: opts.spinnerText, indent: 2 }).start()

  try {
    const result = await executeStructuredQuery({
      command: opts.command,
      topic: opts.topic,
      matchKeys: opts.matchKeys,
      buildSnapshot: () => opts.buildSnapshot(deps),
      baseDir: ConfigManager.defaultDir(),
    })
    spinner.stop()

    const structured: StructuredCommandResult<T> = {
      command: opts.command,
      topic: opts.topic,
      data: result.data,
      cost: result.cost,
      timestamp: result.timestamp,
      diff: result.diff,
      timeSinceLast: result.timeSinceLast,
      citations: result.citations,
    }

    console.log(formatStructuredOutput(structured, opts.format, opts.renderSnapshot))
  } catch (err) {
    spinner.stop()
    const msg = err instanceof Error ? err.message : String(err)
    console.log(t.error(`\n  Error: ${msg}\n`))
    process.exit(1)
  }
}
