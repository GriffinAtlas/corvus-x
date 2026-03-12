import { describe, it, expect } from 'vitest'
import {
  computeBaseMetrics,
  computeSentiment,
  computeTopAccounts,
  computeNarratives,
  computeTopPosts,
  computeKeyVoices,
  computeConfidence,
  detectContradictions,
  toUserMap,
  computeNewestTweetAt,
  X_ENGAGEMENT_WEIGHTS,
  computeEngagementScore,
} from '../../src/core/metrics.js'
import type { Tweet, XUser } from '../../src/core/x-adapter.js'
import type { GrokTweetScore, GrokNarrative } from '../../src/core/schemas.js'
import type { ScanSnapshot, PulseSnapshot, Snapshot } from '../../src/core/schemas.js'

function makeTweet(overrides: Partial<Tweet> & { id: string; authorId: string }): Tweet {
  return {
    text: 'default tweet text',
    createdAt: '2026-03-10T00:00:00Z',
    metrics: { likes: 10, retweets: 5, replies: 3, impressions: 100 },
    ...overrides,
  } as Tweet
}

function makeUser(overrides: Partial<XUser> & { id: string; username: string }): XUser {
  return {
    name: overrides.username,
    description: '',
    followersCount: 1000,
    followingCount: 200,
    tweetCount: 500,
    verified: false,
    ...overrides,
  } as XUser
}

describe('computeBaseMetrics', () => {
  it('returns zeroes for empty array', () => {
    const result = computeBaseMetrics([])
    expect(result).toEqual({
      tweetCount: 0,
      totalEngagement: 0,
      uniqueAuthors: 0,
      engagementPerTweet: 0,
    })
  })

  it('computes metrics for a single tweet', () => {
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'a',
        metrics: { likes: 10, retweets: 5, replies: 3, impressions: 100 },
      }),
    ]
    const result = computeBaseMetrics(tweets)
    expect(result.tweetCount).toBe(1)
    // 10 + 5 + 3 + 100 = 118
    expect(result.totalEngagement).toBe(118)
    expect(result.uniqueAuthors).toBe(1)
    expect(result.engagementPerTweet).toBe(118)
  })

  it('computes metrics for multiple tweets with distinct authors', () => {
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'a',
        metrics: { likes: 10, retweets: 2, replies: 0, impressions: 50 },
      }),
      makeTweet({
        id: '2',
        authorId: 'b',
        metrics: { likes: 4, retweets: 1, replies: 1, impressions: 30 },
      }),
      makeTweet({
        id: '3',
        authorId: 'c',
        metrics: { likes: 0, retweets: 0, replies: 0, impressions: 10 },
      }),
    ]
    const result = computeBaseMetrics(tweets)
    expect(result.tweetCount).toBe(3)
    // (10+2+0+50) + (4+1+1+30) + (0+0+0+10) = 62+36+10 = 108
    expect(result.totalEngagement).toBe(108)
    expect(result.uniqueAuthors).toBe(3)
    expect(result.engagementPerTweet).toBe(36)
  })

  it('counts unique authors correctly when same author has multiple tweets', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a' }),
      makeTweet({ id: '2', authorId: 'a' }),
      makeTweet({ id: '3', authorId: 'b' }),
    ]
    const result = computeBaseMetrics(tweets)
    expect(result.uniqueAuthors).toBe(2)
  })

  it('rounds engagementPerTweet correctly', () => {
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'a',
        metrics: { likes: 1, retweets: 0, replies: 0, impressions: 5 },
      }),
      makeTweet({
        id: '2',
        authorId: 'b',
        metrics: { likes: 0, retweets: 0, replies: 0, impressions: 5 },
      }),
      makeTweet({
        id: '3',
        authorId: 'c',
        metrics: { likes: 1, retweets: 0, replies: 0, impressions: 5 },
      }),
    ]
    const result = computeBaseMetrics(tweets)
    // total = (1+5) + (0+5) + (1+5) = 17, count = 3, 17/3 = 5.666... rounds to 6
    expect(result.engagementPerTweet).toBe(Math.round(17 / 3))
  })

  it('handles tweets with zero engagement', () => {
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'a',
        metrics: { likes: 0, retweets: 0, replies: 0, impressions: 0 },
      }),
      makeTweet({
        id: '2',
        authorId: 'b',
        metrics: { likes: 0, retweets: 0, replies: 0, impressions: 0 },
      }),
    ]
    const result = computeBaseMetrics(tweets)
    expect(result.totalEngagement).toBe(0)
    expect(result.engagementPerTweet).toBe(0)
  })
})

