import { computeBaseMetrics, computeSentiment, computeKeyVoices, computeNewestTweetAt } from '../metrics.js'
import { formatTweetsForAnalysis } from '../x-adapter.js'
import { parseGrokJson } from '../grok-adapter.js'
import { GrokPulseResponseSchema } from '../validators.js'
import { computeGrokOnlyMetrics, computeGrokOnlySentiment } from './grok-only.js'
import type { PulseSnapshot } from '../schemas.js'
import type { GrokOnlyPulseResponse } from './grok-only.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are a sentiment analyst advising a content creator. Analyze the tweets and return ONLY a JSON object:
{
  "takeaway": "one sentence — is sentiment bullish, bearish, or contested? What should someone posting about this know?",
  "actions": ["specific suggestion based on the sentiment"],
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "bullSignals": ["positive signal"],
  "bearSignals": ["negative signal"]
}
Rules:
- takeaway: one direct sentence. Is momentum shifting? Is there a contrarian opportunity?
- actions: 1-2 specific suggestions. "Post a contrarian take on X because..." or "Avoid this topic, it's all noise."
- bullSignals: 2-5 reasons for optimism.
- bearSignals: 2-5 reasons for concern.
- Ignore spam, bots, and shills.
- Return ONLY valid JSON.`

const GROK_ONLY_PROMPT = `You are an intelligence analyst reading market/social pulse. Search X for recent posts about the given topic, then analyze sentiment. Ignore spam and bot activity. Return ONLY a JSON object:
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
    { systemPrompt: SYSTEM_PROMPT, maxTokens: 3072, responseSchema: GrokPulseResponseSchema },
  )

  const grok = parseGrokJson(response.text, GrokPulseResponseSchema)
  const metrics = computeBaseMetrics(tweets)
  const sentiment = computeSentiment(grok.tweetAnalysis, tweets)
  const keyVoices = computeKeyVoices(tweets, grok.tweetAnalysis, users)

  return {
    data: { takeaway: grok.takeaway, actions: grok.actions, metrics, sentiment, bullSignals: grok.bullSignals, bearSignals: grok.bearSignals, keyVoices },
    raw: response.text,
    cost: response.usage.costUsd,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    toolCalls: response.usage.toolCalls,
    tweets,
    scores: grok.tweetAnalysis,
    newestTweetAt: computeNewestTweetAt(tweets),
    citations: response.citations,
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
      takeaway: grok.takeaway ?? '',
      actions: grok.actions ?? [],
      metrics,
      sentiment,
      bullSignals: grok.bullSignals,
      bearSignals: grok.bearSignals,
      keyVoices: (grok.keyVoices ?? []).slice(0, 10),
    },
    raw: response.text,
    cost: response.usage.costUsd,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    toolCalls: response.usage.toolCalls,
    tweets: [],
    scores: grok.tweetAnalysis,
    newestTweetAt: null,
    citations: response.citations,
  }
}
