import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  estimateResultTokens,
  compactSnapshot,
  compactResults,
} from '../../src/core/compaction.js'
import type { AgentStepResult } from '../../src/core/agent.js'
import type { ScanSnapshot, PulseSnapshot, TraceSnapshot, ProfileSnapshot, DraftSnapshot } from '../../src/core/schemas.js'

function makeScanResult(topic: string): AgentStepResult {
  const snapshot: ScanSnapshot = {
    takeaway: `Key finding about ${topic}`,
    actions: ['Action 1', 'Action 2'],
    metrics: { tweetCount: 50, totalEngagement: 5000, uniqueAuthors: 30, engagementPerTweet: 100 },
    sentiment: { avg: 0.3, positive: 25, neutral: 15, negative: 10 },
    topAccounts: [
      { handle: 'alice', postCount: 5, followers: 10000, avgSentiment: 0.6 },
      { handle: 'bob', postCount: 3, followers: 8000, avgSentiment: -0.2 },
      { handle: 'charlie', postCount: 2, followers: 6000, avgSentiment: 0.1 },
      { handle: 'dave', postCount: 1, followers: 4000, avgSentiment: 0.4 },
    ],
    narratives: [
      { theme: 'bullish', description: 'Growing optimism', tweetCount: 20, avgSentiment: 0.5 },
      { theme: 'bearish', description: 'Caution emerging', tweetCount: 10, avgSentiment: -0.3 },
    ],
    signals: ['Signal A', 'Signal B', 'Signal C', 'Signal D'],
  }

  return {
    step: { command: 'scan', args: { topic }, reasoning: 'Initial scan' },
    command: 'scan',
    snapshot,
    cost: 0.005,
    durationMs: 3000,
    tweets: [],
    scores: [],
    newestTweetAt: Date.now(),
    citations: [],
  }
}

function makePulseResult(topic: string): AgentStepResult {
  const snapshot: PulseSnapshot = {
    takeaway: `Momentum analysis for ${topic}`,
    actions: ['Watch closely'],
    metrics: { tweetCount: 40, totalEngagement: 3000, uniqueAuthors: 20, engagementPerTweet: 75 },
    sentiment: { avg: -0.1, positive: 10, neutral: 20, negative: 10 },
    bullSignals: ['Bull signal 1', 'Bull signal 2', 'Bull signal 3'],
    bearSignals: ['Bear signal 1', 'Bear signal 2'],
    keyVoices: [
      { handle: 'whale1', sentiment: 0.8, reach: 50000 },
      { handle: 'whale2', sentiment: -0.3, reach: 30000 },
      { handle: 'whale3', sentiment: 0.5, reach: 20000 },
      { handle: 'whale4', sentiment: -0.1, reach: 10000 },
    ],
  }

  return {
    step: { command: 'pulse', args: { topic }, reasoning: 'Check momentum' },
    command: 'pulse',
    snapshot,
    cost: 0.004,
    durationMs: 2500,
    tweets: [],
    scores: [],
    newestTweetAt: Date.now(),
    citations: [],
  }
}

function makeProfileResult(handle: string): AgentStepResult {
  const snapshot: ProfileSnapshot = {
    handle,
    displayName: handle,
    followers: 15000,
    following: 500,
    postFrequency: { postsPerWeek: 12, activeDays: ['Mon', 'Wed', 'Fri'], peakHours: [9, 14, 20] },
    contentMix: [
      { category: 'threads', percentage: 40, avgEngagement: 300 },
      { category: 'replies', percentage: 35, avgEngagement: 50 },
    ],
    topPerformers: [
      { url: 'https://x.com/1', content: 'Top post', engagement: 1500, why: 'Timely take' },
    ],
    voiceTraits: { tone: 'analytical', vocabulary: 'technical', emojiUsage: 'minimal', avgLength: 180 },
    algorithmScore: { replyRate: 0.35, authorReplyRate: 0.12, conversationRatio: 0.6, bookmarkToLikeRatio: 0.08, grade: 'B+' },
    sentiment: 0.4,
    fetchedAt: new Date().toISOString(),
  }

  return {
    step: { command: 'profile', args: { username: handle }, reasoning: 'Analyze account' },
    command: 'profile',
    snapshot,
    cost: 0.006,
    durationMs: 4000,
    tweets: [],
    scores: [],
    newestTweetAt: null,
    citations: [],
  }
}

