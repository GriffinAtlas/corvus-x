import {
  computeBaseMetrics,
  computeSentiment,
  computeTopAccounts,
  computeNarratives,
} from '../metrics.js'
import { formatTweetsForAnalysis } from '../x-adapter.js'
import { parseGrokJson } from '../grok-adapter.js'
import type { GrokScanResponse, ScanSnapshot } from '../schemas.js'
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
- Return ONLY valid JSON.`

export async function buildScanSnapshot(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  pages = 1,
): Promise<BuildResult<ScanSnapshot>> {
  if (!deps.x) throw new Error('X API token required for scan. Run: corvus auth setup')

  const { tweets, users } = await deps.x.searchRecent(topic, maxResults, pages)
  if (tweets.length === 0) throw new Error(`No tweets found for "${topic}"`)

  const tweetBlock = formatTweetsForAnalysis(tweets, users)
  const response = await deps.grok.query(
    `Analyze these ${tweets.length} tweets about "${topic}":\n\n${tweetBlock}`,
    { systemPrompt: SYSTEM_PROMPT, maxTokens: 3072 },
  )

  const grok = parseGrokJson<GrokScanResponse>(response.text)
  const metrics = computeBaseMetrics(tweets)
  const sentiment = computeSentiment(grok.tweetAnalysis)
  const topAccounts = computeTopAccounts(tweets, grok.tweetAnalysis, users)
  const narratives = computeNarratives(grok.tweetAnalysis, grok.narratives)

  const newestTweetAt =
    tweets.reduce((max, t) => {
      const ts = new Date(t.createdAt).getTime()
      return Number.isFinite(ts) && ts > max ? ts : max
    }, 0) || null

  return {
    data: { metrics, sentiment, topAccounts, narratives, signals: grok.signals },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets,
    scores: grok.tweetAnalysis,
    newestTweetAt,
  }
}
