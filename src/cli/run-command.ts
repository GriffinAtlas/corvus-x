import ora from 'ora'
import { t } from './theme.js'
import { AuthManager } from '../infra/auth.js'
import { ConfigManager } from '../infra/config.js'
import { GrokAdapter } from '../core/grok-adapter.js'
import { XAdapter } from '../core/x-adapter.js'
import { QueryCache } from '../core/cache.js'
import { SnapshotStore } from '../core/snapshots.js'
import { diffSnapshots } from '../core/differ.js'
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
import type { DiffLine } from '../core/differ.js'

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
    const response = await opts.execute(deps)
    spinner.stop()

    cache.set(opts.command, opts.query, response.text, response.usage.costUsd)

    const result: CommandResult = {
      command: opts.command,
      query: opts.query,
      response: response.text,
      cost: response.usage.costUsd,
      cached: false,
      timestamp: Date.now(),
    }

    console.log(formatOutput(result, opts.format))
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
  const store = new SnapshotStore(ConfigManager.defaultDir())

  try {
    const previous = store.loadLatest<T>(opts.command, opts.topic)
    const built = await opts.buildSnapshot(deps)
    spinner.stop()

    const stored = store.save(
      opts.command,
      opts.topic,
      built.data,
      built.raw,
      built.cost,
      built.tweets,
      built.scores,
    )

    let diff: DiffLine[] = []
    let timeSinceLast = 0
    if (previous) {
      diff = diffSnapshots(previous.data, stored.data, opts.matchKeys)
      timeSinceLast = stored.timestamp - previous.timestamp
    }

    const result: StructuredCommandResult<T> = {
      command: opts.command,
      topic: opts.topic,
      data: stored.data,
      cost: built.cost,
      timestamp: stored.timestamp,
      diff,
      timeSinceLast,
      citations: built.citations,
    }

    console.log(formatStructuredOutput(result, opts.format, opts.renderSnapshot))
  } catch (err) {
    spinner.stop()
    const msg = err instanceof Error ? err.message : String(err)
    console.log(t.error(`\n  Error: ${msg}\n`))
    process.exit(1)
  }
}
