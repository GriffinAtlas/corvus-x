import { describe, it, expect, vi } from 'vitest'
import {
  computeGrokOnlyMetrics,
  computeGrokOnlySentiment,
  computeGrokOnlyNarratives,
} from '../../../src/core/builders/grok-only.js'
import { buildScanSnapshot } from '../../../src/core/builders/scan.js'
import { buildPulseSnapshot } from '../../../src/core/builders/pulse.js'
import { buildTraceSnapshot } from '../../../src/core/builders/trace.js'
import { buildGatherSnapshot } from '../../../src/core/builders/gather.js'
import { buildReadSnapshot, extractTweetId } from '../../../src/core/builders/read.js'
import { buildScopeSnapshot } from '../../../src/core/builders/scope.js'
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
    expect(result).toEqual({ avg: 0, positive: 0, neutral: 0, negative: 0 })
  })

  it('classifies sentiments correctly and averages', () => {
    const analysis = [
      { sentiment: 0.5 }, // positive (> 0.2)
      { sentiment: 0.1 }, // neutral
      { sentiment: -0.3 }, // negative (< -0.2)
      { sentiment: -0.5 }, // negative
      { sentiment: 0.2 }, // neutral (exactly 0.2, not > 0.2)
    ]
    const result = computeGrokOnlySentiment(analysis)
    expect(result.positive).toBe(1)
    expect(result.neutral).toBe(2)
    expect(result.negative).toBe(2)
    // avg = (0.5 + 0.1 + -0.3 + -0.5 + 0.2) / 5 = 0.0 / 5 = 0
    expect(result.avg).toBe(0)
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


describe('extractTweetId', () => {
  it('returns numeric string as-is', () => {
    expect(extractTweetId('1234567890')).toBe('1234567890')
  })

  it('extracts ID from /status/123 URL', () => {
    expect(extractTweetId('https://x.com/user/status/1234567890')).toBe('1234567890')
  })

  it('extracts ID from URL with extra path after status ID', () => {
    expect(extractTweetId('https://x.com/user/status/1234567890/photo/1')).toBe('1234567890')
  })

  it('returns null for non-numeric, non-URL input', () => {
    expect(extractTweetId('hello world')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractTweetId('')).toBeNull()
  })
})


describe('buildScanSnapshot — X API path', () => {
  const scanGrokResponse = {
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
    expect(result.data.sentiment.avg).toBeCloseTo(0.15, 2) // (0.5 + -0.2)/2
    expect(result.data.sentiment.positive).toBe(1) // 0.5 > 0.3
    expect(result.data.sentiment.neutral).toBe(1) // -0.2 between thresholds
    expect(result.data.sentiment.negative).toBe(0)
    expect(result.data.topAccounts).toHaveLength(2)
    expect(result.data.topAccounts[0].handle).toBe('bob') // sorted by followers desc
    expect(result.data.topAccounts[0].followers).toBe(2000)
    expect(result.data.topAccounts[1].handle).toBe('alice')
    expect(result.data.topAccounts[1].followers).toBe(1000)
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
    expect(result.data.keyVoices[0].handle).toBe('bob') // sorted by reach desc
    expect(result.data.keyVoices[0].reach).toBe(2000)
    expect(result.data.keyVoices[1].handle).toBe('alice')
    expect(result.data.keyVoices[1].reach).toBe(1000)
    expect(result.data.metrics.tweetCount).toBe(2)
    expect(result.data.sentiment.avg).toBeCloseTo(0.1, 2) // (0.5 + -0.3)/2
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


describe('buildReadSnapshot — X API path', () => {
  const readGrokResponse = {
    analysis: 'This is a significant tweet about technology.',
    significance: 'high' as const,
    signals: ['High engagement', 'Notable author'],
  }

  it('returns analysis, significance, signals, tweet data', async () => {
    const mockTweet: Tweet = {
      id: '999',
      text: 'Breaking news!',
      authorId: 'u1',
      createdAt: '2026-03-10T15:00:00Z',
      metrics: { likes: 100, retweets: 50, replies: 20, impressions: 5000 },
    }
    const deps = makeDeps({
      grokResponse: readGrokResponse,
      x: {
        getTweet: vi.fn().mockResolvedValue(mockTweet),
        getUserById: vi.fn().mockResolvedValue(users[0]),
      },
    })

    const result = await buildReadSnapshot(deps, '999')

    expect(result.data.tweet.id).toBe('999')
    expect(result.data.tweet.author).toBe('alice')
    expect(result.data.tweet.text).toBe('Breaking news!')
    expect(result.data.tweet.engagement).toEqual(mockTweet.metrics)
    expect(result.data.tweet.postedAt).toBe('2026-03-10T15:00:00Z')
    expect(result.data.analysis).toBe('This is a significant tweet about technology.')
    expect(result.data.significance).toBe('high')
    expect(result.data.signals).toEqual(['High engagement', 'Notable author'])
    expect(result.cost).toBe(0.002)
  })

  it('handles getUserById failure gracefully (falls back to authorId)', async () => {
    const mockTweet: Tweet = {
      id: '999',
      text: 'A tweet',
      authorId: 'unknown-author-id',
      createdAt: '2026-03-10T15:00:00Z',
      metrics: { likes: 5, retweets: 1, replies: 0, impressions: 50 },
    }
    const deps = makeDeps({
      grokResponse: readGrokResponse,
      x: {
        getTweet: vi.fn().mockResolvedValue(mockTweet),
        getUserById: vi.fn().mockRejectedValue(new Error('User not found')),
      },
    })

    const result = await buildReadSnapshot(deps, '999')

    expect(result.data.tweet.author).toBe('unknown-author-id')
  })
})

describe('buildReadSnapshot — Grok-only path', () => {
  it('returns Grok-sourced tweet data', async () => {
    const grokOnlyReadResponse = {
      tweet: {
        id: '888',
        author: 'someone',
        text: 'Grok found this tweet',
        engagement: { likes: 30, retweets: 10, replies: 5, impressions: 500 },
        postedAt: '2026-03-10T14:00:00Z',
      },
      analysis: 'An insightful post.',
      significance: 'medium' as const,
      signals: ['Growing topic'],
    }
    const deps = makeDeps({ grokResponse: grokOnlyReadResponse, x: null })

    const result = await buildReadSnapshot(deps, '888')

    expect(result.data.tweet.id).toBe('888')
    expect(result.data.tweet.author).toBe('someone')
    expect(result.data.tweet.text).toBe('Grok found this tweet')
    expect(result.data.analysis).toBe('An insightful post.')
    expect(result.data.significance).toBe('medium')
    expect(result.tweets).toEqual([])
    expect(result.newestTweetAt).toBeNull()
  })

  it('falls back to default tweet when grok.tweet is null', async () => {
    const grokOnlyReadResponse = {
      tweet: null,
      analysis: 'Could not find the tweet.',
      significance: 'low' as const,
      signals: [],
    }
    const deps = makeDeps({ grokResponse: grokOnlyReadResponse, x: null })

    const result = await buildReadSnapshot(deps, '777')

    expect(result.data.tweet).toEqual({
      id: '777',
      author: 'unknown',
      text: '',
      engagement: { likes: 0, retweets: 0, replies: 0, impressions: 0 },
      postedAt: '',
    })
    expect(result.data.analysis).toBe('Could not find the tweet.')
  })
})


describe('buildScopeSnapshot — X API path', () => {
  const scopeGrokResponse = {
    contentPatterns: ['Tech commentary', 'Thread posting'],
    recentFocus: ['AI', 'Crypto'],
    networkPosition: 'Central node in tech Twitter',
    influence: 'high' as const,
    signalValue: 'high' as const,
  }

  it('returns account info, recentActivity with topTweet, patterns, focus', async () => {
    const userTweets: Tweet[] = [
      {
        id: 't1',
        text: 'My first tweet',
        authorId: 'u1',
        createdAt: '2026-03-10T10:00:00Z',
        metrics: { likes: 5, retweets: 2, replies: 1, impressions: 80 },
      },
      {
        id: 't2',
        text: 'My best tweet',
        authorId: 'u1',
        createdAt: '2026-03-10T11:00:00Z',
        metrics: { likes: 50, retweets: 20, replies: 10, impressions: 500 },
      },
    ]
    const deps = makeDeps({
      grokResponse: scopeGrokResponse,
      x: {
        getUser: vi.fn().mockResolvedValue(users[0]),
        getUserTweets: vi.fn().mockResolvedValue(userTweets),
      },
    })

    const result = await buildScopeSnapshot(deps, 'alice', 10)

    expect(result.data.account).toEqual({
      handle: 'alice',
      followers: 1000,
      following: 200,
      tweetCount: 500,
    })
    // avgEngagement: tweet1 = 5+2+1 = 8, tweet2 = 50+20+10 = 80, total = 88, avg = 44
    expect(result.data.recentActivity.avgEngagement).toBe(44)
    expect(result.data.recentActivity.postsAnalyzed).toBe(2)
    expect(result.data.recentActivity.topTweet).toEqual({
      id: 't2',
      text: 'My best tweet',
      engagement: 80,
    })
    expect(result.data.contentPatterns).toEqual(['Tech commentary', 'Thread posting'])
    expect(result.data.recentFocus).toEqual(['AI', 'Crypto'])
    expect(result.data.networkPosition).toBe('Central node in tech Twitter')
    expect(result.data.influence).toBe('high')
    expect(result.data.signalValue).toBe('high')
  })

  it('with zero tweets — topTweet is null, avgEngagement is 0', async () => {
    const deps = makeDeps({
      grokResponse: scopeGrokResponse,
      x: {
        getUser: vi.fn().mockResolvedValue(users[0]),
        getUserTweets: vi.fn().mockResolvedValue([]),
      },
    })

    const result = await buildScopeSnapshot(deps, 'alice', 10)

    expect(result.data.recentActivity.topTweet).toBeNull()
    expect(result.data.recentActivity.avgEngagement).toBe(0)
    expect(result.data.recentActivity.postsAnalyzed).toBe(0)
  })
})

describe('buildScopeSnapshot — Grok-only path', () => {
  it('falls back to defaults when grok response missing account/recentActivity', async () => {
    const grokOnlyScopeResponse = {
      account: null,
      recentActivity: null,
      contentPatterns: ['Pattern 1'],
      recentFocus: ['Focus 1'],
      networkPosition: 'Peripheral',
      influence: 'low' as const,
      signalValue: 'low' as const,
    }
    const deps = makeDeps({ grokResponse: grokOnlyScopeResponse, x: null })

    const result = await buildScopeSnapshot(deps, 'unknown_user', 10)

    expect(result.data.account).toEqual({
      handle: 'unknown_user',
      followers: 0,
      following: 0,
      tweetCount: 0,
    })
    expect(result.data.recentActivity).toEqual({
      avgEngagement: 0,
      postsAnalyzed: 0,
      topTweet: null,
    })
    expect(result.data.contentPatterns).toEqual(['Pattern 1'])
    expect(result.data.influence).toBe('low')
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


describe('buildGatherSnapshot — X API path', () => {
  it('returns webContext and outlook along with computed metrics', async () => {
    const gatherGrokResponse = {
      tweetAnalysis: [
        { index: 0, sentiment: 0.4, narrative: 'tech' },
        { index: 1, sentiment: -0.1, narrative: 'policy' },
      ],
      narratives: [
        { theme: 'tech', description: 'Tech trends' },
        { theme: 'policy', description: 'Policy discussion' },
      ],
      signals: ['Growing interest'],
      webContext: ['Recent news article', 'Conference announcement'],
      outlook: 'Positive trajectory expected',
    }
    const deps = makeDeps({
      grokResponse: gatherGrokResponse,
      x: {
        searchRecent: vi.fn().mockResolvedValue({ tweets, users, nextToken: undefined }),
      },
    })

    const result = await buildGatherSnapshot(deps, 'AI trends', 10, 1)

    expect(result.data.webContext).toEqual(['Recent news article', 'Conference announcement'])
    expect(result.data.outlook).toBe('Positive trajectory expected')
    expect(result.data.metrics.tweetCount).toBe(2)
    expect(result.data.sentiment.avg).toBeCloseTo(0.15, 2) // (0.4 + -0.1)/2
    expect(result.data.sentiment.positive).toBe(1)
    expect(result.data.sentiment.neutral).toBe(1)
    expect(result.data.sentiment.negative).toBe(0)
    expect(result.data.topPosts).toHaveLength(2) // sorted by engagement desc
    expect(result.data.topPosts[0].id).toBe('2')
    expect(result.data.topPosts[0].engagement).toBe(224)
    expect(result.data.topPosts[1].id).toBe('1')
    expect(result.data.topPosts[1].engagement).toBe(117)
    expect(result.data.narratives).toHaveLength(2)
    expect(result.data.narratives[0].theme).toBe('tech')
    expect(result.cost).toBe(0.002)
    expect(result.newestTweetAt).toBe(new Date('2026-03-10T13:00:00Z').getTime())
  })
})
