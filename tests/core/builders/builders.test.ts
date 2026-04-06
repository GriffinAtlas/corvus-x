import { describe, it, expect, vi } from 'vitest'
import {
  computeGrokOnlyMetrics,
  computeGrokOnlySentiment,
  computeGrokOnlyNarratives,
} from '../../../src/core/builders/grok-only.js'
import { buildScanSnapshot } from '../../../src/core/builders/scan.js'
import { buildPulseSnapshot } from '../../../src/core/builders/pulse.js'
import { buildTraceSnapshot } from '../../../src/core/builders/trace.js'
import type { CorvusDeps } from '../../../src/core/types.js'
import type { Tweet, XUser } from '../../../src/core/x-adapter.js'


const tweets: Tweet[] = [
  {
    id: '1',
    text: 'hello world',
    authorId: 'u1',
    createdAt: '2026-03-10T12:00:00Z',
    metrics: { likes: 10, retweets: 5, replies: 2, impressions: 100 },
  },
  {
    id: '2',
    text: 'goodbye world',
    authorId: 'u2',
    createdAt: '2026-03-10T13:00:00Z',
    metrics: { likes: 20, retweets: 3, replies: 1, impressions: 200 },
  },
]

const users: XUser[] = [
  {
    id: 'u1',
    username: 'alice',
    name: 'Alice',
    description: '',
    followersCount: 1000,
    followingCount: 200,
    tweetCount: 500,
    verified: false,
  },
  {
    id: 'u2',
    username: 'bob',
    name: 'Bob',
    description: '',
    followersCount: 2000,
    followingCount: 100,
    tweetCount: 300,
    verified: true,
  },
]

const mockUsage = { inputTokens: 100, outputTokens: 50, costUsd: 0.002, toolCalls: 0 }

function makeGrokQuery(responseObj: unknown) {
  return vi.fn().mockResolvedValue({
    text: JSON.stringify(responseObj),
    usage: mockUsage,
    citations: [],
  })
}

function makeDeps(overrides: {
  grokResponse: unknown
  x?: Partial<CorvusDeps['x']> | null
}): CorvusDeps {
  const grok = { query: makeGrokQuery(overrides.grokResponse) } as unknown as CorvusDeps['grok']
  return { grok, x: (overrides.x as CorvusDeps['x']) ?? null }
}


describe('computeGrokOnlyMetrics', () => {
  it('calculates engagementPerTweet correctly', () => {
    const result = computeGrokOnlyMetrics(10, 5, 1000)
    expect(result).toEqual({
      tweetCount: 10,
      totalEngagement: 1000,
      uniqueAuthors: 5,
      engagementPerTweet: 100,
    })
  })

  it('handles tweetCount=0 without dividing by zero', () => {
    const result = computeGrokOnlyMetrics(0, 0, 0)
    expect(result.engagementPerTweet).toBe(0)
    expect(result.tweetCount).toBe(0)
  })
})

describe('computeGrokOnlySentiment', () => {
  it('returns zeroes for empty array', () => {
    const result = computeGrokOnlySentiment([])
    expect(result).toEqual({ avg: 0, rawAvg: 0, positive: 0, neutral: 0, negative: 0 })
  })

  it('classifies sentiments correctly and averages', () => {
    const analysis = [
      { sentiment: 0.5 }, // positive (> 0.3)
      { sentiment: 0.1 }, // neutral
      { sentiment: -0.3 }, // neutral (not < -0.3)
      { sentiment: -0.5 }, // negative
      { sentiment: 0.2 }, // neutral
    ]
    const result = computeGrokOnlySentiment(analysis)
    expect(result.positive).toBe(1)
    expect(result.neutral).toBe(3)
    expect(result.negative).toBe(1)
    // avg = (0.5 + 0.1 + -0.3 + -0.5 + 0.2) / 5 = 0.0 / 5 = 0
    expect(result.avg).toBe(0)
  })

  it('returns rawAvg equal to avg', () => {
    const result = computeGrokOnlySentiment([
      { sentiment: 0.5 },
      { sentiment: -0.3 },
    ])
    expect(result.rawAvg).toBe(result.avg)
  })

  it('returns rawAvg 0 for empty array', () => {
    const result = computeGrokOnlySentiment([])
    expect(result.rawAvg).toBe(0)
  })
})

