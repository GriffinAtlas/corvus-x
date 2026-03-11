import { Command } from 'commander'
import { t } from '../theme.js'
import { runStructuredCommand } from '../run-command.js'
import { renderRead } from '../output.js'
import { parseGrokJson } from '../../core/grok-adapter.js'
import type { GrokReadResponse, ReadSnapshot, MatchKeys } from '../../core/schemas.js'
import type { BuildResult } from '../../core/types.js'
import type { CommandDeps } from '../run-command.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are an intelligence analyst analyzing a specific tweet. Return ONLY a JSON object:
{
  "analysis": "detailed analysis of content, context, and significance",
  "significance": "high",
  "signals": ["notable observation"]
}
Rules:
- analysis: 2-4 sentences on what this tweet means and why it matters.
- significance: "high", "medium", or "low".
- signals: 2-4 notable observations or implications.
- Return ONLY valid JSON.`

const READ_MATCH_KEYS: MatchKeys = {}

export function extractTweetId(input: string): string | null {
  const urlMatch = input.match(/\/status\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  if (/^\d+$/.test(input)) return input
  return null
}

export async function buildReadSnapshot(
  deps: CommandDeps,
  tweetId: string,
): Promise<BuildResult<ReadSnapshot>> {
  if (!deps.x) throw new Error('X API token required for read. Run: corvus auth setup')

  const tweet = await deps.x.getTweet(tweetId)
  const author = await deps.x.getUserById(tweet.authorId).catch(() => null)

  const tweetContext = [
    `Tweet by @${author?.username ?? tweet.authorId}`,
    `Posted: ${tweet.createdAt}`,
    `Text: ${tweet.text}`,
    `Metrics: ${tweet.metrics.likes} likes, ${tweet.metrics.retweets} RTs, ${tweet.metrics.replies} replies, ${tweet.metrics.impressions} impressions`,
  ].join('\n')

  const response = await deps.grok.query(`Analyze this tweet:\n\n${tweetContext}`, {
    systemPrompt: SYSTEM_PROMPT,
  })

  const grok = parseGrokJson<GrokReadResponse>(response.text)

  return {
    data: {
      tweet: {
        id: tweet.id,
        author: author?.username ?? tweet.authorId,
        text: tweet.text,
        engagement: tweet.metrics,
        postedAt: tweet.createdAt,
      },
      analysis: grok.analysis,
      significance: grok.significance,
      signals: grok.signals,
    },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets: [],
    scores: [],
    newestTweetAt: null,
  }
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
        console.log(
          t.error(
            `\n  Invalid tweet ID or URL: ${input}\n  Use a numeric ID or a URL like https://x.com/user/status/123456\n`,
          ),
        )
        process.exit(1)
      }

      await runStructuredCommand<ReadSnapshot>({
        command: 'read',
        topic: `tweet:${tweetId}`,
        format: options.format,
        cost: options.cost,
        spinnerText: `read · ${tweetId}`,
        matchKeys: READ_MATCH_KEYS,
        renderSnapshot: renderRead,
        buildSnapshot: (deps) => buildReadSnapshot(deps, tweetId),
      })
    })
}
