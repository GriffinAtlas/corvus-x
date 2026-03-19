import { describe, it, expect, vi } from 'vitest'
import { buildHooksSnapshot } from '../../../src/core/builders/hooks.js'
import type { CorvusDeps } from '../../../src/core/types.js'
import type { Tweet, XUser } from '../../../src/core/x-adapter.js'

const mockUsage = { inputTokens: 200, outputTokens: 100, costUsd: 0.004, toolCalls: 0 }

const hooksGrokResponse = {
  opportunities: [
    {
      tweetUrl: 'https://x.com/alice/status/1',
      author: 'alice',
      authorFollowers: 5000,
      content: 'Hot take on TypeScript',
      engagement: { likes: 50, retweets: 10, replies: 3 },
      suggestedAngle: 'Share your experience with TS in CLI tools',
      opportunityScore: 0.9,
    },
    {
      tweetUrl: 'https://x.com/bob/status/2',
      author: 'bob',
      authorFollowers: 12000,
      content: 'AI agents are the future',
      engagement: { likes: 200, retweets: 40, replies: 15 },
      suggestedAngle: 'Mention your agent pipeline architecture',
      opportunityScore: 0.75,
    },
  ],
}

const tweets: Tweet[] = [
  {
    id: '1',
    text: 'Hot take on TypeScript',
    authorId: 'u1',
    createdAt: '2026-03-19T10:00:00Z',
    metrics: { likes: 50, retweets: 10, replies: 3, impressions: 500 },
  },
  {
    id: '2',
    text: 'AI agents are the future',
    authorId: 'u2',
    createdAt: '2026-03-19T11:00:00Z',
    metrics: { likes: 200, retweets: 40, replies: 15, impressions: 2000 },
  },
]

const users: XUser[] = [
  { id: 'u1', username: 'alice', name: 'Alice', description: '', followersCount: 5000, followingCount: 200, tweetCount: 500, verified: false },
  { id: 'u2', username: 'bob', name: 'Bob', description: '', followersCount: 12000, followingCount: 100, tweetCount: 300, verified: true },
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

describe('buildHooksSnapshot — X API path', () => {
  it('returns opportunities sorted by score', async () => {
    const deps = makeDeps({
      grokResponse: hooksGrokResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets, users, nextToken: undefined }),
      },
    })

    const result = await buildHooksSnapshot(deps, 'typescript', 50)

    expect(result.data.topic).toBe('typescript')
    expect(result.data.opportunities).toHaveLength(2)
    expect(result.data.opportunities[0].opportunityScore).toBe(0.9)
    expect(result.data.opportunities[0].author).toBe('alice')
    expect(result.data.opportunities[1].opportunityScore).toBe(0.75)
    expect(result.data.fetchedAt).toBeDefined()
    expect(result.cost).toBe(0.004)
    expect(result.tweets).toBe(tweets)
    expect(result.scores).toEqual([])
  })

  it('sets newestTweetAt from tweets', async () => {
    const deps = makeDeps({
      grokResponse: hooksGrokResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets, users, nextToken: undefined }),
      },
    })

    const result = await buildHooksSnapshot(deps, 'typescript', 50)
    expect(result.newestTweetAt).toBe(new Date('2026-03-19T11:00:00Z').getTime())
  })

  it('throws when no tweets found', async () => {
    const deps = makeDeps({
      grokResponse: hooksGrokResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets: [], users: [], nextToken: undefined }),
      },
    })

    await expect(buildHooksSnapshot(deps, 'nothing', 50)).rejects.toThrow('No tweets found')
  })

  it('caps opportunities at 10', async () => {
    const manyOpps = {
      opportunities: Array.from({ length: 15 }, (_, i) => ({
        tweetUrl: `https://x.com/user/status/${i}`,
        author: `user${i}`,
        authorFollowers: 1000,
        content: `Post ${i}`,
        engagement: { likes: 10, retweets: 2, replies: 1 },
        suggestedAngle: 'angle',
        opportunityScore: (15 - i) / 15,
      })),
    }
    const deps = makeDeps({
      grokResponse: manyOpps,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets, users, nextToken: undefined }),
      },
    })

    const result = await buildHooksSnapshot(deps, 'test', 50)
    expect(result.data.opportunities).toHaveLength(10)
  })
})

describe('buildHooksSnapshot — Grok-only path', () => {
  it('uses Grok-only path when deps.x is null', async () => {
    const deps = makeDeps({ grokResponse: hooksGrokResponse, x: null })

    const result = await buildHooksSnapshot(deps, 'AI agents', 50)

    expect(result.data.topic).toBe('AI agents')
    expect(result.data.opportunities).toHaveLength(2)
    expect(result.data.opportunities[0].opportunityScore).toBe(0.9)
    expect(result.tweets).toEqual([])
    expect(result.newestTweetAt).toBeNull()
  })

  it('handles empty opportunities from Grok', async () => {
    const deps = makeDeps({ grokResponse: { opportunities: [] }, x: null })

    const result = await buildHooksSnapshot(deps, 'obscure topic', 50)

    expect(result.data.opportunities).toEqual([])
    expect(result.data.topic).toBe('obscure topic')
  })

  it('handles null opportunities from Grok', async () => {
    const deps = makeDeps({ grokResponse: { opportunities: null }, x: null })

    const result = await buildHooksSnapshot(deps, 'test', 50)

    expect(result.data.opportunities).toEqual([])
  })
})
