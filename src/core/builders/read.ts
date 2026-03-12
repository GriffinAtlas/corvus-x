import { parseGrokJson } from '../grok-adapter.js'
import type { GrokReadResponse, ReadSnapshot } from '../schemas.js'
import type { GrokOnlyReadResponse } from './grok-only.js'
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

const GROK_ONLY_PROMPT = `You are an intelligence analyst analyzing a specific tweet. Search X to find the tweet, then analyze it. Return ONLY a JSON object:
{
  "tweet": {
    "id": "123456",
    "author": "username",
    "text": "tweet content",
    "engagement": { "likes": 10, "retweets": 5, "replies": 2, "impressions": 100 },
    "postedAt": "2024-01-01T00:00:00Z"
  },
  "analysis": "detailed analysis of content, context, and significance",
  "significance": "high",
  "signals": ["notable observation"]
}
Rules:
- Search X for this specific tweet by ID.
- tweet: the tweet data you found (best effort for engagement numbers).
- analysis: 2-4 sentences on what this tweet means and why it matters.
- significance: "high", "medium", or "low".
- signals: 2-4 notable observations or implications.
- Return ONLY valid JSON.`

export async function buildReadSnapshot(
  deps: CorvusDeps,
  tweetId: string,
): Promise<BuildResult<ReadSnapshot>> {
  if (deps.x) {
    return buildReadFromXApi(deps, tweetId)
  }
  return buildReadFromGrok(deps, tweetId)
}

async function buildReadFromXApi(
  deps: CorvusDeps,
  tweetId: string,
): Promise<BuildResult<ReadSnapshot>> {
  const tweet = await deps.x!.getTweet(tweetId)
  const author = await deps.x!.getUserById(tweet.authorId).catch(() => null)

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
    citations: [],
  }
}

async function buildReadFromGrok(
  deps: CorvusDeps,
  tweetId: string,
): Promise<BuildResult<ReadSnapshot>> {
  const response = await deps.grok.query(
    `Find and analyze this tweet (ID: ${tweetId}). Look it up on X.`,
    { systemPrompt: GROK_ONLY_PROMPT, enableXSearch: true, maxTokens: 3072 },
  )

  const grok = parseGrokJson<GrokOnlyReadResponse>(response.text)

  return {
    data: {
      tweet: grok.tweet ?? {
        id: tweetId,
        author: 'unknown',
        text: '',
        engagement: { likes: 0, retweets: 0, replies: 0, impressions: 0 },
        postedAt: '',
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
    citations: [],
  }
}

export function extractTweetId(input: string): string | null {
  const urlMatch = input.match(/\/status\/(\d+)/)
  if (urlMatch) return urlMatch[1]
  if (/^\d+$/.test(input)) return input
  return null
}