describe('computeGrokOnlyNarratives', () => {
  it('maps narratives correctly with matching tweets', () => {
    const tweetAnalysis = [
      { narrative: 'tech', sentiment: 0.4 },
      { narrative: 'tech', sentiment: 0.6 },
      { narrative: 'market', sentiment: -0.2 },
    ]
    const narratives = [
      { theme: 'tech', description: 'Technology discussion' },
      { theme: 'market', description: 'Market analysis' },
    ]
    const result = computeGrokOnlyNarratives(tweetAnalysis, narratives)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      theme: 'tech',
      description: 'Technology discussion',
      tweetCount: 2,
      avgSentiment: 0.5,
    })
    expect(result[1]).toEqual({
      theme: 'market',
      description: 'Market analysis',
      tweetCount: 1,
      avgSentiment: -0.2,
    })
  })

  it('handles zero matching tweets for a narrative', () => {
    const tweetAnalysis = [{ narrative: 'tech', sentiment: 0.5 }]
    const narratives = [{ theme: 'unrelated', description: 'No tweets match' }]
    const result = computeGrokOnlyNarratives(tweetAnalysis, narratives)
    expect(result[0].tweetCount).toBe(0)
    expect(result[0].avgSentiment).toBe(0)
  })
})


describe('buildScanSnapshot — X API path', () => {
  const scanGrokResponse = {
    takeaway: 'Tech discussion is dominant',
    actions: ['Engage with tech threads'],
    tweetAnalysis: [
      { index: 0, sentiment: 0.5, narrative: 'tech' },
      { index: 1, sentiment: -0.2, narrative: 'market' },
    ],
    narratives: [
      { theme: 'tech', description: 'Technology discussion' },
      { theme: 'market', description: 'Market analysis' },
    ],
    signals: ['Signal A', 'Signal B'],
  }

  it('returns correct BuildResult shape with metrics, sentiment, topAccounts, narratives, signals', async () => {
    const deps = makeDeps({
      grokResponse: scanGrokResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets, users, nextToken: undefined }),
      },
    })

    const result = await buildScanSnapshot(deps, 'test topic', 10, 1)

    expect(result.data.metrics.tweetCount).toBe(2)
    expect(result.data.metrics.uniqueAuthors).toBe(2)
    expect(result.data.sentiment.avg).toBeCloseTo(0.2, 2) // engagement-weighted: (0.5*87 + -0.2*63.5) / 150.5
    expect(result.data.sentiment.rawAvg).toBeCloseTo(0.15, 2) // simple: (0.5 + -0.2)/2
    expect(result.data.sentiment.positive).toBe(1) // 0.5 > 0.3
    expect(result.data.sentiment.neutral).toBe(1) // -0.2 between thresholds
    expect(result.data.sentiment.negative).toBe(0)
    expect(result.data.topAccounts).toHaveLength(2)
    // alice: 10*1+5*10+2*13.5=87, bob: 20*1+3*10+1*13.5=63.5 — sorted by engagement score desc
    expect(result.data.topAccounts[0].handle).toBe('alice')
    expect(result.data.topAccounts[0].followers).toBe(1000)
    expect(result.data.topAccounts[1].handle).toBe('bob')
    expect(result.data.topAccounts[1].followers).toBe(2000)
    expect(result.data.narratives).toHaveLength(2)
    expect(result.data.narratives[0].theme).toBe('tech')
    expect(result.data.signals).toEqual(['Signal A', 'Signal B'])
    expect(result.cost).toBe(0.002)
    expect(result.tweets).toBe(tweets)
    expect(result.scores).toEqual(scanGrokResponse.tweetAnalysis)
  })

  it('throws when searchRecent returns 0 tweets', async () => {
    const deps = makeDeps({
      grokResponse: scanGrokResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets: [], users: [], nextToken: undefined }),
      },
    })

    await expect(buildScanSnapshot(deps, 'empty', 10, 1)).rejects.toThrow('No tweets found')
  })

  it('sets newestTweetAt from the tweets', async () => {
    const deps = makeDeps({
      grokResponse: scanGrokResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets, users, nextToken: undefined }),
      },
    })

    const result = await buildScanSnapshot(deps, 'test', 10, 1)

    // second tweet has later timestamp: 2026-03-10T13:00:00Z
    const expected = new Date('2026-03-10T13:00:00Z').getTime()
    expect(result.newestTweetAt).toBe(expected)
  })
})

