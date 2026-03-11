import { AuthManager } from '../infra/auth.js'
import { ConfigManager } from '../infra/config.js'
import { QueryCache } from '../core/cache.js'
import type { GrokResponse, CommandResult } from '../core/types.js'
import type { GrokAdapter } from '../core/grok-adapter.js'
import type { XAdapter } from '../core/x-adapter.js'
import type { OutputFormat } from './output.js'

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
  const chalk = (await import('chalk')).default
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
    const { formatOutput } = await import('./output.js')
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

  const [{ default: ora }, { GrokAdapter: GrokAdapterClass }, { XAdapter: XAdapterClass }, { formatOutput }] =
    await Promise.all([
      import('ora'),
      import('../core/grok-adapter.js'),
      import('../core/x-adapter.js'),
      import('./output.js'),
    ])

  const deps: CommandDeps = {
    grok: new GrokAdapterClass(grokKey),
    x: xToken ? new XAdapterClass(xToken) : null,
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