describe('computeSentiment', () => {
  it('returns zeroes for empty array', () => {
    const result = computeSentiment([])
    expect(result).toEqual({ avg: 0, rawAvg: 0, positive: 0, neutral: 0, negative: 0 })
  })

  it('classifies positive, neutral, and negative sentiments', () => {
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.8, narrative: 'test' },
      { index: 1, sentiment: 0.0, narrative: 'test' },
      { index: 2, sentiment: -0.5, narrative: 'test' },
    ]
    const result = computeSentiment(scores)
    expect(result.positive).toBe(1)
    expect(result.neutral).toBe(1)
    expect(result.negative).toBe(1)
  })

  it('clamps sentiment values beyond [-1, 1]', () => {
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 5.0, narrative: 'test' },
      { index: 1, sentiment: -3.0, narrative: 'test' },
    ]
    const result = computeSentiment(scores)
    // clamped to 1 and -1, avg = (1 + -1) / 2 = 0
    expect(result.avg).toBe(0)
    expect(result.positive).toBe(1)
    expect(result.negative).toBe(1)
  })

  it('treats boundary values at 0.3 and -0.3 as neutral', () => {
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.3, narrative: 'test' },
      { index: 1, sentiment: -0.3, narrative: 'test' },
    ]
    const result = computeSentiment(scores)
    expect(result.neutral).toBe(2)
    expect(result.positive).toBe(0)
    expect(result.negative).toBe(0)
  })

  it('rounds avg to two decimal places', () => {
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.1, narrative: 'a' },
      { index: 1, sentiment: 0.2, narrative: 'a' },
      { index: 2, sentiment: 0.3, narrative: 'a' },
    ]
    const result = computeSentiment(scores)
    // avg = (0.1 + 0.2 + 0.3) / 3 = 0.2
    expect(result.avg).toBe(0.2)
  })

  it('handles single score', () => {
    const scores: GrokTweetScore[] = [{ index: 0, sentiment: 0.7, narrative: 'x' }]
    const result = computeSentiment(scores)
    expect(result.avg).toBe(0.7)
    expect(result.positive).toBe(1)
    expect(result.neutral).toBe(0)
    expect(result.negative).toBe(0)
  })
})

describe('computeTopAccounts', () => {
  it('returns empty array when no tweets', () => {
    const result = computeTopAccounts([], [], [])
    expect(result).toEqual([])
  })

  it('groups tweets by author and sorts by engagement score', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a' }),
      makeTweet({ id: '2', authorId: 'a' }),
      makeTweet({ id: '3', authorId: 'b' }),
    ]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.5, narrative: 'x' },
      { index: 1, sentiment: 0.3, narrative: 'x' },
      { index: 2, sentiment: -0.1, narrative: 'x' },
    ]
    const users: XUser[] = [
      makeUser({ id: 'a', username: 'alice', followersCount: 500 }),
      makeUser({ id: 'b', username: 'bob', followersCount: 2000 }),
    ]
    const result = computeTopAccounts(tweets, scores, users)
    // alice has 2 tweets with default metrics (10L+5RT+3R each): 2*(10+50+40.5) = 201
    // bob has 1 tweet: 10+50+40.5 = 100.5
    // alice first by higher engagement score
    expect(result[0].handle).toBe('alice')
    expect(result[0].postCount).toBe(2)
    expect(result[1].handle).toBe('bob')
    expect(result[1].postCount).toBe(1)
  })

  it('falls back to authorId when user not in array', () => {
    const tweets = [makeTweet({ id: '1', authorId: 'unknown-123' })]
    const scores: GrokTweetScore[] = [{ index: 0, sentiment: 0.0, narrative: 'x' }]
    const result = computeTopAccounts(tweets, scores, [])
    expect(result[0].handle).toBe('unknown-123')
  })

  it('respects the limit parameter', () => {
    const tweets = Array.from({ length: 15 }, (_, i) =>
      makeTweet({ id: String(i), authorId: `author-${i}` }),
    )
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0, narrative: 'x' }))
    const result = computeTopAccounts(tweets, scores, [], 5)
    expect(result.length).toBe(5)
  })

  it('sums correct per-tweet sentiment for multi-tweet authors', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a' }),
      makeTweet({ id: '2', authorId: 'a' }),
      makeTweet({ id: '3', authorId: 'b' }),
    ]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.2, narrative: 'x' },
      { index: 1, sentiment: 0.8, narrative: 'x' },
      { index: 2, sentiment: -0.4, narrative: 'x' },
    ]
    const users: XUser[] = [
      makeUser({ id: 'a', username: 'alice', followersCount: 500 }),
      makeUser({ id: 'b', username: 'bob', followersCount: 2000 }),
    ]
    const result = computeTopAccounts(tweets, scores, users)
    const alice = result.find((r) => r.handle === 'alice')!
    const bob = result.find((r) => r.handle === 'bob')!
    // alice: (0.2 + 0.8) / 2 = 0.5
    expect(alice.avgSentiment).toBe(0.5)
    // bob: -0.4 / 1 = -0.4
    expect(bob.avgSentiment).toBe(-0.4)
  })

  it('sorts by followers when engagement scores are equal', () => {
    const tweets = [makeTweet({ id: '1', authorId: 'a' }), makeTweet({ id: '2', authorId: 'b' })]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0, narrative: 'x' },
      { index: 1, sentiment: 0, narrative: 'x' },
    ]
    const users: XUser[] = [
      makeUser({ id: 'a', username: 'lowreach', followersCount: 50 }),
      makeUser({ id: 'b', username: 'highreach', followersCount: 50000 }),
    ]
    const result = computeTopAccounts(tweets, scores, users)
    // Same default metrics => same engagement score, so sorted by followers desc
    expect(result[0].handle).toBe('highreach')
    expect(result[1].handle).toBe('lowreach')
  })
})

describe('computeNarratives', () => {
  it('returns empty array when no scores', () => {
    const result = computeNarratives([], [])
    expect(result).toEqual([])
  })

  it('groups scores by narrative theme and sorts by tweet count', () => {
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.5, narrative: 'AI hype' },
      { index: 1, sentiment: 0.3, narrative: 'AI hype' },
      { index: 2, sentiment: -0.2, narrative: 'regulation' },
    ]
    const narratives: GrokNarrative[] = [
      { theme: 'AI hype', description: 'People excited about AI' },
      { theme: 'regulation', description: 'Government regulation talk' },
    ]
    const result = computeNarratives(scores, narratives)
    expect(result[0].theme).toBe('AI hype')
    expect(result[0].tweetCount).toBe(2)
    expect(result[1].theme).toBe('regulation')
    expect(result[1].tweetCount).toBe(1)
  })

  it('creates entry from score narrative not in narratives array', () => {
    const scores: GrokTweetScore[] = [{ index: 0, sentiment: 0.1, narrative: 'unknown-theme' }]
    const result = computeNarratives(scores, [])
    expect(result.length).toBe(1)
    expect(result[0].theme).toBe('unknown-theme')
    expect(result[0].tweetCount).toBe(1)
  })
})

