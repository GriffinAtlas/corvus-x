import { computeBaseMetrics } from '../metrics.js'
import { formatTweetsForAnalysis } from '../x-adapter.js'
import { parseGrokJson } from '../grok-adapter.js'
import type { GrokTraceResponse, TraceSnapshot } from '../schemas.js'
import type { Tweet, XUser } from '../x-adapter.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are an intelligence analyst tracing narrative spread. Analyze the tweets below and return ONLY a JSON object:
{
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "originIndex": 0,
  "phases": [{ "name": "emergence", "tweetIndices": [0, 1], "timeframe": "Mar 8 morning" }],
  "mutations": [{ "original": "original framing", "variant": "evolved framing" }]
}
Rules:
- One entry per tweet in tweetAnalysis, referenced by index.
- originIndex: index of the earliest/originating tweet, or null if unclear.
- phases: group tweets by spread phase (emergence, amplification, mainstream, etc.).
- mutations: how the narrative evolved as it spread (0-5 entries).
- Return ONLY valid JSON.`

function buildTraceData(
  tweets: Tweet[],
  grok: GrokTraceResponse,
  userMap: Map<string, XUser>,
): TraceSnapshot {
  const metrics = computeBaseMetrics(tweets)

  let origin: TraceSnapshot['origin'] = null
  if (grok.originIndex !== null && grok.originIndex >= 0 && grok.originIndex < tweets.length) {
    const t = tweets[grok.originIndex]
    const user = userMap.get(t.authorId)
    origin = {
      account: user?.username ?? t.authorId,
      date: t.createdAt,
      tweetId: t.id,
      content: t.text,
    }
  }

  const timeline = grok.phases.map((phase) => {
    const phaseTweets = phase.tweetIndices
      .filter((i) => i >= 0 && i < tweets.length)
      .map((i) => tweets[i])
    const amplifiers = phaseTweets
      .map((t) => userMap.get(t.authorId)?.username ?? t.authorId)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 5)
    return {
      phase: phase.name,
      tweetCount: phaseTweets.length,
      keyAmplifiers: amplifiers,
      timeframe: phase.timeframe,
    }
  })

  return {
    metrics,
    origin,
    timeline,
    mutations: grok.mutations,
    reach: {
      totalTweets: metrics.tweetCount,
      totalEngagement: metrics.totalEngagement,
      uniqueAuthors: metrics.uniqueAuthors,
    },
  }
}

export async function buildTraceSnapshot(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  pages = 1,
): Promise<BuildResult<TraceSnapshot>> {
  if (!deps.x) throw new Error('X API token required for trace. Run: corvus auth setup')

  const { tweets, users } = await deps.x.searchRecent(topic, maxResults, pages)
  if (tweets.length === 0) throw new Error(`No tweets found for "${topic}"`)

  const userMap = new Map(users.map((u) => [u.id, u]))
  const tweetBlock = formatTweetsForAnalysis(tweets, users)
  const response = await deps.grok.query(
    `Trace how this narrative is spreading: "${topic}"\n\nTweets:\n${tweetBlock}`,
    { systemPrompt: SYSTEM_PROMPT, maxTokens: 4096 },
  )

  const grok = parseGrokJson<GrokTraceResponse>(response.text)
  const data = buildTraceData(tweets, grok, userMap)

  const newestTweetAt =
    tweets.reduce((max, t) => {
      const ts = new Date(t.createdAt).getTime()
      return Number.isFinite(ts) && ts > max ? ts : max
    }, 0) || null

  return {
    data,
    raw: response.text,
    cost: response.usage.costUsd,
    tweets,
    scores: grok.tweetAnalysis,
    newestTweetAt,
  }
}
