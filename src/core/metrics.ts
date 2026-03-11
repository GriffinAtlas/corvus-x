import type { Tweet, XUser } from './x-adapter.js'
import type {
  GrokTweetScore,
  GrokNarrative,
  BaseMetrics,
  SentimentBreakdown,
  AccountEntry,
  NarrativeEntry,
  ConfidenceScore,
  ScanSnapshot,
  PulseSnapshot,
  GatherSnapshot,
} from './schemas.js'
import type { Snapshot } from './schemas.js'

export function computeBaseMetrics(tweets: Tweet[]): BaseMetrics {
  const tweetCount = tweets.length
  const totalEngagement = tweets.reduce(
    (sum, t) =>
      sum + t.metrics.likes + t.metrics.retweets + t.metrics.replies + t.metrics.impressions,
    0,
  )
  const uniqueAuthors = new Set(tweets.map((t) => t.authorId)).size
  return {
    tweetCount,
    totalEngagement,
    uniqueAuthors,
    engagementPerTweet: tweetCount > 0 ? Math.round(totalEngagement / tweetCount) : 0,
  }
}

export function computeSentiment(scores: GrokTweetScore[]): SentimentBreakdown {
  if (scores.length === 0) {
    return { avg: 0, positive: 0, neutral: 0, negative: 0 }
  }

  let positive = 0
  let neutral = 0
  let negative = 0
  let total = 0

  for (const s of scores) {
    const clamped = Math.max(-1, Math.min(1, s.sentiment))
    total += clamped
    if (clamped > 0.3) positive++
    else if (clamped < -0.3) negative++
    else neutral++
  }

  return {
    avg: Math.round((total / scores.length) * 100) / 100,
    positive,
    neutral,
    negative,
  }
}

export function computeTopAccounts(
  tweets: Tweet[],
  scores: GrokTweetScore[],
  users: XUser[],
  limit = 10,
): AccountEntry[] {
  const userMap = new Map<string, XUser>()
  for (const u of users) userMap.set(u.id, u)

  const authorStats = new Map<string, { count: number; sentimentSum: number; authorId: string }>()

  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i]
    const existing = authorStats.get(tweet.authorId) ?? {
      count: 0,
      sentimentSum: 0,
      authorId: tweet.authorId,
    }
    existing.count++

    const score = scores.find((s) => s.index === i)
    if (score) existing.sentimentSum += score.sentiment

    authorStats.set(tweet.authorId, existing)
  }

  const entries: AccountEntry[] = []
  for (const [authorId, stats] of authorStats) {
    const user = userMap.get(authorId)
    entries.push({
      handle: user?.username ?? authorId,
      postCount: stats.count,
      followers: user?.followersCount ?? 0,
      avgSentiment:
        stats.count > 0 ? Math.round((stats.sentimentSum / stats.count) * 100) / 100 : 0,
    })
  }

  return entries
    .sort((a, b) => b.postCount - a.postCount || b.followers - a.followers)
    .slice(0, limit)
}

export function computeNarratives(
  scores: GrokTweetScore[],
  narratives: GrokNarrative[],
): NarrativeEntry[] {
  const themeMap = new Map<string, { count: number; sentimentSum: number; description: string }>()

  for (const n of narratives) {
    themeMap.set(n.theme, { count: 0, sentimentSum: 0, description: n.description })
  }

  for (const s of scores) {
    const existing = themeMap.get(s.narrative)
    if (existing) {
      existing.count++
      existing.sentimentSum += s.sentiment
    } else {
      themeMap.set(s.narrative, { count: 1, sentimentSum: s.sentiment, description: s.narrative })
    }
  }

  const entries: NarrativeEntry[] = []
  for (const [theme, stats] of themeMap) {
    entries.push({
      theme,
      description: stats.description,
      tweetCount: stats.count,
      avgSentiment:
        stats.count > 0 ? Math.round((stats.sentimentSum / stats.count) * 100) / 100 : 0,
    })
  }

  return entries.sort((a, b) => b.tweetCount - a.tweetCount)
}