describe('computeTopPosts', () => {
  it('returns empty array for no tweets', () => {
    const result = computeTopPosts([], [])
    expect(result).toEqual([])
  })

  it('sorts by weighted engagement descending', () => {
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'a',
        metrics: { likes: 1, retweets: 0, replies: 0, impressions: 10 },
      }),
      makeTweet({
        id: '2',
        authorId: 'b',
        metrics: { likes: 100, retweets: 50, replies: 20, impressions: 1000 },
      }),
    ]
    const users: XUser[] = [
      makeUser({ id: 'a', username: 'alice' }),
      makeUser({ id: 'b', username: 'bob' }),
    ]
    const result = computeTopPosts(tweets, users)
    expect(result[0].id).toBe('2')
    // 100*1 + 50*10 + 20*13.5 = 100 + 500 + 270 = 870
    expect(result[0].engagement).toBe(870)
    expect(result[1].id).toBe('1')
    // 1*1 + 0*10 + 0*13.5 = 1
    expect(result[1].engagement).toBe(1)
  })

  it('truncates text at 200 characters with ellipsis', () => {
    const longText = 'A'.repeat(300)
    const tweets = [makeTweet({ id: '1', authorId: 'a', text: longText })]
    const result = computeTopPosts(tweets, [])
    // 200 chars + '...' = 203 total
    expect(result[0].text.length).toBe(203)
    expect(result[0].text.endsWith('...')).toBe(true)
  })

  it('does not truncate text at exactly 200 characters', () => {
    const exactText = 'B'.repeat(200)
    const tweets = [makeTweet({ id: '1', authorId: 'a', text: exactText })]
    const result = computeTopPosts(tweets, [])
    expect(result[0].text.length).toBe(200)
    expect(result[0].text.endsWith('...')).toBe(false)
  })

  it('respects the limit parameter', () => {
    const tweets = Array.from({ length: 10 }, (_, i) =>
      makeTweet({
        id: String(i),
        authorId: 'a',
        metrics: { likes: i, retweets: 0, replies: 0, impressions: 10 },
      }),
    )
    const result = computeTopPosts(tweets, [], 3)
    expect(result.length).toBe(3)
  })

  it('falls back to authorId for author when user not found', () => {
    const tweets = [makeTweet({ id: '1', authorId: 'orphan-42' })]
    const result = computeTopPosts(tweets, [])
    expect(result[0].author).toBe('orphan-42')
  })
})

describe('computeKeyVoices', () => {
  it('returns empty array for no tweets', () => {
    const result = computeKeyVoices([], [], [])
    expect(result).toEqual([])
  })

  it('sorts by engagement score, falls back to reach', () => {
    const tweets = [makeTweet({ id: '1', authorId: 'a' }), makeTweet({ id: '2', authorId: 'b' })]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.5, narrative: 'x' },
      { index: 1, sentiment: -0.3, narrative: 'x' },
    ]
    const users: XUser[] = [
      makeUser({ id: 'a', username: 'smallfry', followersCount: 100 }),
      makeUser({ id: 'b', username: 'bigshot', followersCount: 50000 }),
    ]
    const result = computeKeyVoices(tweets, scores, users)
    // Same default metrics => same engagement score, falls back to reach
    expect(result[0].handle).toBe('bigshot')
    expect(result[0].reach).toBe(50000)
    expect(result[1].handle).toBe('smallfry')
    expect(result[1].reach).toBe(100)
  })

  it('returns 0 reach when user is not in the array', () => {
    const tweets = [makeTweet({ id: '1', authorId: 'ghost' })]
    const scores: GrokTweetScore[] = [{ index: 0, sentiment: 0, narrative: 'x' }]
    const result = computeKeyVoices(tweets, scores, [])
    expect(result[0].handle).toBe('ghost')
    expect(result[0].reach).toBe(0)
  })

  it('respects the limit parameter', () => {
    const tweets = Array.from({ length: 15 }, (_, i) =>
      makeTweet({ id: String(i), authorId: `user-${i}` }),
    )
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0, narrative: 'x' }))
    const users = tweets.map((t) =>
      makeUser({ id: t.authorId, username: t.authorId, followersCount: 100 }),
    )
    const result = computeKeyVoices(tweets, scores, users, 5)
    expect(result.length).toBe(5)
  })

  it('computes average sentiment per voice', () => {
    const tweets = [makeTweet({ id: '1', authorId: 'a' }), makeTweet({ id: '2', authorId: 'a' })]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.4, narrative: 'x' },
      { index: 1, sentiment: 0.6, narrative: 'x' },
    ]
    const users: XUser[] = [makeUser({ id: 'a', username: 'alice' })]
    const result = computeKeyVoices(tweets, scores, users)
    expect(result[0].sentiment).toBe(0.5)
  })

  it('handles duplicate tweets from same author', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a' }),
      makeTweet({ id: '2', authorId: 'a' }),
      makeTweet({ id: '3', authorId: 'b' }),
    ]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.4, narrative: 'x' },
      { index: 1, sentiment: 0.8, narrative: 'x' },
      { index: 2, sentiment: -0.2, narrative: 'x' },
    ]
    const users: XUser[] = [
      makeUser({ id: 'a', username: 'alice', followersCount: 5000 }),
      makeUser({ id: 'b', username: 'bob', followersCount: 1000 }),
    ]
    const result = computeKeyVoices(tweets, scores, users)
    // alice appears once with averaged sentiment: (0.4 + 0.8) / 2 = 0.6
    const alice = result.find((v) => v.handle === 'alice')!
    expect(alice.sentiment).toBe(0.6)
    // alice should only appear once
    expect(result.filter((v) => v.handle === 'alice').length).toBe(1)
  })
})

