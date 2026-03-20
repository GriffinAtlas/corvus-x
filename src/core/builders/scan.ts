import {
  computeBaseMetrics,
  computeSentiment,
  computeTopAccounts,
  computeNarratives,
  computeNewestTweetAt,
} from '../metrics.js'
import { formatTweetsForAnalysis } from '../x-adapter.js'
import { parseGrokJson } from '../grok-adapter.js'
import { GrokScanResponseSchema } from '../validators.js'
import {
  computeGrokOnlyMetrics,
  computeGrokOnlySentiment,
  computeGrokOnlyNarratives,
} from './grok-only.js'
import type { GrokScanResponse, ScanSnapshot } from '../schemas.js'
import type { GrokOnlyScanResponse } from './grok-only.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are an intelligence analyst. Analyze the tweets below and return ONLY a JSON object:
{
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "narratives": [{ "theme": "name", "description": "brief description" }],
  "signals": ["notable observation"]
}
Rules:
- One entry per tweet in tweetAnalysis, referenced by index.
- sentiment: -1.0 (very negative) to 1.0 (very positive).
- narrative: assign each tweet to one of 2-5 themes you identify.
- signals: 3-5 key observations about the discourse.
- Ignore spam, scam promotions, bot activity, and memecoin shills. Focus on genuine discourse.
- Return ONLY valid JSON.`

const GROK_ONLY_PROMPT = `You are an intelligence analyst. Search X for recent posts about the given topic, then analyze what you find. Ignore spam, scams, and bot activity. Return ONLY a JSON object:
{
  "tweetCount": 25,
  "uniqueAuthors": 15,
  "estimatedEngagement": 5000,
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "narratives": [{ "theme": "name", "description": "brief description" }],
  "topAccounts": [{ "handle": "username", "postCount": 3, "followers": 5000, "avgSentiment": 0.5 }],
  "signals": ["notable observation"]
}
Rules:
- Search X for recent posts. Analyze up to 50 posts.
- tweetCount/uniqueAuthors/estimatedEngagement: your best estimates from what you found.
- tweetAnalysis: one entry per post you analyzed.
- narratives: 2-5 key themes with descriptions.
- topAccounts: 3-10 most notable accounts in the conversation.
- signals: 3-5 key observations about the discourse.
- Return ONLY valid JSON.`

export async function buildScanSnapshot(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  pages = 1,
): Promise<BuildResult<ScanSnapshot>> {
  if (deps.x) {
    return buildScanFromXApi(deps, topic, maxResults, pages)
  }
  return buildScanFromGrok(deps, topic)
}

async function buildScanFromXApi(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  pages: number,
): Promise<BuildResult<ScanSnapshot>> {
  const { tweets, users } = await deps.x!.searchRecent(topic, maxResults, pages)
  if (tweets.length === 0) throw new Error(`No tweets found for "${topic}"`)

  const tweetBlock = formatTweetsForAnalysis(tweets, users)
  const response = await deps.grok.query(
    `Analyze these ${tweets.length} tweets about "${topic}":\n\n${tweetBlock}`,
    { systemPrompt: SYSTEM_PROMPT, maxTokens: 3072, responseSchema: GrokScanResponseSchema },
  )

  const grok = parseGrokJson<GrokScanResponse>(response.text)
  const metrics = computeBaseMetrics(tweets)
  const sentiment = computeSentiment(grok.tweetAnalysis, tweets)
  const topAccounts = computeTopAccounts(tweets, grok.tweetAnalysis, users)
  const narratives = computeNarratives(grok.tweetAnalysis, grok.narratives)

  return {
    data: { metrics, sentiment, topAccounts, narratives, signals: grok.signals },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets,
    scores: grok.tweetAnalysis,
    newestTweetAt: computeNewestTweetAt(tweets),
    citations: response.citations,
  }
}

async function buildScanFromGrok(
  deps: CorvusDeps,
  topic: string,
): Promise<BuildResult<ScanSnapshot>> {
  const response = await deps.grok.query(
    `Scan X discourse on: "${topic}"`,
    { systemPrompt: GROK_ONLY_PROMPT, enableXSearch: true, maxTokens: 4096 },
  )

  const grok = parseGrokJson<GrokOnlyScanResponse>(response.text)
  const metrics = computeGrokOnlyMetrics(
    grok.tweetCount,
    grok.uniqueAuthors,
    grok.estimatedEngagement,
  )
  const sentiment = computeGrokOnlySentiment(grok.tweetAnalysis)
  const narratives = computeGrokOnlyNarratives(grok.tweetAnalysis, grok.narratives)

  return {
    data: {
      metrics,
      sentiment,
      topAccounts: (grok.topAccounts ?? []).slice(0, 10),
      narratives,
      signals: grok.signals,
    },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets: [],
    scores: grok.tweetAnalysis,
    newestTweetAt: null,
    citations: response.citations,
  }
}
