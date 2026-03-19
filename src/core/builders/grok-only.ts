import type { BaseMetrics, SentimentBreakdown } from '../schemas.js'

export interface GrokOnlyScanResponse {
  tweetCount: number
  uniqueAuthors: number
  estimatedEngagement: number
  tweetAnalysis: { index: number; sentiment: number; narrative: string }[]
  narratives: { theme: string; description: string }[]
  topAccounts: { handle: string; postCount: number; followers: number; avgSentiment: number }[]
  signals: string[]
}

export interface GrokOnlyPulseResponse {
  tweetCount: number
  uniqueAuthors: number
  estimatedEngagement: number
  tweetAnalysis: { index: number; sentiment: number; narrative: string }[]
  bullSignals: string[]
  bearSignals: string[]
  keyVoices: { handle: string; sentiment: number; reach: number }[]
}

export interface GrokOnlyTraceResponse {
  tweetCount: number
  uniqueAuthors: number
  estimatedEngagement: number
  tweetAnalysis: { index: number; sentiment: number; narrative: string }[]
  origin: { account: string; date: string; tweetId: string; content: string } | null
  timeline: {
    phase: string
    tweetCount: number
    keyAmplifiers: string[]
    timeframe: string
  }[]
  mutations: { original: string; variant: string }[]
}


export function computeGrokOnlyMetrics(
  tweetCount: number,
  uniqueAuthors: number,
  estimatedEngagement: number,
): BaseMetrics {
  return {
    tweetCount,
    totalEngagement: estimatedEngagement,
    uniqueAuthors,
    engagementPerTweet: tweetCount > 0 ? Math.round(estimatedEngagement / tweetCount) : 0,
  }
}

export function computeGrokOnlySentiment(
  tweetAnalysis: { sentiment: number }[],
): SentimentBreakdown {
  if (tweetAnalysis.length === 0) {
    return { avg: 0, rawAvg: 0, positive: 0, neutral: 0, negative: 0 }
  }
  let positive = 0
  let neutral = 0
  let negative = 0
  let sum = 0
  for (const t of tweetAnalysis) {
    sum += t.sentiment
    if (t.sentiment > 0.2) positive++
    else if (t.sentiment < -0.2) negative++
    else neutral++
  }
  const avg = Number((sum / tweetAnalysis.length).toFixed(3))
  return {
    avg,
    rawAvg: avg,
    positive,
    neutral,
    negative,
  }
}

export function computeGrokOnlyNarratives(
  tweetAnalysis: { narrative: string; sentiment: number }[],
  narratives: { theme: string; description: string }[],
) {
  return narratives.map((n) => {
    const matching = tweetAnalysis.filter((t) => t.narrative === n.theme)
    const avgSentiment =
      matching.length > 0
        ? Number((matching.reduce((s, t) => s + t.sentiment, 0) / matching.length).toFixed(3))
        : 0
    return {
      theme: n.theme,
      description: n.description,
      tweetCount: matching.length,
      avgSentiment,
    }
  })
}