describe('computeConfidence', () => {
  it('returns zero confidence for empty inputs', () => {
    const result = computeConfidence([], [])
    expect(result).toEqual({ overall: 0, volume: 'low', consistency: 0, diversity: 0 })
  })

  it('returns low volume for < 30 tweets', () => {
    const tweets = Array.from({ length: 10 }, (_, i) =>
      makeTweet({ id: String(i), authorId: `a${i}` }),
    )
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0.5, narrative: 'x' }))
    const result = computeConfidence(tweets, scores)
    expect(result.volume).toBe('low')
  })

  it('returns moderate volume for 30-99 tweets', () => {
    const tweets = Array.from({ length: 50 }, (_, i) =>
      makeTweet({ id: String(i), authorId: `a${i}` }),
    )
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0.3, narrative: 'x' }))
    const result = computeConfidence(tweets, scores)
    expect(result.volume).toBe('moderate')
  })

  it('returns high volume for >= 100 tweets', () => {
    const tweets = Array.from({ length: 120 }, (_, i) =>
      makeTweet({ id: String(i), authorId: `a${i}` }),
    )
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0.1, narrative: 'x' }))
    const result = computeConfidence(tweets, scores)
    expect(result.volume).toBe('high')
  })

  it('returns high consistency (low std dev) for uniform sentiment', () => {
    const tweets = Array.from({ length: 40 }, (_, i) =>
      makeTweet({ id: String(i), authorId: `a${i}` }),
    )
    // All sentiments identical = std dev 0
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0.5, narrative: 'x' }))
    const result = computeConfidence(tweets, scores)
    expect(result.consistency).toBe(0)
    // consistencyScore = max(0, 1 - 0) = 1.0
  })

  it('returns lower consistency for divergent sentiment', () => {
    const tweets = Array.from({ length: 40 }, (_, i) =>
      makeTweet({ id: String(i), authorId: `a${i}` }),
    )
    // Half very positive, half very negative
    const scores = tweets.map((_, i) => ({
      index: i,
      sentiment: i < 20 ? 1.0 : -1.0,
      narrative: 'x',
    }))
    const result = computeConfidence(tweets, scores)
    expect(result.consistency).toBe(1) // std dev of [1,1,...,-1,-1,...] = 1.0
  })

  it('computes diversity as unique authors / total tweets', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a' }),
      makeTweet({ id: '2', authorId: 'a' }),
      makeTweet({ id: '3', authorId: 'b' }),
      makeTweet({ id: '4', authorId: 'c' }),
    ]
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0.5, narrative: 'x' }))
    const result = computeConfidence(tweets, scores)
    // 3 unique / 4 total = 0.75
    expect(result.diversity).toBe(0.75)
  })

  it('overall is weighted combination of volume, consistency, diversity', () => {
    // 40 tweets (moderate, volumeScore=0.6), all same sentiment (consistency=0, consistencyScore=1.0),
    // all unique authors (diversity=1.0, diversityScore=min(1, 2.0)=1.0)
    const tweets = Array.from({ length: 40 }, (_, i) =>
      makeTweet({ id: String(i), authorId: `a${i}` }),
    )
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0.5, narrative: 'x' }))
    const result = computeConfidence(tweets, scores)
    // overall = 0.6*0.4 + 1.0*0.3 + 1.0*0.3 = 0.24 + 0.3 + 0.3 = 0.84
    expect(result.overall).toBe(0.84)
  })

  it('returns correct values for exactly 1 score', () => {
    const tweets = [makeTweet({ id: '1', authorId: 'a' })]
    const scores: GrokTweetScore[] = [{ index: 0, sentiment: 0.5, narrative: 'x' }]
    const result = computeConfidence(tweets, scores)
    // std dev of single value = 0
    expect(result.consistency).toBe(0)
    // 1 unique author / 1 tweet = 1.0
    expect(result.diversity).toBe(1)
    expect(result.volume).toBe('low')
  })

  it('returns diversity 0.1 when all tweets from same author', () => {
    const tweets = Array.from({ length: 10 }, (_, i) => makeTweet({ id: String(i), authorId: 'a' }))
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0.5, narrative: 'x' }))
    const result = computeConfidence(tweets, scores)
    // 1 unique author / 10 tweets = 0.1
    expect(result.diversity).toBe(0.1)
  })

  it('boundary: exactly 30 tweets is moderate', () => {
    const tweets = Array.from({ length: 30 }, (_, i) =>
      makeTweet({ id: String(i), authorId: `a${i}` }),
    )
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0.5, narrative: 'x' }))
    const result = computeConfidence(tweets, scores)
    expect(result.volume).toBe('moderate')
  })

  it('boundary: exactly 100 tweets is high', () => {
    const tweets = Array.from({ length: 100 }, (_, i) =>
      makeTweet({ id: String(i), authorId: `a${i}` }),
    )
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0.5, narrative: 'x' }))
    const result = computeConfidence(tweets, scores)
    expect(result.volume).toBe('high')
  })

  it('diversityScore capped at 1.0 when diversity > 0.5', () => {
    // 10 tweets from 8 unique authors => diversity = 0.8
    // diversityScore = min(1, 0.8 * 2) = min(1, 1.6) = 1.0
    const tweets = Array.from({ length: 10 }, (_, i) =>
      makeTweet({ id: String(i), authorId: i < 8 ? `a${i}` : 'a0' }),
    )
    const scores = tweets.map((_, i) => ({ index: i, sentiment: 0.5, narrative: 'x' }))
    const result = computeConfidence(tweets, scores)
    expect(result.diversity).toBe(0.8)
    // diversityScore = min(1, 1.6) = 1.0, volumeScore = 0.3 (low), consistencyScore = 1.0
    // overall = 0.3*0.4 + 1.0*0.3 + 1.0*0.3 = 0.12 + 0.3 + 0.3 = 0.72
    expect(result.overall).toBe(0.72)
  })
})

