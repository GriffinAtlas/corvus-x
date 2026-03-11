import {
  computeBaseMetrics,
  computeSentiment,
  computeTopPosts,
  computeNarratives,
} from '../metrics.js'
import { formatTweetsForAnalysis } from '../x-adapter.js'
import { parseGrokJson } from '../grok-adapter.js'
import type { GrokGatherResponse, GatherSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are an intelligence analyst compiling a comprehensive brief. Analyze the tweets below and return ONLY a JSON object:
{
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "narratives": [{ "theme": "name", "description": "brief description" }],
  "signals": ["notable observation"],
  "webContext": ["relevant context from web"],
  "outlook": "forward-looking assessment"
}
Rules:
- One entry per tweet in tweetAnalysis, referenced by index.
- narratives: 3-7 themes with descriptions.
- signals: 3-5 key observations.
- webContext: 2-4 items of relevant web context (news, events, developments).
- outlook: 1-2 sentence forward-looking assessment.
- Return ONLY valid JSON.`

export async function buildGatherSnapshot(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  pages = 1,
): Promise<BuildResult<GatherSnapshot>> {
  if (!deps.x) throw new Error('X API token required for gather. Run: corvus auth setup')

  const { tweets, users } = await deps.x.searchRecent(topic, maxResults, pages)
  if (tweets.length === 0) throw new Error(`No tweets found for "${topic}"`)

  const tweetBlock = formatTweetsForAnalysis(tweets, users)
  const response = await deps.grok.query(
    `Compile intelligence brief on "${topic}" from these ${tweets.length} tweets:\n\n${tweetBlock}`,
    { systemPrompt: SYSTEM_PROMPT, enableWebSearch: true, maxTokens: 6144 },
  )

  const grok = parseGrokJson<GrokGatherResponse>(response.text)
  const metrics = computeBaseMetrics(tweets)
  const sentiment = computeSentiment(grok.tweetAnalysis)
  const topPosts = computeTopPosts(tweets, users)
  const narratives = computeNarratives(grok.tweetAnalysis, grok.narratives)

  const newestTweetAt =
    tweets.reduce((max, t) => {
      const ts = new Date(t.createdAt).getTime()
      return Number.isFinite(ts) && ts > max ? ts : max
    }, 0) || null

  return {
    data: {
      metrics,
      sentiment,
      topPosts,
      narratives,
      webContext: grok.webContext,
      outlook: grok.outlook,
    },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets,
    scores: grok.tweetAnalysis,
    newestTweetAt,
  }
}
