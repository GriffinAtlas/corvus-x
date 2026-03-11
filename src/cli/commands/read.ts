import { Command } from 'commander'
import chalk from 'chalk'
import { runCommand } from '../run-command.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst reading and analyzing X (Twitter) content.
You've been given raw tweet data. Analyze it:
- What is the author saying and why does it matter?
- Context: what conversation or trend is this part of?
- Engagement analysis: is this resonating? With whom?
- Signal assessment: is this noise, signal, or counter-signal?
Be direct. No emoji. No markdown headers. Use plain text with line breaks.`

export function extractTweetId(input: string): string | null {
  const urlMatch = input.match(/\/status\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  if (/^\d+$/.test(input)) return input
  return null
}

export function registerReadCommand(program: Command): void {
  program
    .command('read <tweet-id-or-url>')
    .description('Analyze a specific tweet')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (input: string, options: { format: OutputFormat; cost?: boolean }) => {
      const tweetId = extractTweetId(input)
      if (!tweetId) {
        console.log(chalk.red(`\n  Invalid tweet ID or URL: ${input}\n  Use a numeric ID or a URL like https://x.com/user/status/123456\n`))
        process.exit(1)
      }

      await runCommand({
        command: 'read',
        query: `tweet:${tweetId}`,
        format: options.format,
        cost: options.cost,
        spinnerText: 'reading tweet...',
        requiresXToken: true,
        execute: async (deps) => {
          const tweet = await deps.x!.getTweet(tweetId)
          const tweetContext = [
            `Tweet ID: ${tweet.id}`,
            `Author: ${tweet.authorId}`,
            `Posted: ${tweet.createdAt}`,
            `Text: ${tweet.text}`,
            `Metrics: ${tweet.metrics.likes} likes, ${tweet.metrics.retweets} RTs, ${tweet.metrics.replies} replies, ${tweet.metrics.impressions} impressions`,
          ].join('\n')

          return deps.grok.query(`Analyze this tweet:\n\n${tweetContext}`, {
            systemPrompt: SYSTEM_PROMPT,
            enableXSearch: true,
          })
        },
      })
    })
}