describe('detectContradictions', () => {
  const baseSentiment = { positive: 5, neutral: 3, negative: 2 }
  const baseMetrics = {
    tweetCount: 10,
    totalEngagement: 500,
    uniqueAuthors: 8,
    engagementPerTweet: 50,
  }

  function makeStep(overrides: {
    command: string
    snapshot: Snapshot
    tweets?: Tweet[]
    scores?: GrokTweetScore[]
  }) {
    return {
      command: overrides.command,
      snapshot: overrides.snapshot,
      tweets: overrides.tweets ?? [],
      scores: overrides.scores ?? [],
    }
  }

  it('returns empty array when no contradictions found', () => {
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.3, ...baseSentiment },
          topAccounts: [],
          narratives: [],
          signals: [],
        } as ScanSnapshot,
      }),
      makeStep({
        command: 'pulse',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.35, ...baseSentiment },
          bullSignals: ['a'],
          bearSignals: [],
          keyVoices: [],
        } as PulseSnapshot,
      }),
    ])
    expect(result).toEqual([])
  })

  it('detects cross-step sentiment divergence > 0.3', () => {
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: -0.41, positive: 1, neutral: 3, negative: 6 },
          topAccounts: [],
          narratives: [],
          signals: [],
        } as ScanSnapshot,
      }),
      makeStep({
        command: 'pulse',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.08, positive: 4, neutral: 4, negative: 2 },
          bullSignals: [],
          bearSignals: [],
          keyVoices: [],
        } as PulseSnapshot,
      }),
    ])
    expect(result.length).toBe(1)
    expect(result[0]).toContain('scan')
    expect(result[0]).toContain('pulse')
    expect(result[0]).toContain('diverges')
  })

  it('does not flag sentiment difference <= 0.3', () => {
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.2, ...baseSentiment },
          topAccounts: [],
          narratives: [],
          signals: [],
        } as ScanSnapshot,
      }),
      makeStep({
        command: 'pulse',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.4, ...baseSentiment },
          bullSignals: [],
          bearSignals: [],
          keyVoices: [],
        } as PulseSnapshot,
      }),
    ])
    // 0.4 - 0.2 = 0.2, not > 0.3
    expect(result).toEqual([])
  })

  it('detects top accounts vs crowd divergence', () => {
    // Top 3 accounts are bullish but crowd is bearish
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'whale1',
        metrics: { likes: 1000, retweets: 500, replies: 100, impressions: 5000 },
      }),
      makeTweet({
        id: '2',
        authorId: 'whale2',
        metrics: { likes: 800, retweets: 300, replies: 50, impressions: 4000 },
      }),
      makeTweet({
        id: '3',
        authorId: 'whale3',
        metrics: { likes: 600, retweets: 200, replies: 30, impressions: 3000 },
      }),
      makeTweet({
        id: '4',
        authorId: 'crowd1',
        metrics: { likes: 2, retweets: 0, replies: 0, impressions: 10 },
      }),
      makeTweet({
        id: '5',
        authorId: 'crowd2',
        metrics: { likes: 1, retweets: 0, replies: 0, impressions: 5 },
      }),
    ]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.8, narrative: 'x' },
      { index: 1, sentiment: 0.7, narrative: 'x' },
      { index: 2, sentiment: 0.6, narrative: 'x' },
      { index: 3, sentiment: -0.8, narrative: 'x' },
      { index: 4, sentiment: -0.9, narrative: 'x' },
    ]
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: -0.3, positive: 0, neutral: 1, negative: 4 },
          topAccounts: [],
          narratives: [],
          signals: [],
        } as ScanSnapshot,
        tweets,
        scores,
      }),
    ])
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.some((c) => c.includes('Top') && c.includes('bullish'))).toBe(true)
  })

  it('detects bull/bear signal conflict in pulse', () => {
    const result = detectContradictions([
      makeStep({
        command: 'pulse',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.0, ...baseSentiment },
          bullSignals: ['a', 'b', 'c'],
          bearSignals: ['d', 'e', 'f'],
          keyVoices: [],
        } as PulseSnapshot,
      }),
    ])
    expect(result.length).toBe(1)
    expect(result[0]).toContain('bull signals (3)')
    expect(result[0]).toContain('bear signals (3)')
    expect(result[0]).toContain('contested')
  })

  it('does not flag bull/bear when either < 3', () => {
    const result = detectContradictions([
      makeStep({
        command: 'pulse',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.0, ...baseSentiment },
          bullSignals: ['a', 'b'],
          bearSignals: ['c', 'd', 'e'],
          keyVoices: [],
        } as PulseSnapshot,
      }),
    ])
    expect(result.filter((c) => c.includes('contested'))).toEqual([])
  })

  it('detects narrative vs sentiment mismatch', () => {
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.25, positive: 5, neutral: 3, negative: 2 },
          topAccounts: [],
          narratives: [
            {
              theme: 'ETF outflows',
              description: 'Capital leaving ETFs',
              tweetCount: 8,
              avgSentiment: -0.52,
            },
            { theme: 'HODLing', description: 'Holding strong', tweetCount: 2, avgSentiment: 0.9 },
          ],
          signals: [],
        } as ScanSnapshot,
      }),
    ])
    expect(result.length).toBe(1)
    expect(result[0]).toContain('ETF outflows')
    expect(result[0]).toContain('bearish')
    expect(result[0]).toContain('positive')
  })

  it('does not flag narrative mismatch when signs match', () => {
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.5, positive: 7, neutral: 2, negative: 1 },
          topAccounts: [],
          narratives: [
            { theme: 'Bull run', description: 'Market going up', tweetCount: 8, avgSentiment: 0.6 },
          ],
          signals: [],
        } as ScanSnapshot,
      }),
    ])
    expect(result).toEqual([])
  })

  it('boundary: exactly 0.3 sentiment diff is NOT flagged', () => {
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.2, ...baseSentiment },
          topAccounts: [],
          narratives: [],
          signals: [],
        } as ScanSnapshot,
      }),
      makeStep({
        command: 'pulse',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.5, ...baseSentiment },
          bullSignals: [],
          bearSignals: [],
          keyVoices: [],
        } as PulseSnapshot,
      }),
    ])
    // diff = |0.5 - 0.2| = 0.3, condition is > 0.3 (strict), so NOT flagged
    expect(result).toEqual([])
  })

  it('skips top accounts check when fewer than 2 authors', () => {
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'solo',
        metrics: { likes: 1000, retweets: 500, replies: 100, impressions: 5000 },
      }),
    ]
    const scores: GrokTweetScore[] = [{ index: 0, sentiment: 0.9, narrative: 'x' }]
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: -0.8, positive: 0, neutral: 0, negative: 1 },
          topAccounts: [],
          narratives: [],
          signals: [],
        } as ScanSnapshot,
        tweets,
        scores,
      }),
    ])
    // Only 1 author, topAuthors.length < 2, so top-accounts-vs-crowd check is skipped
    expect(result.filter((c) => c.includes('Top'))).toEqual([])
  })

  it('skips narrative mismatch when avgSentiment is 0', () => {
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.5, positive: 5, neutral: 3, negative: 2 },
          topAccounts: [],
          narratives: [
            { theme: 'Neutral talk', description: 'desc', tweetCount: 5, avgSentiment: 0 },
          ],
          signals: [],
        } as ScanSnapshot,
      }),
    ])
    // dominant.avgSentiment === 0, so narrative mismatch is skipped
    expect(result.filter((c) => c.includes('Neutral talk'))).toEqual([])
  })

  it('skips narrative mismatch when overallAvg is 0', () => {
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0, positive: 3, neutral: 4, negative: 3 },
          topAccounts: [],
          narratives: [
            { theme: 'Bearish take', description: 'desc', tweetCount: 5, avgSentiment: -0.6 },
          ],
          signals: [],
        } as ScanSnapshot,
      }),
    ])
    // overallAvg === 0, so narrative mismatch is skipped
    expect(result.filter((c) => c.includes('Bearish take'))).toEqual([])
  })

  it('handles pulse without bullSignals/bearSignals arrays', () => {
    // Cast an empty object as PulseSnapshot to simulate missing arrays
    const result = detectContradictions([
      makeStep({
        command: 'pulse',
        snapshot: {} as PulseSnapshot,
      }),
    ])
    // Should not crash — the guard skips non-array bullSignals/bearSignals
    expect(result).toEqual([])
  })

  it('handles step with no tweets/scores', () => {
    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: -0.5, positive: 1, neutral: 2, negative: 7 },
          topAccounts: [],
          narratives: [],
          signals: [],
        } as ScanSnapshot,
        tweets: [],
        scores: [],
      }),
    ])
    // Empty tweets/scores => the top-accounts-vs-crowd loop continues past them
    expect(result.filter((c) => c.includes('Top'))).toEqual([])
  })

  it('detects multiple contradictions simultaneously', () => {
    // Build a step that triggers BOTH cross-step sentiment divergence AND narrative mismatch
    const tweets = Array.from({ length: 5 }, (_, i) =>
      makeTweet({
        id: String(i),
        authorId: `a${i}`,
        metrics: { likes: 10, retweets: 5, replies: 3, impressions: 100 },
      }),
    )
    const scores: GrokTweetScore[] = tweets.map((_, i) => ({
      index: i,
      sentiment: 0.5,
      narrative: 'x',
    }))

    const result = detectContradictions([
      makeStep({
        command: 'scan',
        snapshot: {
          metrics: baseMetrics,
          sentiment: { avg: 0.5, positive: 8, neutral: 1, negative: 1 },
          topAccounts: [],
          narratives: [
            // Dominant narrative is bearish but overall sentiment is positive => narrative mismatch
            { theme: 'Crash incoming', description: 'desc', tweetCount: 8, avgSentiment: -0.7 },
          ],
          signals: [],
        } as ScanSnapshot,
        tweets,
        scores,
      }),
      makeStep({
        command: 'pulse',
        snapshot: {
          metrics: baseMetrics,
          // avg = -0.2 vs scan avg = 0.5 => diff = 0.7 > 0.3 => cross-step divergence
          sentiment: { avg: -0.2, positive: 2, neutral: 3, negative: 5 },
          bullSignals: [],
          bearSignals: [],
          keyVoices: [],
        } as PulseSnapshot,
      }),
    ])
    // Should have at least 2 contradictions: cross-step divergence + narrative mismatch
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.some((c) => c.includes('diverges'))).toBe(true)
    expect(result.some((c) => c.includes('Crash incoming'))).toBe(true)
  })
})

