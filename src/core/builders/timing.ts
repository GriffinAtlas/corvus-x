import { parseGrokJson } from '../grok-adapter.js'
import { computeNewestTweetAt } from '../metrics.js'
import type { TimingSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are a posting schedule analyst. Analyze when posts get the most engagement. Return ONLY a JSON object:
{
  "peakWindows": [{ "day": "Monday", "hour": 9, "score": 0.9 }],
  "recommendations": ["post at 9am UTC on weekdays"]
}
Rules:
- peakWindows: top 5-10 day+hour combinations ranked by engagement.
- day: day of week ("Monday", "Tuesday", etc).
- hour: 0-23 UTC.
- score: 0.0-1.0, normalized (1.0 = best slot).
- recommendations: 2-4 actionable timing suggestions.
- Return ONLY valid JSON.`

const TOPIC_PROMPT = `You are a posting schedule analyst. Search X for when conversations about the given topic are most active. Return ONLY a JSON object:
{
  "peakWindows": [{ "day": "Monday", "hour": 9, "score": 0.9 }],
  "recommendations": ["post about this topic at 9am UTC on weekdays"]
}
Rules:
- Search X for recent activity patterns on this topic.
- peakWindows: top 5-10 day+hour combinations when this topic is most discussed.
- day: day of week. hour: 0-23 UTC. score: 0.0-1.0 normalized.
- recommendations: 2-4 actionable timing suggestions for this topic.
- Return ONLY valid JSON.`

export async function buildTimingSnapshot(
  deps: CorvusDeps,
  options: { handle?: string; topic?: string; days?: number },
): Promise<BuildResult<TimingSnapshot>> {
  if (options.handle) {
    return buildTimingFromPosts(deps, options.handle, options.days ?? 30)
  }
  if (options.topic) {
    return buildTimingFromTopic(deps, options.topic)
  }
  throw new Error('Either handle or topic is required for timing analysis')
}

async function buildTimingFromPosts(
  deps: CorvusDeps,
  handle: string,
  days: number,
): Promise<BuildResult<TimingSnapshot>> {
  if (!deps.x) {
    throw new Error('X API token required for self timing analysis. Run: corvus auth setup')
  }

  const user = await deps.x.getUser(handle)
  const tweets = await deps.x.getUserTweets(user.id, Math.min(days * 3, 100))

  if (tweets.length === 0) throw new Error(`No posts found for @${handle}`)

  const tweetBlock = tweets
    .map(
      (t, i) =>
        `${i + 1}. [${t.createdAt}] ${t.metrics.likes} likes, ${t.metrics.retweets} RTs, ${t.metrics.replies} replies`,
    )
    .join('\n')

  const response = await deps.grok.query(
    `Analyze when @${handle}'s posts get the most engagement from these ${tweets.length} posts:\n\n${tweetBlock}`,
    { systemPrompt: SYSTEM_PROMPT, maxTokens: 2048 },
  )

  const grok = parseGrokJson<{
    peakWindows: TimingSnapshot['peakWindows']
    recommendations: string[]
  }>(response.text)

  return {
    data: {
      handle,
      peakWindows: (grok.peakWindows ?? []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      recommendations: grok.recommendations ?? [],
      sampleSize: tweets.length,
      fetchedAt: new Date().toISOString(),
    },
    raw: response.text,
    cost: response.usage.costUsd,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    toolCalls: response.usage.toolCalls,
    tweets,
    scores: [],
    newestTweetAt: computeNewestTweetAt(tweets),
    citations: response.citations,
  }
}

async function buildTimingFromTopic(
  deps: CorvusDeps,
  topic: string,
): Promise<BuildResult<TimingSnapshot>> {
  const response = await deps.grok.query(
    `When are conversations about "${topic}" most active on X?`,
    {
      systemPrompt: TOPIC_PROMPT,
      enableXSearch: true,
      maxTokens: 2048,
    },
  )

  const grok = parseGrokJson<{
    peakWindows: TimingSnapshot['peakWindows']
    recommendations: string[]
  }>(response.text)

  return {
    data: {
      topic,
      peakWindows: (grok.peakWindows ?? []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
      recommendations: grok.recommendations ?? [],
      sampleSize: 0,
      fetchedAt: new Date().toISOString(),
    },
    raw: response.text,
    cost: response.usage.costUsd,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    toolCalls: response.usage.toolCalls,
    tweets: [],
    scores: [],
    newestTweetAt: null,
    citations: response.citations,
  }
}