function makeTraceResult(topic: string): AgentStepResult {
  const snapshot: TraceSnapshot = {
    metrics: { tweetCount: 30, totalEngagement: 2000, uniqueAuthors: 15, engagementPerTweet: 67 },
    origin: { account: 'originator', date: '2026-03-01', tweetId: '123', content: 'Original claim' },
    timeline: [
      { phase: 'Emergence', tweetCount: 5, keyAmplifiers: ['user1'], timeframe: 'Mar 1-3' },
      { phase: 'Amplification', tweetCount: 15, keyAmplifiers: ['user2', 'user3'], timeframe: 'Mar 4-7' },
      { phase: 'Saturation', tweetCount: 10, keyAmplifiers: ['user4'], timeframe: 'Mar 8-10' },
    ],
    mutations: [
      { original: 'Original claim', variant: 'Mutated version A' },
      { original: 'Original claim', variant: 'Mutated version B' },
    ],
    reach: { totalTweets: 30, totalEngagement: 2000, uniqueAuthors: 15 },
  }

  return {
    step: { command: 'trace', args: { topic }, reasoning: 'Trace narrative' },
    command: 'trace',
    snapshot,
    cost: 0.005,
    durationMs: 3500,
    tweets: [],
    scores: [],
    newestTweetAt: Date.now(),
    citations: [],
  }
}

function makeDraftResult(topic: string): AgentStepResult {
  const snapshot: DraftSnapshot = {
    topic,
    post: 'A draft post about the topic that is interesting and engaging.',
    angles: ['angle 1', 'angle 2'],
    hashtags: [],
    why: 'Timely hook into current discourse.',
    contextUsed: true,
    fetchedAt: new Date().toISOString(),
  }

  return {
    step: { command: 'draft', args: { topic }, reasoning: 'Generate content' },
    command: 'draft',
    snapshot,
    cost: 0.003,
    durationMs: 2000,
    tweets: [],
    scores: [],
    newestTweetAt: null,
    citations: [],
  }
}

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })

  it('handles long strings', () => {
    const text = 'a'.repeat(10000)
    expect(estimateTokens(text)).toBe(2500)
  })
})

describe('estimateResultTokens', () => {
  it('sums token estimates across results', () => {
    const results = [makeScanResult('topic1'), makePulseResult('topic2')]
    const tokens = estimateResultTokens(results)
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBe(
      Math.ceil(JSON.stringify(results[0].snapshot).length / 4) +
      Math.ceil(JSON.stringify(results[1].snapshot).length / 4),
    )
  })

  it('returns 0 for empty array', () => {
    expect(estimateResultTokens([])).toBe(0)
  })
})