describe('toUserMap', () => {
  it('returns empty map for empty array', () => {
    const result = toUserMap([])
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('maps single user id to user', () => {
    const user = makeUser({ id: 'u1', username: 'alice' })
    const result = toUserMap([user])
    expect(result.size).toBe(1)
    expect(result.get('u1')).toBe(user)
  })

  it('maps multiple users with correct keys', () => {
    const alice = makeUser({ id: 'u1', username: 'alice' })
    const bob = makeUser({ id: 'u2', username: 'bob' })
    const carol = makeUser({ id: 'u3', username: 'carol' })
    const result = toUserMap([alice, bob, carol])
    expect(result.size).toBe(3)
    expect(result.get('u1')).toBe(alice)
    expect(result.get('u2')).toBe(bob)
    expect(result.get('u3')).toBe(carol)
  })

  it('last user wins when duplicate IDs are present', () => {
    const first = makeUser({ id: 'dup', username: 'first' })
    const second = makeUser({ id: 'dup', username: 'second' })
    const result = toUserMap([first, second])
    expect(result.size).toBe(1)
    expect(result.get('dup')).toBe(second)
    expect(result.get('dup')!.username).toBe('second')
  })
})

describe('computeNewestTweetAt', () => {
  it('returns null for empty array', () => {
    const result = computeNewestTweetAt([])
    expect(result).toBeNull()
  })

  it('returns timestamp for single tweet', () => {
    const tweet = makeTweet({ id: '1', authorId: 'a', createdAt: '2026-03-10T12:00:00Z' })
    const result = computeNewestTweetAt([tweet])
    expect(result).toBe(new Date('2026-03-10T12:00:00Z').getTime())
  })

  it('returns the newest timestamp from multiple tweets', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a', createdAt: '2026-03-08T00:00:00Z' }),
      makeTweet({ id: '2', authorId: 'b', createdAt: '2026-03-10T00:00:00Z' }),
      makeTweet({ id: '3', authorId: 'c', createdAt: '2026-03-09T00:00:00Z' }),
    ]
    const result = computeNewestTweetAt(tweets)
    expect(result).toBe(new Date('2026-03-10T00:00:00Z').getTime())
  })

  it('returns the shared timestamp when all tweets have the same date', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a', createdAt: '2026-03-10T06:00:00Z' }),
      makeTweet({ id: '2', authorId: 'b', createdAt: '2026-03-10T06:00:00Z' }),
    ]
    const result = computeNewestTweetAt(tweets)
    expect(result).toBe(new Date('2026-03-10T06:00:00Z').getTime())
  })

  it('returns null when all tweets have invalid dates', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a', createdAt: 'not-a-date' }),
      makeTweet({ id: '2', authorId: 'b', createdAt: 'also-invalid' }),
    ]
    const result = computeNewestTweetAt(tweets)
    expect(result).toBeNull()
  })

  it('returns newest valid date when mixed with invalid dates', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a', createdAt: 'not-a-date' }),
      makeTweet({ id: '2', authorId: 'b', createdAt: '2026-03-09T00:00:00Z' }),
      makeTweet({ id: '3', authorId: 'c', createdAt: 'garbage' }),
      makeTweet({ id: '4', authorId: 'd', createdAt: '2026-03-10T00:00:00Z' }),
    ]
    const result = computeNewestTweetAt(tweets)
    expect(result).toBe(new Date('2026-03-10T00:00:00Z').getTime())
  })

  it('returns a positive number for past tweets', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a', createdAt: '2020-01-01T00:00:00Z' }),
      makeTweet({ id: '2', authorId: 'b', createdAt: '2019-06-15T12:30:00Z' }),
    ]
    const result = computeNewestTweetAt(tweets)
    expect(result).toBeTypeOf('number')
    expect(result).toBeGreaterThan(0)
  })
})

