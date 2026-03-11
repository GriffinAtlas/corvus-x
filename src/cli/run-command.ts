import chalk from 'chalk'
import ora from 'ora'
import { AuthManager } from '../infra/auth.js'
import { ConfigManager } from '../infra/config.js'
import { GrokAdapter } from '../core/grok-adapter.js'
import { XAdapter } from '../core/x-adapter.js'
import { QueryCache } from '../core/cache.js'
import { SnapshotStore } from '../core/snapshots.js'
import { diffSnapshots } from '../core/differ.js'
import { formatOutput, formatStructuredOutput } from './output.js'
import type { GrokResponse, CommandResult, StructuredCommandResult } from '../core/types.js'
import type { OutputFormat } from './output.js'
import type { Snapshot, MatchKeys } from '../core/schemas.js'
import type { DiffLine } from '../core/differ.js'

export interface CommandDeps {
  grok: GrokAdapter
  x: XAdapter | null
}

export interface RunCommandOptions {
  command: string
  query: string
  format: OutputFormat
  cost?: boolean
  spinnerText: string
  requiresXToken?: boolean
  execute: (deps: CommandDeps) => Promise<GrokResponse>
}

export async function runCommand(opts: RunCommandOptions): Promise<void> {
  const auth = new AuthManager(ConfigManager.defaultDir())

  const grokKey = auth.getGrokKey()
  if (!grokKey) {
    console.log(chalk.red('\n  No Grok API key found. Run: corvus auth setup\n'))
    process.exit(1)
  }

  const xToken = auth.getXToken()
  if (opts.requiresXToken && !xToken) {
    console.log(chalk.red(`\n  X API token required for ${opts.command}. Run: corvus auth setup\n`))
    process.exit(1)
  }

  if (opts.cost) {
    const { MODEL_PRICING, DEFAULT_MODEL } = await import('../core/grok-adapter.js')
    const pricing = MODEL_PRICING[DEFAULT_MODEL]
    console.log(chalk.dim(`\n  Model: ${DEFAULT_MODEL}`))
    console.log(chalk.dim(`  Input:  $${pricing.input.toFixed(2)}/M tokens`))
    console.log(chalk.dim(`  Output: $${pricing.output.toFixed(2)}/M tokens\n`))
    return
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

  const deps: CommandDeps = {
    grok: new GrokAdapter(grokKey),
    x: xToken ? new XAdapter(xToken) : null,
  }

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
    console.log(chalk.red(`\n  Error: ${msg}\n`))
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
  buildSnapshot: (deps: CommandDeps) => Promise<{ data: T; raw: string; cost: number }>
}

export async function runStructuredCommand<T extends Snapshot>(
  opts: RunStructuredCommandOptions<T>,
): Promise<void> {
  const auth = new AuthManager(ConfigManager.defaultDir())

  const grokKey = auth.getGrokKey()
  if (!grokKey) {
    console.log(chalk.red('\n  No Grok API key found. Run: corvus auth setup\n'))
    process.exit(1)
  }

  const xToken = auth.getXToken()

  if (opts.cost) {
    const { MODEL_PRICING, DEFAULT_MODEL } = await import('../core/grok-adapter.js')
    const pricing = MODEL_PRICING[DEFAULT_MODEL]
    console.log(chalk.dim(`\n  Model: ${DEFAULT_MODEL}`))
    console.log(chalk.dim(`  Input:  $${pricing.input.toFixed(2)}/M tokens`))
    console.log(chalk.dim(`  Output: $${pricing.output.toFixed(2)}/M tokens\n`))
    return
  }

  const deps: CommandDeps = {
    grok: new GrokAdapter(grokKey),
    x: xToken ? new XAdapter(xToken) : null,
  }

  const spinner = ora({ text: opts.spinnerText, indent: 2 }).start()
  const store = new SnapshotStore(ConfigManager.defaultDir())

  const previous = store.loadLatest<T>(opts.command, opts.topic)
  const built = await opts.buildSnapshot(deps)
  spinner.stop()

  const stored = store.save(opts.command, opts.topic, built.data, built.raw, built.cost)

  let diff: DiffLine[] = []
  let timeSinceLast = 0
  if (previous) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    diff = diffSnapshots(
      previous.data as any,
      stored.data as any,
      opts.matchKeys,
    )
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
  }

  console.log(formatStructuredOutput(result, opts.format, opts.renderSnapshot))
}
