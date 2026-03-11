import {
  computeBaseMetrics,
  computeSentiment,
  computeTopPosts,
  computeNarratives,
} from '../metrics.js'
import { formatTweetsForAnalysis } from '../x-adapter.js'
import { parseGrokJson } from '../grok-adapter.js'
import {
  computeGrokOnlyMetrics,
  computeGrokOnlySentiment,
  computeGrokOnlyNarratives,
} from './grok-only.js'
import type { GrokGatherResponse, GatherSnapshot } from '../schemas.js'
import type { GrokOnlyGatherResponse } from './grok-only.js'
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

const GROK_ONLY_PROMPT = `You are an intelligence analyst compiling a comprehensive brief. Search X for recent posts about the given topic, also search the web for relevant context. Then analyze what you find. Return ONLY a JSON object:
{
  "tweetCount": 25,
  "uniqueAuthors": 15,
  "estimatedEngagement": 5000,
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "narratives": [{ "theme": "name", "description": "brief description" }],
  "topPosts": [{ "id": "123", "author": "username", "text": "post content", "engagement": 500 }],
  "signals": ["notable observation"],
  "webContext": ["relevant context from web"],
  "outlook": "forward-looking assessment"
}
Rules:
- Search X for recent posts. Also search the web for relevant context.
- tweetCount/uniqueAuthors/estimatedEngagement: your best estimates.
- tweetAnalysis: one entry per post analyzed.
- narratives: 3-7 themes with descriptions.
- topPosts: 3-5 most notable posts with engagement.
- signals: 3-5 key observations.
- webContext: 2-4 items of relevant web/news context.
- outlook: 1-2 sentence forward-looking assessment.
- Return ONLY valid JSON.`

export async function buildGatherSnapshot(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  pages = 1,
): Promise<BuildResult<GatherSnapshot>> {
  if (deps.x) {
    return buildGatherFromXApi(deps, topic, maxResults, pages)
  }
  return buildGatherFromGrok(deps, topic)
}

async function buildGatherFromXApi(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  pages: number,
): Promise<BuildResult<GatherSnapshot>> {
  const { tweets, users } = await deps.x!.searchRecent(topic, maxResults, pages)
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

async function buildGatherFromGrok(
  deps: CorvusDeps,
  topic: string,
): Promise<BuildResult<GatherSnapshot>> {
  const response = await deps.grok.query(
    `Compile intelligence brief on: "${topic}"`,
    { systemPrompt: GROK_ONLY_PROMPT, enableXSearch: true, enableWebSearch: true, maxTokens: 6144 },
  )

  const grok = parseGrokJson<GrokOnlyGatherResponse>(response.text)
  const metrics = computeGrokOnlyMetrics(grok.tweetCount, grok.uniqueAuthors, grok.estimatedEngagement)
  const sentiment = computeGrokOnlySentiment(grok.tweetAnalysis)
  const narratives = computeGrokOnlyNarratives(grok.tweetAnalysis, grok.narratives)

  return {
    data: {
      metrics,
      sentiment,
      topPosts: (grok.topPosts ?? []).slice(0, 10),
      narratives,
      webContext: grok.webContext ?? [],
      outlook: grok.outlook ?? '',
    },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets: [],
    scores: grok.tweetAnalysis,
    newestTweetAt: null,
  }
}