describe('X_ENGAGEMENT_WEIGHTS', () => {
  it('exports weights with replies > retweets > likes', () => {
    expect(X_ENGAGEMENT_WEIGHTS.reply).toBeGreaterThan(X_ENGAGEMENT_WEIGHTS.retweet)
    expect(X_ENGAGEMENT_WEIGHTS.retweet).toBeGreaterThan(X_ENGAGEMENT_WEIGHTS.like)
  })

  it('has expected values', () => {
    expect(X_ENGAGEMENT_WEIGHTS).toEqual({ like: 1.0, retweet: 10.0, reply: 13.5 })
  })
})

describe('computeEngagementScore', () => {
  it('computes weighted score from tweet metrics', () => {
    const tweet = makeTweet({
      id: '1',
      authorId: 'a',
      metrics: { likes: 100, retweets: 20, replies: 10, impressions: 5000 },
    })
    // 100*1 + 20*10 + 10*13.5 = 100 + 200 + 135 = 435
    const score = computeEngagementScore(tweet)
    expect(score).toBe(435)
  })

  it('returns 0 for tweet with no engagement', () => {
    const tweet = makeTweet({
      id: '1',
      authorId: 'a',
      metrics: { likes: 0, retweets: 0, replies: 0, impressions: 0 },
    })
    expect(computeEngagementScore(tweet)).toBe(0)
  })

  it('weights replies highest', () => {
    const replyHeavy = makeTweet({
      id: '1',
      authorId: 'a',
      metrics: { likes: 0, retweets: 0, replies: 50, impressions: 0 },
    })
    const likeHeavy = makeTweet({
      id: '2',
      authorId: 'a',
      metrics: { likes: 500, retweets: 0, replies: 0, impressions: 0 },
    })
    // 50*13.5 = 675 vs 500*1 = 500
    expect(computeEngagementScore(replyHeavy)).toBeGreaterThan(computeEngagementScore(likeHeavy))
  })
})