export function computeTopPosts(
  tweets: Tweet[],
  users: XUser[],
  limit = 5,
): { id: string; author: string; text: string; engagement: number }[] {
  const userMap = new Map<string, XUser>()
  for (const u of users) userMap.set(u.id, u)

  return tweets
    .map((t) => ({
      id: t.id,
      author: userMap.get(t.authorId)?.username ?? t.authorId,
      text: t.text.length > 200 ? t.text.slice(0, 200) + '...' : t.text,
      engagement: t.metrics.likes + t.metrics.retweets + t.metrics.replies + t.metrics.impressions,
    }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, limit)
}

export function computeKeyVoices(
  tweets: Tweet[],
  scores: GrokTweetScore[],
  users: XUser[],
  limit = 10,
): { handle: string; sentiment: number; reach: number }[] {
  const userMap = new Map<string, XUser>()
  for (const u of users) userMap.set(u.id, u)

  const voiceMap = new Map<
    string,
    { sentimentSum: number; count: number; reach: number; handle: string }
  >()

  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i]
    const score = scores.find((s) => s.index === i)
    const user = userMap.get(tweet.authorId)
    const handle = user?.username ?? tweet.authorId
    const existing = voiceMap.get(handle) ?? {
      sentimentSum: 0,
      count: 0,
      reach: user?.followersCount ?? 0,
      handle,
    }
    existing.count++
    if (score) existing.sentimentSum += score.sentiment
    voiceMap.set(handle, existing)
  }

  return Array.from(voiceMap.values())
    .map((v) => ({
      handle: v.handle,
      sentiment: v.count > 0 ? Math.round((v.sentimentSum / v.count) * 100) / 100 : 0,
      reach: v.reach,
    }))
    .sort((a, b) => b.reach - a.reach)
    .slice(0, limit)
}

export function computeConfidence(
  allTweets: Tweet[],
  allScores: GrokTweetScore[],
): ConfidenceScore {
  if (allScores.length === 0) {
    return { overall: 0, volume: 'low', consistency: 0, diversity: 0 }
  }

  const volume = allTweets.length < 30 ? 'low' : allTweets.length < 100 ? 'moderate' : 'high'
  const sentiments = allScores.map((s) => s.sentiment)
  const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length
  const consistency = Math.sqrt(
    sentiments.reduce((sum, s) => sum + (s - mean) ** 2, 0) / sentiments.length,
  )
  const uniqueAuthors = new Set(allTweets.map((tw) => tw.authorId)).size
  const diversity = allTweets.length > 0 ? uniqueAuthors / allTweets.length : 0

  const volumeScore = allTweets.length < 30 ? 0.3 : allTweets.length < 100 ? 0.6 : 0.9
  const consistencyScore = Math.max(0, 1 - consistency)
  const diversityScore = Math.min(1, diversity * 2)
  const overall = Number(
    (volumeScore * 0.4 + consistencyScore * 0.3 + diversityScore * 0.3).toFixed(2),
  )

  return {
    overall,
    volume,
    consistency: Number(consistency.toFixed(3)),
    diversity: Number(diversity.toFixed(3)),
  }
}

interface StepForContradictions {
  command: string
  snapshot: Snapshot
  tweets: Tweet[]
  scores: GrokTweetScore[]
}

function hasSentiment(snap: Snapshot): snap is ScanSnapshot | PulseSnapshot | GatherSnapshot {
  return (
    'sentiment' in snap &&
    typeof (snap as { sentiment?: { avg?: number } }).sentiment?.avg === 'number'
  )
}

