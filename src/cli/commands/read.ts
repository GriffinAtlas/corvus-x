import { Command } from 'commander'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import type { OutputFormat } from '../output.js'
import type { CommandResult } from '../../core/types.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst reading and analyzing X (Twitter) content.
You've been given raw tweet data. Analyze it:
- What is the author saying and why does it matter?
- Context: what conversation or trend is this part of?
- Engagement analysis: is this resonating? With whom?
- Signal assessment: is this noise, signal, or counter-signal?
Be direct. No emoji. No markdown headers. Use plain text with line breaks.`

function extractTweetId(input: string): string {
  // Handle full URLs like https://x.com/user/status/123456
  const urlMatch = input.match(/\/status\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  // Handle bare numeric IDs
  if (/^\d+$/.test(input)) return input
  return input
}

export function registerReadCommand(program: Command): void {
  program
    .command('read <tweet-id-or-url>')
    .description('Analyze a specific tweet')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .action(async (input: string, options: { format: OutputFormat }) => {
      const auth = new AuthManager(ConfigManager.defaultDir())

      const grokKey = auth.getGrokKey()
      if (!grokKey) {
        const chalk = (await import('chalk')).default
        console.log(chalk.red('\n  No Grok API key found. Run: corvus auth setup\n'))
        process.exit(1)
      }

      const xToken = auth.getXToken()
      if (!xToken) {
        const chalk = (await import('chalk')).default
        console.log(chalk.red('\n  X API token required for read. Run: corvus auth setup\n'))
        process.exit(1)
      }

      const [{ default: ora }, { GrokAdapter }, { XAdapter }, { formatOutput }] = await Promise.all([
        import('ora'),
        import('../../core/grok-adapter.js'),
        import('../../core/x-adapter.js'),
        import('../output.js'),
      ])

      const spinner = ora({ text: 'reading tweet...', indent: 2 }).start()

      try {
        const tweetId = extractTweetId(input)
        const x = new XAdapter(xToken)
        const tweet = await x.getTweet(tweetId)

        const tweetContext = [
          `Tweet ID: ${tweet.id}`,
          `Author: ${tweet.authorId}`,
          `Posted: ${tweet.createdAt}`,
          `Text: ${tweet.text}`,
          `Metrics: ${tweet.metrics.likes} likes, ${tweet.metrics.retweets} RTs, ${tweet.metrics.replies} replies, ${tweet.metrics.impressions} impressions`,
        ].join('\n')

        const grok = new GrokAdapter(grokKey)
        const response = await grok.query(`Analyze this tweet:\n\n${tweetContext}`, {
          systemPrompt: SYSTEM_PROMPT,
          enableXSearch: true,
        })

        spinner.stop()

        const result: CommandResult = {
          command: 'read',
          query: `tweet:${tweetId}`,
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
