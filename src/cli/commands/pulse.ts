import { Command } from 'commander'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import type { OutputFormat } from '../output.js'
import type { CommandResult } from '../../core/types.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst reading the pulse of X (Twitter).
For the given topic, report the current pulse:
- Sentiment: overall mood — bullish, bearish, neutral, mixed. What's the prevailing tone?
- Volume: is this topic generating significant conversation or is it quiet?
- Momentum: is interest rising, falling, or stable? Any inflection points?
- Key signals: notable tweets, threads, or accounts shaping the conversation right now
- Contrarian signals: any notable dissent or counter-narratives worth tracking?
Be direct. No emoji. No markdown headers. Use plain text with line breaks.`

export function registerPulseCommand(program: Command): void {
  program
    .command('pulse <topic...>')
    .description('Get the pulse on a topic — sentiment, momentum, key signals')
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
        console.log(chalk.dim(`  Typical pulse cost: $${((500 * pricing.input + 2000 * pricing.output) / 1_000_000).toFixed(6)}\n`))
        return
      }

      const [{ default: ora }, { GrokAdapter }, { formatOutput }] = await Promise.all([
        import('ora'),
        import('../../core/grok-adapter.js'),
        import('../output.js'),
      ])

      const spinner = ora({ text: 'reading pulse...', indent: 2 }).start()

      try {
        const grok = new GrokAdapter(grokKey)
        const response = await grok.query(`What's the current pulse on X for: ${topic}`, {
          systemPrompt: SYSTEM_PROMPT,
          enableXSearch: true,
          enableWebSearch: true,
          maxTokens: 3072,
        })

        spinner.stop()

        const result: CommandResult = {
          command: 'pulse',
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
