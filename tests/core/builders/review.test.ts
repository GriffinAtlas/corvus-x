import { describe, it, expect, vi } from 'vitest'
import { buildReviewSnapshot } from '../../../src/core/builders/review.js'
import type { CorvusDeps } from '../../../src/core/types.js'
import type { Tweet, XUser } from '../../../src/core/x-adapter.js'

const mockUsage = { inputTokens: 300, outputTokens: 150, costUsd: 0.005, toolCalls: 0 }

const reviewGrokResponse = {
  topPosts: [
    { content: 'My best thread on TS agents', engagement: 500, why: 'Thread format works' },
  ],
  underperformers: [
    { content: 'Random thought', engagement: 3, why: 'No hook, no value' },
  ],
  patterns: [
    { pattern: 'Threads get 3x engagement', impact: 'High' },
  ],
  recommendations: ['Post more threads', 'Avoid posting on weekends'],
}

const user: XUser = {
  id: 'u1', username: 'alice', name: 'Alice', description: '',
  followersCount: 5000, followingCount: 200, tweetCount: 1500, verified: false,
}

const now = Date.now()
const tweets: Tweet[] = [
  {
    id: '1', text: 'My best thread on TS agents', authorId: 'u1',
    createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
    metrics: { likes: 200, retweets: 50, replies: 30, impressions: 5000 },
  },
  {
    id: '2', text: 'Random thought', authorId: 'u1',
    createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    metrics: { likes: 2, retweets: 1, replies: 0, impressions: 50 },
  },
]

function makeDeps(overrides: {
  grokResponse: unknown
  x?: Partial<CorvusDeps['x']> | null
}): CorvusDeps {
  const grok = {
    query: vi.fn().mockResolvedValue({
      text: JSON.stringify(overrides.grokResponse),
      usage: mockUsage,
      citations: [],
    }),
  } as unknown as CorvusDeps['grok']
  return { grok, x: (overrides.x as CorvusDeps['x']) ?? null }
}

describe('buildReviewSnapshot', () => {
  it('returns review with computed metrics and Grok analysis', async () => {
    const deps = makeDeps({
      grokResponse: reviewGrokResponse,
      x: {
        getUser: vi.fn().mockResolvedValue(user),
        getUserTweets: vi.fn().mockResolvedValue(tweets),
      },
    })

    const result = await buildReviewSnapshot(deps, 'alice', 7)

    expect(result.data.handle).toBe('alice')
    expect(result.data.totalPosts).toBe(2)
    expect(result.data.totalEngagement).toBe(283) // 200+50+30 + 2+1+0
    expect(result.data.avgEngagementPerPost).toBe(142) // 283/2 rounded
    expect(result.data.topPosts).toHaveLength(1)
    expect(result.data.underperformers).toHaveLength(1)
    expect(result.data.patterns).toHaveLength(1)
    expect(result.data.recommendations).toEqual(['Post more threads', 'Avoid posting on weekends'])
    expect(result.data.period.from).toBeDefined()
    expect(result.data.period.to).toBeDefined()
    expect(result.cost).toBe(0.005)
  })

  it('throws when deps.x is null', async () => {
    const deps = makeDeps({ grokResponse: reviewGrokResponse, x: null })
    await expect(buildReviewSnapshot(deps, 'alice', 7)).rejects.toThrow('X API token required')
  })

  it('filters tweets to the requested day window', async () => {
    const oldTweet: Tweet = {
      id: '3', text: 'Old post', authorId: 'u1',
      createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
      metrics: { likes: 10, retweets: 2, replies: 1, impressions: 200 },
    }
    const deps = makeDeps({
      grokResponse: reviewGrokResponse,
      x: {
        getUser: vi.fn().mockResolvedValue(user),
        getUserTweets: vi.fn().mockResolvedValue([...tweets, oldTweet]),
      },
    })

    const result = await buildReviewSnapshot(deps, 'alice', 7)
    // Old tweet should be filtered out — only 2 recent tweets
    expect(result.data.totalPosts).toBe(2)
  })

  it('throws when no recent posts exist', async () => {
    const oldTweet: Tweet = {
      id: '3', text: 'Old post', authorId: 'u1',
      createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
      metrics: { likes: 10, retweets: 2, replies: 1, impressions: 200 },
    }
    const deps = makeDeps({
      grokResponse: reviewGrokResponse,
      x: {
        getUser: vi.fn().mockResolvedValue(user),
        getUserTweets: vi.fn().mockResolvedValue([oldTweet]),
      },
    })

    await expect(buildReviewSnapshot(deps, 'alice', 7)).rejects.toThrow('No posts from @alice')
  })
})
