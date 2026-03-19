import { describe, it, expect, vi } from 'vitest'
import { buildTimingSnapshot } from '../../../src/core/builders/timing.js'
import type { CorvusDeps } from '../../../src/core/types.js'
import type { Tweet, XUser } from '../../../src/core/x-adapter.js'

const mockUsage = { inputTokens: 200, outputTokens: 100, costUsd: 0.003, toolCalls: 0 }

const timingGrokResponse = {
  peakWindows: [
    { day: 'Monday', hour: 9, score: 0.95 },
    { day: 'Wednesday', hour: 14, score: 0.8 },
    { day: 'Friday', hour: 11, score: 0.7 },
  ],
  recommendations: ['Post at 9am UTC on Mondays', 'Avoid weekends'],
}

const user: XUser = {
  id: 'u1', username: 'alice', name: 'Alice', description: '',
  followersCount: 5000, followingCount: 200, tweetCount: 1500, verified: false,
}

const tweets: Tweet[] = [
  {
    id: '1', text: 'Morning post', authorId: 'u1',
    createdAt: '2026-03-17T09:00:00Z',
    metrics: { likes: 100, retweets: 20, replies: 10, impressions: 1000 },
  },
  {
    id: '2', text: 'Afternoon post', authorId: 'u1',
    createdAt: '2026-03-19T14:00:00Z',
    metrics: { likes: 50, retweets: 5, replies: 3, impressions: 500 },
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

describe('buildTimingSnapshot — self analysis', () => {
  it('returns peak windows sorted by score', async () => {
    const deps = makeDeps({
      grokResponse: timingGrokResponse,
      x: {
        getUser: vi.fn().mockResolvedValue(user),
        getUserTweets: vi.fn().mockResolvedValue(tweets),
      },
    })

    const result = await buildTimingSnapshot(deps, { handle: 'alice' })

    expect(result.data.handle).toBe('alice')
    expect(result.data.peakWindows).toHaveLength(3)
    expect(result.data.peakWindows[0].score).toBe(0.95)
    expect(result.data.peakWindows[0].day).toBe('Monday')
    expect(result.data.recommendations).toEqual(['Post at 9am UTC on Mondays', 'Avoid weekends'])
    expect(result.data.sampleSize).toBe(2)
    expect(result.cost).toBe(0.003)
  })

  it('throws when deps.x is null', async () => {
    const deps = makeDeps({ grokResponse: timingGrokResponse, x: null })
    await expect(buildTimingSnapshot(deps, { handle: 'alice' })).rejects.toThrow('X API token required')
  })

  it('throws when no posts found', async () => {
    const deps = makeDeps({
      grokResponse: timingGrokResponse,
      x: {
        getUser: vi.fn().mockResolvedValue(user),
        getUserTweets: vi.fn().mockResolvedValue([]),
      },
    })
    await expect(buildTimingSnapshot(deps, { handle: 'alice' })).rejects.toThrow('No posts found')
  })
})

describe('buildTimingSnapshot — topic analysis', () => {
  it('uses Grok x_search for topic-only mode', async () => {
    const deps = makeDeps({ grokResponse: timingGrokResponse, x: null })

    const result = await buildTimingSnapshot(deps, { topic: 'AI agents' })

    expect(result.data.topic).toBe('AI agents')
    expect(result.data.handle).toBeUndefined()
    expect(result.data.peakWindows).toHaveLength(3)
    expect(result.data.sampleSize).toBe(0)
    expect(result.tweets).toEqual([])
    expect(result.newestTweetAt).toBeNull()

    const queryCall = (deps.grok.query as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(queryCall[1].enableXSearch).toBe(true)
  })

  it('handles empty peakWindows from Grok', async () => {
    const deps = makeDeps({ grokResponse: { peakWindows: [], recommendations: [] }, x: null })

    const result = await buildTimingSnapshot(deps, { topic: 'obscure' })
    expect(result.data.peakWindows).toEqual([])
  })
})

describe('buildTimingSnapshot — validation', () => {
  it('throws when neither handle nor topic provided', async () => {
    const deps = makeDeps({ grokResponse: timingGrokResponse, x: null })
    await expect(buildTimingSnapshot(deps, {})).rejects.toThrow('Either handle or topic is required')
  })
})
