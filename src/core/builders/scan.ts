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

const SYSTEM_PROMPT = `You are a growth advisor for X (Twitter) content creators. Analyze the tweets and return ONLY a JSON object:
{
  "takeaway": "one sentence — what's the opportunity here for a creator who wants to grow?",
  "actions": ["specific thing to do right now"],
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "narratives": [{ "theme": "name", "description": "brief description" }],
  "signals": ["notable observation"]
}
Rules:
- takeaway: one sentence for a creator. Is this topic hot? Saturated? Is there a gap they can fill?
- actions: 1-3 specific suggestions a creator can do RIGHT NOW. Include:
  * Which posts to reply to (name @handles and what the post is about)
  * What format works (are threads winning? questions? hot takes?)
  * Accounts their size (1K-20K followers) that are growing on this topic — reply to THEM, not celebrities
  * If there's a question being asked that nobody answered well — that's a content opportunity
- narratives: 2-5 themes. Note which are growing vs noise.
- signals: focus on: reply windows still open, low-competition high-visibility posts, format patterns, conversation gaps.
- Ignore spam, scams, bots, and shills.
- Return ONLY valid JSON.`

const GROK_ONLY_PROMPT = `You are a growth advisor for X (Twitter) content creators. Search X for recent posts about the given topic. Ignore spam, scams, and bots. Return ONLY a JSON object:
{
  "takeaway": "one sentence — what's the opportunity here for a creator who wants to grow?",
  "actions": ["specific thing to do right now — name real accounts and posts"],
  "tweetCount": 25,
  "uniqueAuthors": 15,
  "estimatedEngagement": 5000,
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "narratives": [{ "theme": "name", "description": "brief description" }],
  "topAccounts": [{ "handle": "username", "postCount": 3, "followers": 5000, "avgSentiment": 0.5 }],
  "signals": ["notable observation"]
}
Rules:
- takeaway: one sentence. Is this topic hot? Is there a gap?
- actions: 1-3 things a creator can do NOW. Name @handles. Suggest reply targets in the 1K-20K follower range. Note what format is working.
- Search X for recent posts. Analyze up to 50.
- narratives: 2-5 themes. Which are growing?
- topAccounts: 3-10 accounts — prioritize growing accounts (1K-20K) over celebrities.
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
    data: { takeaway: grok.takeaway ?? '', actions: grok.actions ?? [], metrics, sentiment, topAccounts, narratives, signals: grok.signals },
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
      takeaway: grok.takeaway ?? '',
      actions: grok.actions ?? [],
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