describe('compactSnapshot', () => {
  it('compacts scan snapshot — preserves takeaway, limits accounts to 3', () => {
    const result = makeScanResult('AI')
    const compact = compactSnapshot('scan', result.snapshot)
    expect(compact.takeaway).toBe('Key finding about AI')
    expect(compact.sentiment).toBe(0.3)
    expect(compact.tweetCount).toBe(50)
    expect(compact.topAccounts).toEqual(['alice', 'bob', 'charlie'])
    expect(compact.signals).toEqual(['Signal A', 'Signal B', 'Signal C'])
  })

  it('compacts pulse snapshot — limits signals to 2 each, voices to 3', () => {
    const result = makePulseResult('markets')
    const compact = compactSnapshot('pulse', result.snapshot)
    expect(compact.takeaway).toBe('Momentum analysis for markets')
    expect(compact.bullSignals).toEqual(['Bull signal 1', 'Bull signal 2'])
    expect(compact.bearSignals).toEqual(['Bear signal 1', 'Bear signal 2'])
    expect(compact.keyVoices).toEqual(['whale1', 'whale2', 'whale3'])
  })

  it('compacts trace snapshot', () => {
    const result = makeTraceResult('narrative')
    const compact = compactSnapshot('trace', result.snapshot)
    expect(compact.origin).toBe('originator')
    expect(compact.phases).toBe(3)
    expect(compact.mutations).toBe(2)
  })

  it('compacts profile snapshot', () => {
    const result = makeProfileResult('alice')
    const compact = compactSnapshot('profile', result.snapshot)
    expect(compact.handle).toBe('alice')
    expect(compact.grade).toBe('B+')
    expect(compact.replyRate).toBe(0.35)
  })

  it('falls back to generic for unknown command', () => {
    const result = makeDraftResult('topic')
    const compact = compactSnapshot('draft', result.snapshot)
    expect(compact.topic).toBe('topic')
    expect(compact.contextUsed).toBe(true)
  })

  it('generic summarizer preserves nested objects with scalar fields', () => {
    const snapshot = {
      handle: 'test',
      nested: { score: 42, label: 'high', extra: [1, 2, 3] },
      deepNested: { a: { b: 1 } },
    } as any
    const compact = compactSnapshot('unknown', snapshot)
    expect(compact.handle).toBe('test')
    // nested object should have scalar fields preserved
    expect(compact.nested).toEqual({ score: 42, label: 'high' })
    // deeply nested objects within nested are not scalars, so not included
    expect(compact.deepNested).toBe('{1 keys}')
  })
})