export function detectContradictions(results: StepForContradictions[]): string[] {
  const contradictions: string[] = []

  const sentimentSteps = results.filter((r) => hasSentiment(r.snapshot))
  for (let i = 0; i < sentimentSteps.length; i++) {
    for (let j = i + 1; j < sentimentSteps.length; j++) {
      const a = sentimentSteps[i]
      const b = sentimentSteps[j]
      const aAvg = (a.snapshot as ScanSnapshot | PulseSnapshot | GatherSnapshot).sentiment.avg
      const bAvg = (b.snapshot as ScanSnapshot | PulseSnapshot | GatherSnapshot).sentiment.avg
      if (Math.abs(aAvg - bAvg) > 0.3) {
        const fmt = (v: number) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))
        contradictions.push(
          `${a.command} sentiment (${fmt(aAvg)}) diverges from ${b.command} (${fmt(bAvg)}) on the same topic`,
        )
      }
    }
  }

  for (const r of results) {
    if (r.tweets.length === 0 || r.scores.length === 0) continue
    if (!hasSentiment(r.snapshot)) continue

    const crowdAvg = (r.snapshot as ScanSnapshot | PulseSnapshot | GatherSnapshot).sentiment.avg

    const authorReach = new Map<string, { sentimentSum: number; count: number; reach: number }>()
    for (let i = 0; i < r.tweets.length; i++) {
      const tw = r.tweets[i]
      const score = r.scores.find((s) => s.index === i)
      const existing = authorReach.get(tw.authorId) ?? { sentimentSum: 0, count: 0, reach: 0 }
      existing.count++
      existing.reach = Math.max(
        existing.reach,
        tw.metrics.likes + tw.metrics.retweets + tw.metrics.replies + tw.metrics.impressions,
      )
      if (score) existing.sentimentSum += score.sentiment
      authorReach.set(tw.authorId, existing)
    }

    const topAuthors = Array.from(authorReach.values())
      .sort((a, b) => b.reach - a.reach)
      .slice(0, 3)

    if (topAuthors.length < 2) continue

    const topAvg =
      topAuthors.reduce((sum, a) => sum + (a.count > 0 ? a.sentimentSum / a.count : 0), 0) /
      topAuthors.length

    if (Math.abs(topAvg - crowdAvg) > 0.3) {
      const fmtSentiment = (v: number) => (v >= 0 ? 'bullish' : 'bearish')
      const fmt = (v: number) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))
      contradictions.push(
        `Top ${topAuthors.length} accounts ${fmtSentiment(topAvg)} (${fmt(topAvg)} avg) against ${fmtSentiment(crowdAvg)} crowd consensus (${fmt(crowdAvg)})`,
      )
    }
  }

  for (const r of results) {
    if (r.command !== 'pulse') continue
    const snap = r.snapshot as PulseSnapshot
    if (!Array.isArray(snap.bullSignals) || !Array.isArray(snap.bearSignals)) continue
    if (snap.bullSignals.length >= 3 && snap.bearSignals.length >= 3) {
      contradictions.push(
        `Strong bull signals (${snap.bullSignals.length}) and bear signals (${snap.bearSignals.length}) both present — market is contested`,
      )
    }
  }

  for (const r of results) {
    if (!('narratives' in r.snapshot)) continue
    if (!hasSentiment(r.snapshot)) continue
    const snap = r.snapshot as ScanSnapshot | GatherSnapshot
    if (snap.narratives.length === 0) continue

    const dominant = snap.narratives[0] // already sorted by tweetCount descending
    const overallAvg = snap.sentiment.avg
    if (
      dominant.avgSentiment !== 0 &&
      overallAvg !== 0 &&
      Math.sign(dominant.avgSentiment) !== Math.sign(overallAvg)
    ) {
      const fmt = (v: number) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))
      const label = dominant.avgSentiment < 0 ? 'bearish' : 'bullish'
      contradictions.push(
        `Dominant narrative '${dominant.theme}' is ${label} (${fmt(dominant.avgSentiment)}) but overall sentiment is ${overallAvg >= 0 ? 'positive' : 'negative'} (${fmt(overallAvg)})`,
      )
    }
  }

  return contradictions
}