describe('buildScanSnapshot — Grok-only path', () => {
  const grokOnlyScanResponse = {
    takeaway: 'Grok-only takeaway',
    actions: ['Grok-only action'],
    tweetCount: 25,
    uniqueAuthors: 15,
    estimatedEngagement: 5000,
    tweetAnalysis: [
      { index: 0, sentiment: 0.3, narrative: 'tech' },
      { index: 1, sentiment: -0.1, narrative: 'market' },
    ],
    narratives: [
      { theme: 'tech', description: 'Technology discussion' },
      { theme: 'market', description: 'Market analysis' },
    ],
    topAccounts: [{ handle: 'alice', postCount: 3, followers: 5000, avgSentiment: 0.5 }],
    signals: ['Signal X'],
  }

  it('uses Grok-only path when deps.x is null and returns correct shape', async () => {
    const deps = makeDeps({ grokResponse: grokOnlyScanResponse, x: null })

    const result = await buildScanSnapshot(deps, 'test topic', 10, 1)

    expect(result.data.metrics).toEqual({
      tweetCount: 25,
      totalEngagement: 5000,
      uniqueAuthors: 15,
      engagementPerTweet: 200,
    })
    expect(result.data.topAccounts).toEqual([
      { handle: 'alice', postCount: 3, followers: 5000, avgSentiment: 0.5 },
    ])
    expect(result.data.signals).toEqual(['Signal X'])
    expect(result.data.narratives).toHaveLength(2)
    expect(result.cost).toBe(0.002)
  })

  it('returns empty tweets array and null newestTweetAt', async () => {
    const deps = makeDeps({ grokResponse: grokOnlyScanResponse, x: null })

    const result = await buildScanSnapshot(deps, 'test', 10, 1)

    expect(result.tweets).toEqual([])
    expect(result.newestTweetAt).toBeNull()
  })
})


describe('buildPulseSnapshot — X API path', () => {
  const pulseGrokResponse = {
    takeaway: 'Mixed signals',
    actions: ['Wait for clarity'],
    tweetAnalysis: [
      { index: 0, sentiment: 0.5, narrative: 'bullish' },
      { index: 1, sentiment: -0.3, narrative: 'bearish' },
    ],
    bullSignals: ['Bull signal 1'],
    bearSignals: ['Bear signal 1'],
  }

  it('returns BuildResult with bullSignals, bearSignals, keyVoices', async () => {
    const deps = makeDeps({
      grokResponse: pulseGrokResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets, users, nextToken: undefined }),
      },
    })

    const result = await buildPulseSnapshot(deps, 'test', 10, 1)

    expect(result.data.bullSignals).toEqual(['Bull signal 1'])
    expect(result.data.bearSignals).toEqual(['Bear signal 1'])
    expect(result.data.keyVoices).toHaveLength(2)
    // alice: 10*1+5*10+2*13.5=87, bob: 20*1+3*10+1*13.5=63.5 — sorted by engagement score desc
    expect(result.data.keyVoices[0].handle).toBe('alice')
    expect(result.data.keyVoices[0].reach).toBe(1000)
    expect(result.data.keyVoices[1].handle).toBe('bob')
    expect(result.data.keyVoices[1].reach).toBe(2000)
    expect(result.data.metrics.tweetCount).toBe(2)
    expect(result.data.sentiment.avg).toBeCloseTo(0.16, 2) // engagement-weighted: (0.5*87 + -0.3*63.5) / 150.5
  })

  it('throws on empty tweets', async () => {
    const deps = makeDeps({
      grokResponse: pulseGrokResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets: [], users: [], nextToken: undefined }),
      },
    })

    await expect(buildPulseSnapshot(deps, 'empty', 10, 1)).rejects.toThrow('No tweets found')
  })
})

