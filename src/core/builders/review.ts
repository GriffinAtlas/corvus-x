import { parseGrokJson } from '../grok-adapter.js'
import { computeNewestTweetAt } from '../metrics.js'
import type { ReviewSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are a content performance analyst. Analyze these posts and return ONLY a JSON object:
{
  "topPosts": [{ "content": "post text", "engagement": 500, "why": "reason it worked" }],
  "underperformers": [{ "content": "post text", "engagement": 5, "why": "reason it underperformed" }],
  "patterns": [{ "pattern": "what works", "impact": "how much it helps" }],
  "recommendations": ["actionable suggestion"]
}
Rules:
- topPosts: 3-5 highest-engagement posts with why they worked.
- underperformers: 2-3 lowest-engagement posts with why they underperformed.
- patterns: 3-5 patterns in what drives engagement (time, format, topic, length).
- recommendations: 3-5 actionable suggestions.
- Return ONLY valid JSON.`

export async function buildReviewSnapshot(
  deps: CorvusDeps,
  handle: string,
  days: number,
): Promise<BuildResult<ReviewSnapshot>> {
  if (!deps.x) {
    throw new Error('X API token required for review. Run: corvus auth setup')
  }

  const user = await deps.x.getUser(handle)
  const tweets = await deps.x.getUserTweets(user.id, Math.min(days * 5, 100))

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const recentTweets = tweets.filter((t) => new Date(t.createdAt).getTime() >= cutoff)

  if (recentTweets.length === 0) throw new Error(`No posts from @${handle} in the last ${days} days`)

  const totalEng = recentTweets.reduce(
    (sum, t) => sum + t.metrics.likes + t.metrics.retweets + t.metrics.replies,
    0,
  )

  const tweetBlock = recentTweets
    .map(
      (t, i) =>
        `${i + 1}. [${t.createdAt}] ${t.text} (${t.metrics.likes} likes, ${t.metrics.retweets} RTs, ${t.metrics.replies} replies)`,
    )
    .join('\n')

  const response = await deps.grok.query(
    `Analyze the performance of @${handle}'s last ${recentTweets.length} posts:\n\n${tweetBlock}`,
    { systemPrompt: SYSTEM_PROMPT, maxTokens: 4096 },
  )

  const grok = parseGrokJson<{
    topPosts: ReviewSnapshot['topPosts']
    underperformers: ReviewSnapshot['underperformers']
    patterns: ReviewSnapshot['patterns']
    recommendations: string[]
  }>(response.text)

  const fromDate = recentTweets.length > 0
    ? recentTweets[recentTweets.length - 1].createdAt
    : new Date(cutoff).toISOString()
  const toDate = recentTweets[0].createdAt

  return {
    data: {
      handle,
      period: { from: fromDate, to: toDate },
      totalPosts: recentTweets.length,
      totalEngagement: totalEng,
      avgEngagementPerPost: recentTweets.length > 0 ? Math.round(totalEng / recentTweets.length) : 0,
      topPosts: grok.topPosts ?? [],
      underperformers: grok.underperformers ?? [],
      patterns: grok.patterns ?? [],
      recommendations: grok.recommendations ?? [],
      fetchedAt: new Date().toISOString(),
    },
    raw: response.text,
    cost: response.usage.costUsd,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    toolCalls: response.usage.toolCalls,
    tweets: recentTweets,
    scores: [],
    newestTweetAt: computeNewestTweetAt(recentTweets),
    citations: response.citations,
  }
}