describe('computeSentiment weighted', () => {
  it('returns rawAvg equal to avg when no tweets provided', () => {
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.5, narrative: 'a' },
      { index: 1, sentiment: -0.5, narrative: 'b' },
    ]
    const result = computeSentiment(scores)
    expect(result.rawAvg).toBe(result.avg)
    expect(result.rawAvg).toBe(0)
  })

  it('computes engagement-weighted avg when tweets provided', () => {
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.8, narrative: 'bull' },
      { index: 1, sentiment: -0.4, narrative: 'bear' },
    ]
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'a',
        metrics: { likes: 100, retweets: 0, replies: 0, impressions: 0 },
      }),
      makeTweet({
        id: '2',
        authorId: 'b',
        metrics: { likes: 0, retweets: 0, replies: 100, impressions: 0 },
      }),
    ]
    const result = computeSentiment(scores, tweets)
    // tweet 1 score: 100*1 = 100, sentiment 0.8
    // tweet 2 score: 100*13.5 = 1350, sentiment -0.4
    // weighted avg: (100*0.8 + 1350*-0.4) / (100 + 1350) = (80 - 540) / 1450 ≈ -0.32
    expect(result.avg).toBeCloseTo(-0.32, 1)
    expect(result.rawAvg).toBe(0.2) // simple avg: (0.8 + -0.4) / 2 = 0.2
  })

  it('rawAvg always reflects simple average', () => {
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 1.0, narrative: 'a' },
      { index: 1, sentiment: 0.0, narrative: 'b' },
    ]
    const result = computeSentiment(scores)
    expect(result.rawAvg).toBe(0.5)
  })
})

describe('computeTopAccounts engagement', () => {
  it('returns engagementScore on each entry', () => {
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'a',
        metrics: { likes: 100, retweets: 10, replies: 5, impressions: 0 },
      }),
    ]
    const scores: GrokTweetScore[] = [{ index: 0, sentiment: 0.5, narrative: 'x' }]
    const users = [makeUser({ id: 'a', username: 'alice' })]
    const result = computeTopAccounts(tweets, scores, users)
    // 100*1 + 10*10 + 5*13.5 = 100 + 100 + 67.5 = 267.5
    expect(result[0].engagementScore).toBe(267.5)
  })

  it('sorts by engagementScore descending', () => {
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'a',
        metrics: { likes: 500, retweets: 0, replies: 0, impressions: 0 },
      }),
      makeTweet({
        id: '2',
        authorId: 'b',
        metrics: { likes: 0, retweets: 0, replies: 50, impressions: 0 },
      }),
    ]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.5, narrative: 'x' },
      { index: 1, sentiment: -0.3, narrative: 'y' },
    ]
    const users = [
      makeUser({ id: 'a', username: 'alice', followersCount: 10000 }),
      makeUser({ id: 'b', username: 'bob', followersCount: 100 }),
    ]
    const result = computeTopAccounts(tweets, scores, users)
    // alice: 500*1 = 500
    // bob: 50*13.5 = 675
    expect(result[0].handle).toBe('bob')
    expect(result[1].handle).toBe('alice')
  })
})

describe('computeTopPosts engagement-weighted', () => {
  it('sorts by engagement score not raw sum', () => {
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'a',
        metrics: { likes: 500, retweets: 0, replies: 0, impressions: 5000 },
      }),
      makeTweet({
        id: '2',
        authorId: 'b',
        metrics: { likes: 0, retweets: 0, replies: 50, impressions: 100 },
      }),
    ]
    const users = [
      makeUser({ id: 'a', username: 'alice' }),
      makeUser({ id: 'b', username: 'bob' }),
    ]
    const result = computeTopPosts(tweets, users)
    // tweet 1: 500*1 + 0*10 + 0*13.5 = 500
    // tweet 2: 0*1 + 0*10 + 50*13.5 = 675
    expect(result[0].id).toBe('2')
    expect(result[0].engagement).toBe(675)
  })
})

describe('computeKeyVoices engagement-weighted', () => {
  it('sorts by engagement score not follower count', () => {
    const tweets = [
      makeTweet({
        id: '1',
        authorId: 'a',
        metrics: { likes: 0, retweets: 0, replies: 100, impressions: 0 },
      }),
      makeTweet({
        id: '2',
        authorId: 'b',
        metrics: { likes: 500, retweets: 0, replies: 0, impressions: 0 },
      }),
    ]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.5, narrative: 'x' },
      { index: 1, sentiment: -0.3, narrative: 'y' },
    ]
    const users = [
      makeUser({ id: 'a', username: 'alice', followersCount: 100 }),
      makeUser({ id: 'b', username: 'bob', followersCount: 100000 }),
    ]
    const result = computeKeyVoices(tweets, scores, users)
    // alice: 100*13.5 = 1350
    // bob: 500*1 = 500
    expect(result[0].handle).toBe('alice')
  })
})
