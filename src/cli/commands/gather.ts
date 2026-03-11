import { Command } from 'commander'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import type { OutputFormat } from '../output.js'
import type { CommandResult } from '../../core/types.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst compiling a comprehensive intelligence brief from X (Twitter) and web sources.
Gather all available intelligence on the given topic. Produce a thorough brief:
- Executive summary: the single most important thing to know right now
- X discourse: dominant narratives, key voices, engagement patterns, sentiment
- Web context: relevant news, developments, or events driving the conversation
- Network analysis: which communities are engaged? Any coordinated activity?
- Source assessment: which sources are most credible? Any notable bias or agenda?
- Forward look: what's likely to happen next? What to watch for?
Be thorough but direct. No emoji. No markdown headers. Use plain text with clear section breaks.`

export function registerGatherCommand(program: Command): void {
  program
    .command('gather <topic...>')
    .description('Comprehensive intelligence gathering on a topic')
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
        console.log(chalk.dim(`  Typical gather cost: $${((1000 * pricing.input + 4000 * pricing.output) / 1_000_000).toFixed(6)}\n`))
        return
      }

      const [{ default: ora }, { GrokAdapter }, { formatOutput }] = await Promise.all([
        import('ora'),
        import('../../core/grok-adapter.js'),
        import('../output.js'),
      ])

      const spinner = ora({ text: 'gathering intelligence...', indent: 2 }).start()

      try {
        const grok = new GrokAdapter(grokKey)
        const response = await grok.query(`Compile a comprehensive intelligence brief on: ${topic}`, {
          systemPrompt: SYSTEM_PROMPT,
          enableXSearch: true,
          enableWebSearch: true,
          maxTokens: 6144,
        })

        spinner.stop()

        const result: CommandResult = {
          command: 'gather',
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
