import { describe, it, expect, vi } from 'vitest'
import { buildProfileSnapshot } from '../../../src/core/builders/profile.js'
import type { CorvusDeps } from '../../../src/core/types.js'
import type { XUser } from '../../../src/core/x-adapter.js'

const mockUsage = { inputTokens: 200, outputTokens: 100, costUsd: 0.004, toolCalls: 0 }

const profileGrokResponse = {
  postFrequency: { postsPerWeek: 5, activeDays: ['Monday', 'Wednesday', 'Friday'], peakHours: [9, 14] },
  contentMix: [
    { category: 'TypeScript', percentage: 40, avgEngagement: 120 },
    { category: 'AI', percentage: 30, avgEngagement: 200 },
  ],
  topPerformers: [
    { url: 'https://x.com/alice/status/1', content: 'Great thread on TS', engagement: 500, why: 'Threads perform well' },
  ],
  voiceTraits: { tone: 'casual technical', vocabulary: 'developer jargon', emojiUsage: 'minimal', avgLength: 180 },
  recommendations: ['Post more threads', 'Engage in morning hours'],
  sentiment: 0.3,
}

const user: XUser = {
  id: 'u1',
  username: 'alice',
  name: 'Alice Dev',
  description: 'TypeScript enthusiast',
  followersCount: 5000,
  followingCount: 200,
  tweetCount: 1500,
  verified: false,
}

const tweets = [
  {
    id: 't1',
    text: 'TypeScript is great',
    authorId: 'u1',
    createdAt: '2026-03-10T10:00:00Z',
    metrics: { likes: 50, retweets: 10, replies: 5, impressions: 500 },
  },
  {
    id: 't2',
    text: 'Building CLI tools',
    authorId: 'u1',
    createdAt: '2026-03-10T14:00:00Z',
    metrics: { likes: 30, retweets: 8, replies: 3, impressions: 300 },
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
      citations: [{ type: 'url_citation', url: 'https://x.com/alice', title: 'Alice' }],
    }),
  } as unknown as CorvusDeps['grok']
  return { grok, x: (overrides.x as CorvusDeps['x']) ?? null }
}

describe('buildProfileSnapshot — X API path', () => {
  it('returns full profile with account data and analysis', async () => {
    const deps = makeDeps({
      grokResponse: profileGrokResponse,
      x: {
        getUser: vi.fn().mockResolvedValue(user),
        getUserTweets: vi.fn().mockResolvedValue(tweets),
      },
    })

    const result = await buildProfileSnapshot(deps, 'alice', 50, false)

    expect(result.data.handle).toBe('alice')
    expect(result.data.displayName).toBe('Alice Dev')
    expect(result.data.followers).toBe(5000)
    expect(result.data.following).toBe(200)
    expect(result.data.postFrequency.postsPerWeek).toBe(5)
    expect(result.data.contentMix).toHaveLength(2)
    expect(result.data.contentMix[0].category).toBe('TypeScript')
    expect(result.data.topPerformers).toHaveLength(1)
    expect(result.data.voiceTraits.tone).toBe('casual technical')
    expect(result.data.sentiment).toBe(0.3)
    expect(result.data.fetchedAt).toBeDefined()
    expect(result.cost).toBe(0.004)
    expect(result.citations).toHaveLength(1)
    expect(result.tweets).toEqual([])
    expect(result.scores).toEqual([])
    expect(result.newestTweetAt).toBeNull()
  })

  it('excludes recommendations when not self', async () => {
    const deps = makeDeps({
      grokResponse: profileGrokResponse,
      x: {
        getUser: vi.fn().mockResolvedValue(user),
        getUserTweets: vi.fn().mockResolvedValue(tweets),
      },
    })

    const result = await buildProfileSnapshot(deps, 'alice', 50, false)
    expect(result.data.recommendations).toBeUndefined()
  })

  it('includes recommendations when self', async () => {
    const deps = makeDeps({
      grokResponse: profileGrokResponse,
      x: {
        getUser: vi.fn().mockResolvedValue(user),
        getUserTweets: vi.fn().mockResolvedValue(tweets),
      },
    })

    const result = await buildProfileSnapshot(deps, 'alice', 50, true)
    expect(result.data.recommendations).toEqual(['Post more threads', 'Engage in morning hours'])
  })
})

describe('buildProfileSnapshot — Grok-only path', () => {
  it('uses Grok-only path when deps.x is null', async () => {
    const grokOnlyResponse = {
      ...profileGrokResponse,
      displayName: 'Alice Grok',
      followers: 4500,
      following: 180,
    }
    const deps = makeDeps({ grokResponse: grokOnlyResponse, x: null })

    const result = await buildProfileSnapshot(deps, 'alice', 50, false)

    expect(result.data.handle).toBe('alice')
    expect(result.data.displayName).toBe('Alice Grok')
    expect(result.data.followers).toBe(4500)
    expect(result.data.following).toBe(180)
    expect(result.data.postFrequency.postsPerWeek).toBe(5)
    expect(result.data.contentMix).toHaveLength(2)
    expect(result.data.recommendations).toBeUndefined()
  })

  it('falls back to defaults when Grok response has missing fields', async () => {
    const sparseResponse = {
      postFrequency: null,
      contentMix: null,
      topPerformers: null,
      voiceTraits: null,
      sentiment: null,
      displayName: null,
      followers: null,
      following: null,
    }
    const deps = makeDeps({ grokResponse: sparseResponse, x: null })

    const result = await buildProfileSnapshot(deps, 'unknown', 50, false)

    expect(result.data.handle).toBe('unknown')
    expect(result.data.displayName).toBe('unknown')
    expect(result.data.followers).toBe(0)
    expect(result.data.following).toBe(0)
    expect(result.data.postFrequency).toEqual({ postsPerWeek: 0, activeDays: [], peakHours: [] })
    expect(result.data.contentMix).toEqual([])
    expect(result.data.topPerformers).toEqual([])
    expect(result.data.voiceTraits).toEqual({ tone: '', vocabulary: '', emojiUsage: '', avgLength: 0 })
    expect(result.data.sentiment).toBe(0)
  })
})