describe('buildPulseSnapshot — Grok-only path', () => {
  it('returns correct shape with keyVoices from Grok response', async () => {
    const grokOnlyPulseResponse = {
      takeaway: 'Grok-only pulse',
      actions: [],
      tweetCount: 20,
      uniqueAuthors: 10,
      estimatedEngagement: 3000,
      tweetAnalysis: [{ index: 0, sentiment: 0.4, narrative: 'bullish' }],
      bullSignals: ['Market up'],
      bearSignals: ['Regulation risk'],
      keyVoices: [{ handle: 'trader1', sentiment: 0.7, reach: 50000 }],
    }
    const deps = makeDeps({ grokResponse: grokOnlyPulseResponse, x: null })

    const result = await buildPulseSnapshot(deps, 'crypto', 10, 1)

    expect(result.data.keyVoices).toEqual([{ handle: 'trader1', sentiment: 0.7, reach: 50000 }])
    expect(result.data.metrics.tweetCount).toBe(20)
    expect(result.data.bullSignals).toEqual(['Market up'])
    expect(result.data.bearSignals).toEqual(['Regulation risk'])
    expect(result.tweets).toEqual([])
    expect(result.newestTweetAt).toBeNull()
  })
})


describe('buildTraceSnapshot — X API path', () => {
  const traceGrokResponse = {
    tweetAnalysis: [
      { index: 0, sentiment: 0.3, narrative: 'emergence' },
      { index: 1, sentiment: 0.1, narrative: 'amplification' },
    ],
    originIndex: 0,
    phases: [
      { name: 'emergence', tweetIndices: [0], timeframe: 'Mar 10 morning' },
      { name: 'amplification', tweetIndices: [1], timeframe: 'Mar 10 afternoon' },
    ],
    mutations: [{ original: 'original take', variant: 'evolved take' }],
  }

  it('returns timeline, mutations, origin from Grok analysis', async () => {
    const deps = makeDeps({
      grokResponse: traceGrokResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets, users, nextToken: undefined }),
      },
    })

    const result = await buildTraceSnapshot(deps, 'narrative test', 10, 1)

    expect(result.data.origin).toEqual({
      account: 'alice',
      date: '2026-03-10T12:00:00Z',
      tweetId: '1',
      content: 'hello world',
    })
    expect(result.data.timeline).toHaveLength(2)
    expect(result.data.timeline[0].phase).toBe('emergence')
    expect(result.data.timeline[0].tweetCount).toBe(1)
    expect(result.data.timeline[0].keyAmplifiers).toContain('alice')
    expect(result.data.timeline[1].phase).toBe('amplification')
    expect(result.data.mutations).toEqual([{ original: 'original take', variant: 'evolved take' }])
    expect(result.data.reach.totalTweets).toBe(2)
    expect(result.data.reach.uniqueAuthors).toBe(2)
  })

  it('originIndex out of bounds — origin is null', async () => {
    const outOfBoundsResponse = {
      ...traceGrokResponse,
      originIndex: 999,
    }
    const deps = makeDeps({
      grokResponse: outOfBoundsResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets, users, nextToken: undefined }),
      },
    })

    const result = await buildTraceSnapshot(deps, 'narrative', 10, 1)

    expect(result.data.origin).toBeNull()
  })
})


