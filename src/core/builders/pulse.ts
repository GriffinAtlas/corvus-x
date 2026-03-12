import { computeBaseMetrics, computeSentiment, computeKeyVoices, computeNewestTweetAt } from '../metrics.js'
import { formatTweetsForAnalysis } from '../x-adapter.js'
import { parseGrokJson } from '../grok-adapter.js'
import { computeGrokOnlyMetrics, computeGrokOnlySentiment } from './grok-only.js'
import type { GrokPulseResponse, PulseSnapshot } from '../schemas.js'
import type { GrokOnlyPulseResponse } from './grok-only.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are an intelligence analyst reading market/social pulse. Analyze the tweets below and return ONLY a JSON object:
{
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "bullSignals": ["positive signal"],
  "bearSignals": ["negative signal"]
}
Rules:
- One entry per tweet in tweetAnalysis, referenced by index.
- sentiment: -1.0 to 1.0.
- narrative: assign each tweet to a theme.
- bullSignals: 2-5 reasons for optimism found in the discourse.
- bearSignals: 2-5 reasons for concern found in the discourse.
- Return ONLY valid JSON.`

const GROK_ONLY_PROMPT = `You are an intelligence analyst reading market/social pulse. Search X for recent posts about the given topic, then analyze sentiment. Return ONLY a JSON object:
{
  "tweetCount": 25,
  "uniqueAuthors": 15,
  "estimatedEngagement": 5000,
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "bullSignals": ["positive signal"],
  "bearSignals": ["negative signal"],
  "keyVoices": [{ "handle": "username", "sentiment": 0.5, "reach": 10000 }]
}
Rules:
- Search X for recent posts. Analyze up to 50 posts.
- tweetCount/uniqueAuthors/estimatedEngagement: your best estimates.
- tweetAnalysis: one entry per post analyzed.
- bullSignals: 2-5 reasons for optimism.
- bearSignals: 2-5 reasons for concern.
- keyVoices: 3-8 most influential voices with their stance.
- Return ONLY valid JSON.`

export async function buildPulseSnapshot(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  pages = 1,
): Promise<BuildResult<PulseSnapshot>> {
  if (deps.x) {
    return buildPulseFromXApi(deps, topic, maxResults, pages)
  }
  return buildPulseFromGrok(deps, topic)
}

async function buildPulseFromXApi(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  pages: number,
): Promise<BuildResult<PulseSnapshot>> {
  const { tweets, users } = await deps.x!.searchRecent(topic, maxResults, pages)
  if (tweets.length === 0) throw new Error(`No tweets found for "${topic}"`)

  const tweetBlock = formatTweetsForAnalysis(tweets, users)
  const response = await deps.grok.query(
    `Read the pulse on "${topic}" from these ${tweets.length} tweets:\n\n${tweetBlock}`,
    { systemPrompt: SYSTEM_PROMPT, maxTokens: 3072 },
  )

  const grok = parseGrokJson<GrokPulseResponse>(response.text)
  const metrics = computeBaseMetrics(tweets)
  const sentiment = computeSentiment(grok.tweetAnalysis)
  const keyVoices = computeKeyVoices(tweets, grok.tweetAnalysis, users)

  return {
    data: { metrics, sentiment, bullSignals: grok.bullSignals, bearSignals: grok.bearSignals, keyVoices },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets,
    scores: grok.tweetAnalysis,
    newestTweetAt: computeNewestTweetAt(tweets),
    citations: [],
  }
}

async function buildPulseFromGrok(
  deps: CorvusDeps,
  topic: string,
): Promise<BuildResult<PulseSnapshot>> {
  const response = await deps.grok.query(
    `Read the pulse on: "${topic}"`,
    { systemPrompt: GROK_ONLY_PROMPT, enableXSearch: true, maxTokens: 4096 },
  )

  const grok = parseGrokJson<GrokOnlyPulseResponse>(response.text)
  const metrics = computeGrokOnlyMetrics(grok.tweetCount, grok.uniqueAuthors, grok.estimatedEngagement)
  const sentiment = computeGrokOnlySentiment(grok.tweetAnalysis)

  return {
    data: {
      metrics,
      sentiment,
      bullSignals: grok.bullSignals,
      bearSignals: grok.bearSignals,
      keyVoices: (grok.keyVoices ?? []).slice(0, 10),
    },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets: [],
    scores: grok.tweetAnalysis,
    newestTweetAt: null,
    citations: [],
  }
}
