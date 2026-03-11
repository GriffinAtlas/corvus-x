import { Command } from 'commander'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import type { OutputFormat } from '../output.js'
import type { CommandResult } from '../../core/types.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst tracing narrative spread on X (Twitter).
Trace how the given idea or narrative is spreading. Report:
- Origin: who started this narrative or where did it emerge?
- Amplification: which accounts are boosting it? Are they organic or coordinated?
- Mutation: how is the narrative evolving as it spreads? Key variants?
- Reach: estimated penetration across different communities
- Timeline: when did it start, key inflection points
Be direct. No emoji. No markdown headers. Use plain text with line breaks.`

export function registerTraceCommand(program: Command): void {
  program
    .command('trace <narrative...>')
    .description('Trace the spread of a narrative on X')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (narrativeParts: string[], options: { format: OutputFormat; cost?: boolean }) => {
      const narrative = narrativeParts.join(' ')
      const auth = new AuthManager(ConfigManager.defaultDir())

      const grokKey = auth.getGrokKey()
      if (!grokKey) {
        const chalk = (await import('chalk')).default
        console.log(chalk.red('\n  No Grok API key found. Run: corvus auth setup\n'))
        process.exit(1)
      }

      if (options.cost) {
        const [{ default: chalk }, { MODEL_PRICING, DEFAULT_MODEL }] = await Promise.all([
          import('chalk'),
          import('../../core/grok-adapter.js'),
        ])
        const pricing = MODEL_PRICING[DEFAULT_MODEL]
        console.log(chalk.dim(`\n  Model: ${DEFAULT_MODEL}`))
        console.log(chalk.dim(`  Input:  $${pricing.input.toFixed(2)}/M tokens`))
        console.log(chalk.dim(`  Output: $${pricing.output.toFixed(2)}/M tokens`))
        console.log(chalk.dim(`  Typical trace cost: $${((500 * pricing.input + 3000 * pricing.output) / 1_000_000).toFixed(6)}\n`))
        return
      }

      const [{ default: ora }, { GrokAdapter }, { formatOutput }] = await Promise.all([
        import('ora'),
        import('../../core/grok-adapter.js'),
        import('../output.js'),
      ])

      const spinner = ora({ text: 'tracing narrative...', indent: 2 }).start()

      try {
        const grok = new GrokAdapter(grokKey)
        const response = await grok.query(`Trace the spread of this narrative on X: ${narrative}`, {
          systemPrompt: SYSTEM_PROMPT,
          enableXSearch: true,
          enableWebSearch: true,
          maxTokens: 4096,
        })

        spinner.stop()

        const result: CommandResult = {
          command: 'trace',
          query: narrative,
          response: response.text,
          cost: response.usage.costUsd,
          cached: false,
          timestamp: Date.now(),
        }

        console.log(formatOutput(result, options.format))
      } catch (err) {
        spinner.stop()
        const chalk = (await import('chalk')).default
        const msg = err instanceof Error ? err.message : String(err)
        console.log(chalk.red(`\n  Error: ${msg}\n`))
        process.exit(1)
      }
    })
}