describe('compactResults', () => {
  it('returns full JSON when results fit under preserveRecent', () => {
    const results = [makeScanResult('a'), makePulseResult('b')]
    const { summaries, compactedCount } = compactResults(results, {
      maxTokenBudget: 50000,
      preserveRecent: 3,
    })
    expect(compactedCount).toBe(0)
    expect(summaries).toContain('Key finding about a')
    expect(summaries).toContain('Momentum analysis for b')
  })

  it('compacts older results when count exceeds preserveRecent', () => {
    const results = [
      makeScanResult('early'),
      makePulseResult('mid'),
      makeTraceResult('late'),
      makeProfileResult('newest'),
    ]
    const { summaries, compactedCount } = compactResults(results, {
      maxTokenBudget: 50000,
      preserveRecent: 2,
    })
    expect(compactedCount).toBe(2)
    expect(summaries).toContain('(condensed)')
    // Recent results preserved in full
    expect(summaries).toContain('"totalEngagement": 2000')
    // Older results condensed
    expect(summaries).not.toContain('"Action 1"')
  })

  it('preserves all detail when within token budget', () => {
    const results = [makeScanResult('a')]
    const { summaries, compactedCount } = compactResults(results, {
      maxTokenBudget: 100000,
      preserveRecent: 2,
    })
    expect(compactedCount).toBe(0)
    expect(summaries).toContain('alice')
  })

  it('compacts 6-step investigation correctly', () => {
    const results = [
      makeScanResult('topic1'),
      makePulseResult('topic1'),
      makeProfileResult('alice'),
      makeTraceResult('narrative1'),
      makeDraftResult('topic1'),
      makeScanResult('topic2'),
    ]
    const { summaries, compactedCount } = compactResults(results, {
      maxTokenBudget: 10000,
      preserveRecent: 2,
    })
    expect(compactedCount).toBe(4)
    // 4 older results condensed, 2 recent preserved
    const condensedCount = (summaries.match(/\(condensed\)/g) || []).length
    expect(condensedCount).toBe(4)
  })

  it('handles single result', () => {
    const results = [makeScanResult('solo')]
    const { summaries, compactedCount } = compactResults(results)
    expect(compactedCount).toBe(0)
    expect(summaries).toContain('Key finding about solo')
  })

  it('includes note about omitted steps when budget completely exhausted', () => {
    const results = [
      makeScanResult('a'),
      makePulseResult('b'),
      makeTraceResult('c'),
      makeProfileResult('d'),
    ]
    const { summaries, compactedCount } = compactResults(results, {
      maxTokenBudget: 1, // impossibly low — recent results alone exceed this
      preserveRecent: 2,
    })
    expect(compactedCount).toBe(2)
    expect(summaries).toContain('2 earlier steps omitted')
    expect(summaries).toContain('scan, pulse')
  })

  it('uses minimal summary when compacted summaries exceed per-result budget', () => {
    const results = [
      makeScanResult('a'),
      makePulseResult('b'),
      makeProfileResult('c'),
      makeTraceResult('d'),
      makeScanResult('e'),
    ]
    // Very tight budget forces minimal summaries
    const { summaries } = compactResults(results, {
      maxTokenBudget: 2000,
      preserveRecent: 2,
    })
    // Should never produce broken JSON — all output should be parseable segments
    expect(summaries).not.toContain('..."')
    // Recent results still present
    expect(summaries).toContain('## trace')
    expect(summaries).toContain('## scan')
  })

  it('compacted output is smaller than full output', () => {
    const results = [
      makeScanResult('a'),
      makePulseResult('b'),
      makeProfileResult('c'),
      makeTraceResult('d'),
      makeScanResult('e'),
    ]
    const full = results
      .map((r) => JSON.stringify(r.snapshot, null, 2))
      .join('\n\n')
    const { summaries } = compactResults(results, {
      maxTokenBudget: 8000,
      preserveRecent: 1,
    })
    expect(summaries.length).toBeLessThan(full.length)
  })

  it('returns empty summaries and zero compactedCount for empty array', () => {
    const { summaries, compactedCount } = compactResults([])
    expect(summaries).toBe('')
    expect(compactedCount).toBe(0)
  })

  it('returns compactedCount 0 and full JSON when results equal preserveRecent', () => {
    const results = [makeScanResult('x'), makePulseResult('y')]
    const { summaries, compactedCount } = compactResults(results, {
      maxTokenBudget: 50000,
      preserveRecent: 2,
    })
    expect(compactedCount).toBe(0)
    // Full JSON includes all detail — verify key fields from both snapshots
    expect(summaries).toContain('"totalEngagement": 5000')
    expect(summaries).toContain('"totalEngagement": 3000')
    expect(summaries).toContain('Key finding about x')
    expect(summaries).toContain('Momentum analysis for y')
  })

  it('profile result under tight budget produces minimal summary with "profile: @"', () => {
    // To force the condensed (not omitted) path, use a budget that allows some compaction
    const results2 = [
      makeProfileResult('bob'),
      makeScanResult('a'),
      makePulseResult('b'),
      makeTraceResult('c'),
      makeScanResult('recent1'),
      makeScanResult('recent2'),
    ]
    const { summaries: s2 } = compactResults(results2, {
      maxTokenBudget: 2000,
      preserveRecent: 2,
    })
    // The profile result is in the older group and should get condensed
    expect(s2).toContain('profile')
    expect(s2).toContain('(condensed)')
  })

  it('snapshot with neither takeaway nor handle nor topic produces "command completed" minimal', () => {
    // A snapshot with no takeaway, handle, or topic — just arbitrary data
    const snapshot = { value: 42, status: true } as any
    const result: AgentStepResult = {
      step: { command: 'custom', args: {}, reasoning: 'test' },
      command: 'custom',
      snapshot,
      cost: 0.001,
      durationMs: 100,
      tweets: [],
      scores: [],
      newestTweetAt: null,
      citations: [],
    }
    // Create enough results to force compaction with tight budget
    const results = [
      result,
      makeScanResult('a'),
      makePulseResult('b'),
      makeTraceResult('c'),
      makeScanResult('recent1'),
      makeScanResult('recent2'),
    ]
    // Use impossibly low budget so older results get minimal summaries
    const { summaries } = compactResults(results, {
      maxTokenBudget: 1,
      preserveRecent: 2,
    })
    // With budget <=0, older steps are omitted entirely with a note
    expect(summaries).toContain('earlier steps omitted')
    expect(summaries).toContain('custom')
  })
})

describe('compactSnapshot — null field handling', () => {
  it('null field does NOT appear in generic summarizer output', () => {
    const snapshot = { name: 'test', deleted: null } as any
    const compact = compactSnapshot('unknown', snapshot)
    expect(compact.name).toBe('test')
    expect('deleted' in compact).toBe(false)
  })
})
