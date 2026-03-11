import { describe, it, expect } from 'vitest'
import {
  computeBaseMetrics,
  computeSentiment,
  computeTopAccounts,
  computeNarratives,
  computeTopPosts,
  computeKeyVoices,
} from '../../src/core/metrics.js'
import type { Tweet, XUser } from '../../src/core/x-adapter.js'
import type { GrokTweetScore, GrokNarrative } from '../../src/core/schemas.js'

function makeTweet(overrides: Partial<Tweet> & { id: string, authorId: string }): Tweet {
  return {
    text: 'default tweet text',
    createdAt: '2026-03-10T00:00:00Z',
    metrics: { likes: 10, retweets: 5, replies: 3, impressions: 100 },
    ...overrides,
  } as Tweet
}

function makeUser(overrides: Partial<XUser> & { id: string, username: string }): XUser {
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
    const tweets = [makeTweet({ id: '1', authorId: 'a', metrics: { likes: 10, retweets: 5, replies: 3, impressions: 100 } })]
    const result = computeBaseMetrics(tweets)
    expect(result.tweetCount).toBe(1)
    expect(result.totalEngagement).toBe(18)
    expect(result.uniqueAuthors).toBe(1)
    expect(result.engagementPerTweet).toBe(18)
  })

  it('computes metrics for multiple tweets with distinct authors', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a', metrics: { likes: 10, retweets: 2, replies: 0, impressions: 50 } }),
      makeTweet({ id: '2', authorId: 'b', metrics: { likes: 4, retweets: 1, replies: 1, impressions: 30 } }),
      makeTweet({ id: '3', authorId: 'c', metrics: { likes: 0, retweets: 0, replies: 0, impressions: 10 } }),
    ]
    const result = computeBaseMetrics(tweets)
    expect(result.tweetCount).toBe(3)
    expect(result.totalEngagement).toBe(18)
    expect(result.uniqueAuthors).toBe(3)
    expect(result.engagementPerTweet).toBe(6)
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
      makeTweet({ id: '1', authorId: 'a', metrics: { likes: 1, retweets: 0, replies: 0, impressions: 5 } }),
      makeTweet({ id: '2', authorId: 'b', metrics: { likes: 0, retweets: 0, replies: 0, impressions: 5 } }),
      makeTweet({ id: '3', authorId: 'c', metrics: { likes: 1, retweets: 0, replies: 0, impressions: 5 } }),
    ]
    const result = computeBaseMetrics(tweets)
    // total = 2, count = 3, 2/3 = 0.666... rounds to 1
    expect(result.engagementPerTweet).toBe(Math.round(2 / 3))
  })
})

describe('computeSentiment', () => {
  it('returns zeroes for empty array', () => {
    const result = computeSentiment([])
    expect(result).toEqual({ avg: 0, positive: 0, neutral: 0, negative: 0 })
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
})

describe('computeTopAccounts', () => {
  it('returns empty array when no tweets', () => {
    const result = computeTopAccounts([], [], [])
    expect(result).toEqual([])
  })

  it('groups tweets by author and sorts by post count', () => {
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

  it('sorts by followers when post counts are equal', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a' }),
      makeTweet({ id: '2', authorId: 'b' }),
    ]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0, narrative: 'x' },
      { index: 1, sentiment: 0, narrative: 'x' },
    ]
    const users: XUser[] = [
      makeUser({ id: 'a', username: 'lowreach', followersCount: 50 }),
      makeUser({ id: 'b', username: 'highreach', followersCount: 50000 }),
    ]
    const result = computeTopAccounts(tweets, scores, users)
    // Both have 1 post, so sorted by followers desc
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
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.1, narrative: 'unknown-theme' },
    ]
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

  it('sorts by engagement descending', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a', metrics: { likes: 1, retweets: 0, replies: 0, impressions: 10 } }),
      makeTweet({ id: '2', authorId: 'b', metrics: { likes: 100, retweets: 50, replies: 20, impressions: 1000 } }),
    ]
    const users: XUser[] = [
      makeUser({ id: 'a', username: 'alice' }),
      makeUser({ id: 'b', username: 'bob' }),
    ]
    const result = computeTopPosts(tweets, users)
    expect(result[0].id).toBe('2')
    expect(result[0].engagement).toBe(170)
    expect(result[1].id).toBe('1')
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
      makeTweet({ id: String(i), authorId: 'a', metrics: { likes: i, retweets: 0, replies: 0, impressions: 10 } }),
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

  it('sorts by reach (followers) descending', () => {
    const tweets = [
      makeTweet({ id: '1', authorId: 'a' }),
      makeTweet({ id: '2', authorId: 'b' }),
    ]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.5, narrative: 'x' },
      { index: 1, sentiment: -0.3, narrative: 'x' },
    ]
    const users: XUser[] = [
      makeUser({ id: 'a', username: 'smallfry', followersCount: 100 }),
      makeUser({ id: 'b', username: 'bigshot', followersCount: 50000 }),
    ]
    const result = computeKeyVoices(tweets, scores, users)
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
    const tweets = [
      makeTweet({ id: '1', authorId: 'a' }),
      makeTweet({ id: '2', authorId: 'a' }),
    ]
    const scores: GrokTweetScore[] = [
      { index: 0, sentiment: 0.4, narrative: 'x' },
      { index: 1, sentiment: 0.6, narrative: 'x' },
    ]
    const users: XUser[] = [makeUser({ id: 'a', username: 'alice' })]
    const result = computeKeyVoices(tweets, scores, users)
    expect(result[0].sentiment).toBe(0.5)
  })
})
