import { parseGrokJson } from '../grok-adapter.js'
import type { GrokReadResponse, ReadSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

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

export async function buildReadSnapshot(
  deps: CorvusDeps,
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

export function extractTweetId(input: string): string | null {
  const urlMatch = input.match(/\/status\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  if (/^\d+$/.test(input)) return input
  return null
}
