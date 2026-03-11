import type { Tweet, XUser } from './x-adapter.js'
import type {
  GrokTweetScore,
  GrokNarrative,
  BaseMetrics,
  SentimentBreakdown,
  AccountEntry,
  NarrativeEntry,
} from './schemas.js'

export function computeBaseMetrics(tweets: Tweet[]): BaseMetrics {
  const tweetCount = tweets.length
  const totalEngagement = tweets.reduce(
    (sum, t) => sum + t.metrics.likes + t.metrics.retweets + t.metrics.replies,
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

  for (const tweet of tweets) {
    const existing = authorStats.get(tweet.authorId) ?? { count: 0, sentimentSum: 0, authorId: tweet.authorId }
    existing.count++

    const score = scores.find((s) => s.index < tweets.length && tweets[s.index]?.authorId === tweet.authorId)
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
      avgSentiment: stats.count > 0 ? Math.round((stats.sentimentSum / stats.count) * 100) / 100 : 0,
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
      avgSentiment: stats.count > 0 ? Math.round((stats.sentimentSum / stats.count) * 100) / 100 : 0,
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
      engagement: t.metrics.likes + t.metrics.retweets + t.metrics.replies,
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

  const voiceMap = new Map<string, { sentimentSum: number; count: number; reach: number; handle: string }>()

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
