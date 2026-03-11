import { Command } from 'commander'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import type { OutputFormat } from '../output.js'
import type { CommandResult } from '../../core/types.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst scanning X (Twitter) discourse.
Scan the conversation around the given topic. Report:
- Key voices and accounts driving the discussion
- Dominant narratives and counter-narratives
- Notable tweets with high engagement
- Emerging consensus or disagreement
Be direct. No emoji. No markdown headers. Use plain text with line breaks.`

export function registerScanCommand(program: Command): void {
  program
    .command('scan <topic...>')
    .description('Scan X discourse on a topic')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (topicParts: string[], options: { format: OutputFormat; cost?: boolean }) => {
      const topic = topicParts.join(' ')
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
        console.log(chalk.dim(`  Typical scan cost: $${((500 * pricing.input + 2000 * pricing.output) / 1_000_000).toFixed(6)}\n`))
        return
      }

      const [{ default: ora }, { GrokAdapter }, { formatOutput }] = await Promise.all([
        import('ora'),
        import('../../core/grok-adapter.js'),
        import('../output.js'),
      ])

      const spinner = ora({ text: 'scanning X...', indent: 2 }).start()

      try {
        const grok = new GrokAdapter(grokKey)
        const response = await grok.query(`Scan X discourse on: ${topic}`, {
          systemPrompt: SYSTEM_PROMPT,
          enableXSearch: true,
          maxTokens: 3072,
        })

        spinner.stop()

        const result: CommandResult = {
          command: 'scan',
          query: topic,
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
