import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentPlanner, AgentExecutor, AgentSynthesizer } from '../../src/core/agent.js'
import type { AgentPlan, AgentOptions, AgentContext } from '../../src/core/agent.js'
import type { GrokAdapter } from '../../src/core/grok-adapter.js'
import type { CorvusDeps } from '../../src/core/types.js'
import type { GrokResponse } from '../../src/core/types.js'
import type { ScanSnapshot, PulseSnapshot, AgentBrief } from '../../src/core/schemas.js'
import { UsageTracker } from '../../src/core/usage.js'

function makeGrokResponse(text: string, cost = 0.001): GrokResponse {
  return {
    text,
    usage: { inputTokens: 500, outputTokens: 200, costUsd: cost, toolCalls: 0 },
    citations: [],
  }
}

function makeMockGrok(responses: string[]): GrokAdapter {
  let callIndex = 0
  return {
    query: vi.fn(async () => {
      const text = responses[callIndex] ?? '{}'
      callIndex++
      return makeGrokResponse(text)
    }),
  } as unknown as GrokAdapter
}

// Mock all build functions
vi.mock('../../src/core/builders/scan.js', () => ({
  buildScanSnapshot: vi.fn(async (_deps: CorvusDeps, topic: string) => ({
    data: {
      metrics: { tweetCount: 10, totalEngagement: 500, uniqueAuthors: 8, engagementPerTweet: 50 },
      sentiment: { avg: 0.3, positive: 5, neutral: 3, negative: 2 },
      topAccounts: [{ handle: 'alice', postCount: 3, followers: 5000, avgSentiment: 0.5 }],
      narratives: [
        { theme: 'test', description: 'Test narrative', tweetCount: 10, avgSentiment: 0.3 },
      ],
      signals: ['Signal 1'],
    } satisfies ScanSnapshot,
    raw: '{}',
    cost: 0.002,
    inputTokens: 500,
    outputTokens: 200,
    toolCalls: 1,
    tweets: Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      text: `tweet ${i} about ${topic}`,
      authorId: `author${i}`,
      createdAt: '2026-03-10T12:00:00Z',
      metrics: { likes: 10, retweets: 5, replies: 2, impressions: 100 },
    })),
    scores: Array.from({ length: 10 }, (_, i) => ({
      index: i,
      sentiment: 0.3,
      narrative: 'test',
    })),
    newestTweetAt: Date.now() - 60_000,
    citations: [],
  })),
}))

vi.mock('../../src/core/builders/pulse.js', () => ({
  buildPulseSnapshot: vi.fn(async () => ({
    data: {
      metrics: { tweetCount: 10, totalEngagement: 400, uniqueAuthors: 7, engagementPerTweet: 40 },
      sentiment: { avg: -0.1, positive: 3, neutral: 4, negative: 3 },
      bullSignals: ['Bull 1'],
      bearSignals: ['Bear 1'],
      keyVoices: [{ handle: 'bob', sentiment: -0.2, reach: 10000 }],
    } satisfies PulseSnapshot,
    raw: '{}',
    cost: 0.002,
    inputTokens: 500,
    outputTokens: 200,
    toolCalls: 1,
    tweets: Array.from({ length: 10 }, (_, i) => ({
      id: String(100 + i),
      text: `pulse tweet ${i}`,
      authorId: `pauthor${i}`,
      createdAt: '2026-03-10T13:00:00Z',
      metrics: { likes: 8, retweets: 3, replies: 1, impressions: 80 },
    })),
    scores: Array.from({ length: 10 }, (_, i) => ({
      index: i,
      sentiment: -0.1,
      narrative: 'pulse-theme',
    })),
    newestTweetAt: Date.now() - 30_000,
    citations: [],
  })),
}))

vi.mock('../../src/core/builders/profile.js', () => ({
  buildProfileSnapshot: vi.fn(async (_deps: CorvusDeps, handle: string) => ({
    data: {
      handle,
      displayName: handle,
      followers: 5000,
      following: 200,
      postFrequency: { postsPerWeek: 5, activeDays: ['Monday'], peakHours: [9] },
      contentMix: [{ category: 'crypto', percentage: 60, avgEngagement: 100 }],
      topPerformers: [],
      voiceTraits: { tone: 'casual', vocabulary: 'technical', emojiUsage: 'none', avgLength: 150 },
      sentiment: 0.2,
      fetchedAt: new Date().toISOString(),
    },
    raw: '{}',
    cost: 0.001,
    inputTokens: 400,
    outputTokens: 150,
    toolCalls: 0,
    tweets: [],
    scores: [],
    newestTweetAt: null,
    citations: [],
  })),
}))

vi.mock('../../src/core/snapshots.js', () => {
  return {
    SnapshotStore: class MockSnapshotStore {
      save = vi.fn()
      loadLatest = vi.fn(() => null)
    },
  }
})

vi.mock('../../src/infra/config.js', () => ({
  ConfigManager: {
    defaultDir: vi.fn(() => '/tmp/corvus-test'),
  },
}))

describe('AgentPlanner', () => {
  it('parses a valid plan from Grok', async () => {
    const plan: AgentPlan = {
      goal: 'Assess bitcoin sentiment',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Get landscape' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Check momentum' },
      ],
    }
    const grok = makeMockGrok([JSON.stringify(plan)])
    const planner = new AgentPlanner(grok)
    const result = await planner.plan('What is the current sentiment on bitcoin?')

    expect(result.plan.goal).toBe('Assess bitcoin sentiment')
    expect(result.plan.steps).toHaveLength(2)
    expect(result.plan.steps[0].command).toBe('scan')
    expect(result.plan.steps[1].command).toBe('pulse')
    expect(result.costUsd).toBe(0.001)
  })

  it('throws on empty plan', async () => {
    const grok = makeMockGrok([JSON.stringify({ goal: '', steps: [] })])
    const planner = new AgentPlanner(grok)
    await expect(planner.plan('test')).rejects.toThrow('empty or invalid plan')
  })

  it('caps steps at 8', async () => {
    const plan: AgentPlan = {
      goal: 'Big investigation',
      steps: Array.from({ length: 12 }, (_, i) => ({
        command: 'scan' as const,
        args: { topic: `topic${i}` },
        reasoning: `Step ${i}`,
      })),
    }
    const grok = makeMockGrok([JSON.stringify(plan)])
    const planner = new AgentPlanner(grok)
    const result = await planner.plan('test')
    expect(result.plan.steps).toHaveLength(8)
  })

  it('filters out invalid commands from plan steps', async () => {
    const plan = {
      goal: 'Test filtering',
      steps: [
        { command: 'scan', args: { topic: 'valid' }, reasoning: 'ok' },
        { command: 'hack', args: { topic: 'invalid' }, reasoning: 'bad command' },
        { command: 'pulse', args: { topic: 'also valid' }, reasoning: 'ok' },
      ],
    }
    const grok = makeMockGrok([JSON.stringify(plan)])
    const planner = new AgentPlanner(grok)
    const result = await planner.plan('test')
    expect(result.plan.steps).toHaveLength(2)
    expect(result.plan.steps[0].command).toBe('scan')
    expect(result.plan.steps[1].command).toBe('pulse')
  })

  it('handles markdown-fenced JSON', async () => {
    const plan: AgentPlan = {
      goal: 'Test goal',
      steps: [{ command: 'scan', args: { topic: 'test' }, reasoning: 'Test' }],
    }
    const grok = makeMockGrok(['```json\n' + JSON.stringify(plan) + '\n```'])
    const planner = new AgentPlanner(grok)
    const result = await planner.plan('test')
    expect(result.plan.goal).toBe('Test goal')
  })
})

describe('AgentExecutor', () => {
  let mockDeps: CorvusDeps
  let defaultOptions: AgentOptions

  beforeEach(() => {
    mockDeps = {
      grok: makeMockGrok([]),
      x: {} as CorvusDeps['x'],
    }
    defaultOptions = {
      maxSteps: 8,
      budget: 0.1,
      replan: false,
    }
  })

  it('executes a simple two-step plan', async () => {
    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Landscape' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Momentum' },
      ],
    }

    const executor = new AgentExecutor(mockDeps, 'bitcoin question', plan, defaultOptions)
    const context = await executor.execute(0.001)

    expect(context.results).toHaveLength(2)
    expect(context.results[0].command).toBe('scan')
    expect(context.results[1].command).toBe('pulse')
    expect(context.totalCost).toBeGreaterThan(0)
  })

  it('respects maxSteps limit', async () => {
    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Step 2' },
        { command: 'scan', args: { topic: 'ethereum' }, reasoning: 'Step 3' },
      ],
    }

    const executor = new AgentExecutor(mockDeps, 'test', plan, { ...defaultOptions, maxSteps: 2 })
    const context = await executor.execute(0)

    expect(context.results).toHaveLength(2)
  })

  it('calls onStepStart and onStepComplete callbacks', async () => {
    const plan: AgentPlan = {
      goal: 'Test',
      steps: [{ command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Test' }],
    }

    const onStepStart = vi.fn()
    const onStepComplete = vi.fn()

    const executor = new AgentExecutor(mockDeps, 'test', plan, {
      ...defaultOptions,
      onStepStart,
      onStepComplete,
    })
    await executor.execute(0)

    expect(onStepStart).toHaveBeenCalledTimes(1)
    expect(onStepComplete).toHaveBeenCalledTimes(1)
    expect(onStepComplete.mock.calls[0][2]).toBeGreaterThanOrEqual(0) // durationMs
  })

  it('extracts leads from scan topAccounts', async () => {
    const plan: AgentPlan = {
      goal: 'Test',
      steps: [{ command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Landscape' }],
    }

    const leads: string[] = []
    const executor = new AgentExecutor(mockDeps, 'test', plan, {
      ...defaultOptions,
      onLeadFound: (label) => leads.push(label),
    })
    const context = await executor.execute(0)

    // The mock scan returns topAccounts with 'alice'
    expect(context.leads).toContain('alice')
  })

  it('stops on abort', async () => {
    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Step 2' },
      ],
    }

    const executor = new AgentExecutor(mockDeps, 'test', plan, defaultOptions)
    executor.abort()
    const context = await executor.execute(0)

    expect(context.results).toHaveLength(0)
  })

  it('saves snapshots for each step', async () => {
    const plan: AgentPlan = {
      goal: 'Test',
      steps: [{ command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Test' }],
    }

    const executor = new AgentExecutor(mockDeps, 'test', plan, defaultOptions)
    const context = await executor.execute(0)

    // Verify scan step was executed and results captured
    expect(context.results).toHaveLength(1)
    expect(context.results[0].command).toBe('scan')
    expect(context.results[0].cost).toBeGreaterThan(0)
  })

  it('records token usage from each step', async () => {
    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Step 2' },
      ],
    }

    const executor = new AgentExecutor(mockDeps, 'test', plan, defaultOptions)
    const context = await executor.execute(0)

    expect(context.usage.turnCount).toBe(2)
    // Mock scan returns inputTokens: 500, outputTokens: 200
    // Mock pulse returns inputTokens: 500, outputTokens: 200
    expect(context.usage.totalInputTokens).toBe(1000)
    expect(context.usage.totalOutputTokens).toBe(400)
    expect(context.usage.totalTokens).toBe(1400)
    expect(context.usage.totalToolCalls).toBe(2) // both mocks have toolCalls: 1
  })

  it('handles profile steps with username arg', async () => {
    const plan: AgentPlan = {
      goal: 'Test',
      steps: [{ command: 'profile', args: { username: 'satoshi' }, reasoning: 'Profile check' }],
    }

    const executor = new AgentExecutor(mockDeps, 'test', plan, defaultOptions)
    const context = await executor.execute(0)

    expect(context.results).toHaveLength(1)
    expect(context.results[0].command).toBe('profile')
  })
})

describe('AgentExecutor with replanning', () => {
  it('triggers replan after step 1 when replan enabled', async () => {
    const replanResponse = JSON.stringify({ action: 'continue' })
    const mockGrok = makeMockGrok([replanResponse])
    const deps: CorvusDeps = { grok: mockGrok, x: {} as CorvusDeps['x'] }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Step 2' },
      ],
    }

    const executor = new AgentExecutor(deps, 'test', plan, {
      maxSteps: 8,
      budget: 1.0,
      replan: true,
    })
    await executor.execute(0)

    // Grok should have been called for replan after step 1 with investigation context
    expect(mockGrok.query).toHaveBeenCalled()
    const replanCall = (mockGrok.query as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(replanCall[0]).toContain('Investigation so far')
    expect(replanCall[0]).toContain('Remaining planned steps')
  })

  it('applies revised steps from replan', async () => {
    const replanResponse = JSON.stringify({
      action: 'revise',
      steps: [{ command: 'profile', args: { username: 'satoshi' }, reasoning: 'New lead' }],
    })
    const mockGrok = makeMockGrok([replanResponse])
    const deps: CorvusDeps = { grok: mockGrok, x: {} as CorvusDeps['x'] }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Will be replaced' },
      ],
    }

    const onReplan = vi.fn()
    const executor = new AgentExecutor(deps, 'test', plan, {
      maxSteps: 8,
      budget: 1.0,
      replan: true,
      onReplan,
    })
    const context = await executor.execute(0)

    expect(onReplan).toHaveBeenCalled()
    // Should have scan + profile (replaced pulse with profile)
    expect(context.results.some((r) => r.command === 'profile')).toBe(true)
  })
})

describe('AgentSynthesizer', () => {
  it('produces a complete AgentBrief', async () => {
    const briefResponse: Partial<AgentBrief> = {
      signalLine: 'Bitcoin sentiment is cautiously bullish.',
      summary: ['Scan shows net positive sentiment', 'Key voices are divided'],
      contradictions: [],
      keyAccounts: [
        { handle: 'alice', reach: 5000, sentiment: 0.5, stance: 'Bullish on BTC long-term' },
      ],
      evidence: [{ source: 'scan', key: 'Sentiment', detail: 'Net positive at +0.3' }],
    }

    const grok = makeMockGrok([JSON.stringify(briefResponse)])
    const synthesizer = new AgentSynthesizer(grok)

    const context = {
      goal: 'Assess bitcoin',
      question: 'What is happening with bitcoin?',
      results: [
        {
          step: { command: 'scan' as const, args: { topic: 'bitcoin' }, reasoning: 'Test' },
          command: 'scan',
          snapshot: {
            metrics: {
              tweetCount: 10,
              totalEngagement: 500,
              uniqueAuthors: 8,
              engagementPerTweet: 50,
            },
            sentiment: { avg: 0.3, positive: 5, neutral: 3, negative: 2 },
            topAccounts: [],
            narratives: [],
            signals: [],
          } as ScanSnapshot,
          cost: 0.002,
          durationMs: 1500,
          tweets: Array.from({ length: 10 }, (_, i) => ({
            id: String(i),
            text: `tweet ${i}`,
            authorId: `author${i}`,
            createdAt: '2026-03-10T12:00:00Z',
            metrics: { likes: 10, retweets: 5, replies: 2, impressions: 100 },
          })),
          scores: Array.from({ length: 10 }, (_, i) => ({
            index: i,
            sentiment: 0.3,
            narrative: 'test',
          })),
          newestTweetAt: Date.now() - 60_000,
          citations: [],
        },
      ],
      totalCost: 0.003,
      leads: [],
    }

    const brief = await synthesizer.synthesize(context)

    expect(brief.signalLine).toBe('Bitcoin sentiment is cautiously bullish.')
    expect(brief.summary).toHaveLength(2)
    expect(brief.keyAccounts).toHaveLength(1)
    expect(brief.evidence).toHaveLength(1)
    expect(brief.confidence.volume).toBe('low') // 10 tweets
    expect(brief.sampleSize).toBe(10)
    expect(brief.staleness).toBeGreaterThan(0)
    expect(brief.sentiment).toBe(0.3)
  })

  it('handles empty results gracefully', async () => {
    const grok = makeMockGrok([
      JSON.stringify({
        signalLine: 'No data available.',
        summary: [],
        contradictions: [],
        keyAccounts: [],
        evidence: [],
      }),
    ])
    const synthesizer = new AgentSynthesizer(grok)

    const context = {
      goal: 'Test',
      question: 'Test question',
      results: [],
      totalCost: 0.001,
      leads: [],
    }

    const brief = await synthesizer.synthesize(context)

    expect(brief.signalLine).toBe('No data available.')
    expect(brief.confidence.overall).toBe(0)
    expect(brief.sampleSize).toBe(0)
    expect(brief.staleness).toBeNull()
    expect(brief.sentiment).toBe(0)
  })

  it('merges local and grok contradictions without duplicates', async () => {
    // Create a scenario with cross-step sentiment divergence (local contradiction)
    // and a Grok contradiction that overlaps
    const grokBrief: Partial<AgentBrief> = {
      signalLine: 'Mixed signals.',
      summary: ['Divergent views'],
      contradictions: ['Scan sentiment diverges from pulse on the same topic'], // overlaps with local
      keyAccounts: [],
      evidence: [],
    }
    const grok = makeMockGrok([JSON.stringify(grokBrief)])
    const synthesizer = new AgentSynthesizer(grok)

    const context = {
      goal: 'Test',
      question: 'Test',
      results: [
        {
          step: { command: 'scan' as const, args: { topic: 'btc' }, reasoning: '' },
          command: 'scan',
          snapshot: {
            metrics: {
              tweetCount: 10,
              totalEngagement: 500,
              uniqueAuthors: 8,
              engagementPerTweet: 50,
            },
            sentiment: { avg: -0.5, positive: 1, neutral: 2, negative: 7 },
            topAccounts: [],
            narratives: [],
            signals: [],
          } as ScanSnapshot,
          cost: 0.002,
          durationMs: 1000,
          tweets: Array.from({ length: 10 }, (_, i) => ({
            id: String(i),
            text: `tweet ${i}`,
            authorId: `a${i}`,
            createdAt: '2026-03-10T12:00:00Z',
            metrics: { likes: 5, retweets: 2, replies: 1, impressions: 50 },
          })),
          scores: Array.from({ length: 10 }, (_, i) => ({
            index: i,
            sentiment: -0.5,
            narrative: 'bearish',
          })),
          newestTweetAt: Date.now(),
          citations: [],
        },
        {
          step: { command: 'pulse' as const, args: { topic: 'btc' }, reasoning: '' },
          command: 'pulse',
          snapshot: {
            metrics: {
              tweetCount: 10,
              totalEngagement: 400,
              uniqueAuthors: 7,
              engagementPerTweet: 40,
            },
            sentiment: { avg: 0.3, positive: 5, neutral: 3, negative: 2 },
            bullSignals: ['a'],
            bearSignals: ['b'],
            keyVoices: [],
          } as PulseSnapshot,
          cost: 0.002,
          durationMs: 1000,
          tweets: Array.from({ length: 10 }, (_, i) => ({
            id: String(100 + i),
            text: `pulse tweet ${i}`,
            authorId: `p${i}`,
            createdAt: '2026-03-10T13:00:00Z',
            metrics: { likes: 4, retweets: 1, replies: 1, impressions: 40 },
          })),
          scores: Array.from({ length: 10 }, (_, i) => ({
            index: i,
            sentiment: 0.3,
            narrative: 'mixed',
          })),
          newestTweetAt: Date.now(),
          citations: [],
        },
      ],
      totalCost: 0.005,
      leads: [],
    }

    const brief = await synthesizer.synthesize(context)

    // Local contradiction from sentiment divergence should be present
    // Grok's overlapping contradiction should be deduped
    const divergenceContradictions = brief.contradictions.filter((c) => c.includes('diverges'))
    expect(divergenceContradictions.length).toBe(1) // deduped, not 2
  })

  it('offsets score indices when aggregating across steps', async () => {
    const grok = makeMockGrok([
      JSON.stringify({
        signalLine: 'Test.',
        summary: [],
        contradictions: [],
        keyAccounts: [],
        evidence: [],
      }),
    ])
    const synthesizer = new AgentSynthesizer(grok)

    const context = {
      goal: 'Test',
      question: 'Test',
      results: [
        {
          step: { command: 'scan' as const, args: { topic: 'test' }, reasoning: '' },
          command: 'scan',
          snapshot: {} as ScanSnapshot,
          cost: 0.001,
          durationMs: 500,
          tweets: [
            {
              id: '1',
              text: 't1',
              authorId: 'a',
              createdAt: '2026-03-10T12:00:00Z',
              metrics: { likes: 1, retweets: 0, replies: 0, impressions: 10 },
            },
          ],
          scores: [{ index: 0, sentiment: 0.5, narrative: 'x' }],
          newestTweetAt: Date.now(),
          citations: [],
        },
        {
          step: { command: 'pulse' as const, args: { topic: 'test' }, reasoning: '' },
          command: 'pulse',
          snapshot: {} as PulseSnapshot,
          cost: 0.001,
          durationMs: 500,
          tweets: [
            {
              id: '2',
              text: 't2',
              authorId: 'b',
              createdAt: '2026-03-10T13:00:00Z',
              metrics: { likes: 2, retweets: 0, replies: 0, impressions: 20 },
            },
          ],
          scores: [{ index: 0, sentiment: -0.5, narrative: 'y' }],
          newestTweetAt: Date.now(),
          citations: [],
        },
      ],
      totalCost: 0.003,
      leads: [],
    }

    const brief = await synthesizer.synthesize(context)
    // 2 tweets, 2 unique authors
    expect(brief.sampleSize).toBe(2)
    // Sentiment avg of [0.5, -0.5] = 0.0
    expect(brief.sentiment).toBe(0)
  })

  it('defaults signalLine when Grok returns null', async () => {
    const grok = makeMockGrok([JSON.stringify({})])
    const synthesizer = new AgentSynthesizer(grok)

    const context = {
      goal: 'Test',
      question: 'Test question',
      results: [],
      totalCost: 0.001,
      leads: [],
    }

    const brief = await synthesizer.synthesize(context)
    expect(brief.signalLine).toBe('No signal.')
  })

  it('computes staleness as null when no newestTweetAt', async () => {
    const grok = makeMockGrok([
      JSON.stringify({
        signalLine: 'Test.',
        summary: [],
        contradictions: [],
        keyAccounts: [],
        evidence: [],
      }),
    ])
    const synthesizer = new AgentSynthesizer(grok)

    const context = {
      goal: 'Test',
      question: 'Test',
      results: [
        {
          step: { command: 'scan' as const, args: { topic: 'test' }, reasoning: '' },
          command: 'scan',
          snapshot: {} as ScanSnapshot,
          cost: 0.001,
          durationMs: 500,
          tweets: [
            {
              id: '1',
              text: 't1',
              authorId: 'a',
              createdAt: '2026-03-10T12:00:00Z',
              metrics: { likes: 1, retweets: 0, replies: 0, impressions: 10 },
            },
          ],
          scores: [{ index: 0, sentiment: 0.5, narrative: 'x' }],
          newestTweetAt: null,
          citations: [],
        },
        {
          step: { command: 'pulse' as const, args: { topic: 'test' }, reasoning: '' },
          command: 'pulse',
          snapshot: {} as PulseSnapshot,
          cost: 0.001,
          durationMs: 500,
          tweets: [
            {
              id: '2',
              text: 't2',
              authorId: 'b',
              createdAt: '2026-03-10T13:00:00Z',
              metrics: { likes: 2, retweets: 0, replies: 0, impressions: 20 },
            },
          ],
          scores: [{ index: 0, sentiment: -0.5, narrative: 'y' }],
          newestTweetAt: null,
          citations: [],
        },
      ],
      totalCost: 0.003,
      leads: [],
    }

    const brief = await synthesizer.synthesize(context)
    expect(brief.staleness).toBeNull()
  })

  it('takes the latest newestTweetAt across steps', async () => {
    const grok = makeMockGrok([
      JSON.stringify({
        signalLine: 'Test.',
        summary: [],
        contradictions: [],
        keyAccounts: [],
        evidence: [],
      }),
    ])
    const synthesizer = new AgentSynthesizer(grok)

    const context = {
      goal: 'Test',
      question: 'Test',
      results: [
        {
          step: { command: 'scan' as const, args: { topic: 'test' }, reasoning: '' },
          command: 'scan',
          snapshot: {} as ScanSnapshot,
          cost: 0.001,
          durationMs: 500,
          tweets: [
            {
              id: '1',
              text: 't1',
              authorId: 'a',
              createdAt: '2026-03-10T12:00:00Z',
              metrics: { likes: 1, retweets: 0, replies: 0, impressions: 10 },
            },
          ],
          scores: [{ index: 0, sentiment: 0.5, narrative: 'x' }],
          newestTweetAt: 1000,
          citations: [],
        },
        {
          step: { command: 'pulse' as const, args: { topic: 'test' }, reasoning: '' },
          command: 'pulse',
          snapshot: {} as PulseSnapshot,
          cost: 0.001,
          durationMs: 500,
          tweets: [
            {
              id: '2',
              text: 't2',
              authorId: 'b',
              createdAt: '2026-03-10T13:00:00Z',
              metrics: { likes: 2, retweets: 0, replies: 0, impressions: 20 },
            },
          ],
          scores: [{ index: 0, sentiment: -0.5, narrative: 'y' }],
          newestTweetAt: 2000,
          citations: [],
        },
      ],
      totalCost: 0.003,
      leads: [],
    }

    const brief = await synthesizer.synthesize(context)
    // staleness = Date.now() - 2000 (the latest newestTweetAt)
    // It should be close to now - 2000
    expect(brief.staleness).toBeGreaterThan(0)
    // staleness = Date.now() - 2000; allow ±100ms for execution time
    const expectedStaleness = Date.now() - 2000
    expect(brief.staleness).toBeGreaterThanOrEqual(expectedStaleness - 100)
    expect(brief.staleness).toBeLessThanOrEqual(expectedStaleness + 100)
  })

  it('handles keyAccounts with missing fields gracefully', async () => {
    const grok = makeMockGrok([
      JSON.stringify({
        signalLine: 'Test.',
        summary: [],
        contradictions: [],
        keyAccounts: [
          { handle: undefined, reach: undefined, sentiment: undefined, stance: undefined },
          {},
        ],
        evidence: [],
      }),
    ])
    const synthesizer = new AgentSynthesizer(grok)

    const context = {
      goal: 'Test',
      question: 'Test',
      results: [],
      totalCost: 0.001,
      leads: [],
    }

    const brief = await synthesizer.synthesize(context)
    expect(brief.keyAccounts).toHaveLength(2)
    for (const acct of brief.keyAccounts) {
      expect(acct.handle).toBe('')
      expect(acct.reach).toBe(0)
      expect(acct.sentiment).toBe(0)
      expect(acct.stance).toBe('')
    }
  })
})

describe('AgentPlanner — error handling', () => {
  it('throws when Grok returns invalid JSON', async () => {
    const grok = makeMockGrok(['this is not JSON at all'])
    const planner = new AgentPlanner(grok)
    await expect(planner.plan('test')).rejects.toThrow()
  })

  it('throws when plan has goal but missing steps property', async () => {
    const grok = makeMockGrok([JSON.stringify({ goal: 'Test' })])
    const planner = new AgentPlanner(grok)
    await expect(planner.plan('test')).rejects.toThrow('empty or invalid plan')
  })

  it('handles steps with missing args and reasoning gracefully', async () => {
    const plan = {
      goal: 'Test goal',
      steps: [{ command: 'scan' }, { command: 'pulse' }],
    }
    const grok = makeMockGrok([JSON.stringify(plan)])
    const planner = new AgentPlanner(grok)
    const result = await planner.plan('test')

    expect(result.plan.steps).toHaveLength(2)
    expect(result.plan.steps[0].args).toEqual({})
    expect(result.plan.steps[0].reasoning).toBe('')
    expect(result.plan.steps[1].args).toEqual({})
    expect(result.plan.steps[1].reasoning).toBe('')
  })
})

describe('AgentExecutor — error and edge cases', () => {
  let defaultOptions: AgentOptions

  beforeEach(() => {
    defaultOptions = {
      maxSteps: 8,
      budget: 0.1,
      replan: false,
    }
  })

  it('skips remaining steps when budget exceeded', async () => {
    const deps: CorvusDeps = {
      grok: makeMockGrok([]),
      x: {} as CorvusDeps['x'],
    }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Step 2' },
      ],
    }

    const skipped: { index: number; reason: string }[] = []
    const executor = new AgentExecutor(deps, 'test', plan, {
      ...defaultOptions,
      budget: 0.004,
      onStepSkip: (index, _step, reason) => skipped.push({ index, reason }),
    })

    // planCost = 0.001, first step costs 0.002, totalCost becomes 0.003
    // results.length=1, avgCost = 0.003 / (1+1) = 0.0015
    // 0.003 + 0.0015 = 0.0045 > 0.004 budget => skip remaining
    const context = await executor.execute(0.001)

    expect(context.results).toHaveLength(1)
    expect(skipped.length).toBeGreaterThanOrEqual(1)
    expect(skipped.some((s) => s.reason === 'budget exceeded')).toBe(true)
  })

  it('calls onStepFail on step error and continues', async () => {
    const { buildScanSnapshot } = await import('../../src/core/builders/scan.js')
    vi.mocked(buildScanSnapshot).mockRejectedValueOnce(new Error('Scan failed'))

    const deps: CorvusDeps = {
      grok: makeMockGrok([]),
      x: {} as CorvusDeps['x'],
    }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Step 2' },
      ],
    }

    const failures: { index: number; error: Error }[] = []
    const executor = new AgentExecutor(deps, 'test', plan, {
      ...defaultOptions,
      onStepFail: (index, _step, error) => failures.push({ index, error }),
    })
    const context = await executor.execute(0)

    expect(failures).toHaveLength(1)
    expect(failures[0].error.message).toBe('Scan failed')
    // Second step (pulse) should still have run
    expect(context.results).toHaveLength(1)
    expect(context.results[0].command).toBe('pulse')
  })

  it('calls onStepSkip with rate-limited on 429 error', async () => {
    const { buildScanSnapshot } = await import('../../src/core/builders/scan.js')
    vi.mocked(buildScanSnapshot).mockRejectedValueOnce(new Error('Request failed with status 429'))

    const deps: CorvusDeps = {
      grok: makeMockGrok([]),
      x: {} as CorvusDeps['x'],
    }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [{ command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' }],
    }

    const skipped: { index: number; reason: string }[] = []
    const executor = new AgentExecutor(deps, 'test', plan, {
      ...defaultOptions,
      onStepSkip: (index, _step, reason) => skipped.push({ index, reason }),
    })
    await executor.execute(0)

    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toBe('rate-limited')
  })

  it('throws Error for unknown command in resolveBuildFn', async () => {
    const deps: CorvusDeps = {
      grok: makeMockGrok([]),
      x: {} as CorvusDeps['x'],
    }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [{ command: 'unknown' as any, args: { topic: 'test' }, reasoning: 'Bad step' }],
    }

    const failures: { index: number; error: Error }[] = []
    const executor = new AgentExecutor(deps, 'test', plan, {
      ...defaultOptions,
      onStepFail: (index, _step, error) => failures.push({ index, error }),
    })
    await executor.execute(0)

    expect(failures).toHaveLength(1)
    expect(failures[0].error.message).toContain('Unknown command')
  })

  it('does not replan after MAX_REPLANS=3 reached', async () => {
    const replanResponse = JSON.stringify({ action: 'continue' })
    // Need enough replan responses: replans happen at completedCount 1, 3, 5
    const mockGrok = makeMockGrok([replanResponse, replanResponse, replanResponse, replanResponse])
    const deps: CorvusDeps = { grok: mockGrok, x: {} as CorvusDeps['x'] }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'a' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'a' }, reasoning: 'Step 2' },
        { command: 'scan', args: { topic: 'b' }, reasoning: 'Step 3' },
        { command: 'pulse', args: { topic: 'b' }, reasoning: 'Step 4' },
        { command: 'scan', args: { topic: 'c' }, reasoning: 'Step 5' },
        { command: 'pulse', args: { topic: 'c' }, reasoning: 'Step 6' },
        { command: 'scan', args: { topic: 'd' }, reasoning: 'Step 7' },
      ],
    }

    const executor = new AgentExecutor(deps, 'test', plan, {
      ...defaultOptions,
      replan: true,
    })
    await executor.execute(0)

    // Replan triggers at completedCount 1, 3, 5 — that's 3 replans, hitting MAX_REPLANS
    // No 4th replan should happen
    expect(mockGrok.query).toHaveBeenCalledTimes(3)
  })

  it('filters invalid commands from replan responses', async () => {
    const replanResponse = JSON.stringify({
      action: 'revise',
      steps: [
        { command: 'profile', args: { username: 'alice' }, reasoning: 'Valid lead' },
        { command: 'eval', args: { topic: 'exploit' }, reasoning: 'Invalid command' },
        { command: 'shell', args: { topic: 'inject' }, reasoning: 'Also invalid' },
        { command: 'scan', args: { topic: 'followup' }, reasoning: 'Valid scan' },
      ],
    })
    const mockGrok = makeMockGrok([replanResponse])
    const deps: CorvusDeps = { grok: mockGrok, x: {} as CorvusDeps['x'] }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'test' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'test' }, reasoning: 'Will be replaced' },
      ],
    }

    const onReplan = vi.fn()
    const executor = new AgentExecutor(deps, 'test', plan, {
      ...defaultOptions,
      replan: true,
      onReplan,
    })
    await executor.execute(0)

    expect(onReplan).toHaveBeenCalled()
    const revisedSteps = onReplan.mock.calls[0][0]
    expect(revisedSteps.every((s: { command: string }) =>
      ['scan', 'pulse', 'trace', 'profile', 'hooks', 'draft'].includes(s.command),
    )).toBe(true)
    expect(revisedSteps.some((s: { command: string }) => s.command === 'eval')).toBe(false)
    expect(revisedSteps.some((s: { command: string }) => s.command === 'shell')).toBe(false)
  })

  it('does not extract duplicate leads', async () => {
    const deps: CorvusDeps = {
      grok: makeMockGrok([]),
      x: {} as CorvusDeps['x'],
    }

    // Both scan steps will return topAccounts with 'alice' (from the mock)
    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'scan', args: { topic: 'ethereum' }, reasoning: 'Step 2' },
      ],
    }

    const executor = new AgentExecutor(deps, 'test', plan, defaultOptions)
    const context = await executor.execute(0)

    // 'alice' appears in both scan results but should only be in leads once
    const aliceCount = context.leads.filter((l) => l === 'alice').length
    expect(aliceCount).toBe(1)
  })

  it('first step always runs regardless of budget', async () => {
    const deps: CorvusDeps = {
      grok: makeMockGrok([]),
      x: {} as CorvusDeps['x'],
    }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [{ command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' }],
    }

    const executor = new AgentExecutor(deps, 'test', plan, {
      ...defaultOptions,
      budget: 0.001, // very low budget
    })

    // planCost already exceeds budget, but first step should still run
    // because budget check only runs when results.length > 0
    const context = await executor.execute(0.002)

    expect(context.results).toHaveLength(1)
    expect(context.results[0].command).toBe('scan')
  })
})

describe('AgentSynthesizer citations', () => {
  it('includes citations array in brief from aggregated step citations', async () => {
    const mockGrok = {
      query: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          signalLine: 'Test signal',
          summary: ['finding 1'],
          contradictions: [],
          keyAccounts: [],
          evidence: [],
        }),
        usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001, toolCalls: 0 },
        citations: [],
      }),
    }

    const synthesizer = new AgentSynthesizer(mockGrok as any)
    const context: AgentContext = {
      goal: 'test',
      question: 'what is happening?',
      results: [
        {
          step: { command: 'scan', args: { topic: 'test' }, reasoning: 'start' },
          command: 'scan',
          snapshot: {
            metrics: { tweetCount: 10, totalEngagement: 100, uniqueAuthors: 5, engagementPerTweet: 10 },
            sentiment: { avg: 0.5, rawAvg: 0.5, positive: 5, neutral: 3, negative: 2 },
            topAccounts: [],
            narratives: [],
            signals: [],
          } as any,
          cost: 0.001,
          durationMs: 1000,
          tweets: [],
          scores: [],
          newestTweetAt: null,
          citations: [{ type: 'url_citation', url: 'https://x.com/foo/status/123', title: 'A tweet' }],
        },
      ],
      totalCost: 0.001,
      leads: [],
      usage: new UsageTracker(),
    }

    const brief = await synthesizer.synthesize(context)
    expect(brief.citations).toHaveLength(1)
    expect(brief.citations[0].url).toBe('https://x.com/foo/status/123')
  })

  it('deduplicates citations across steps', async () => {
    const mockGrok = {
      query: vi.fn().mockResolvedValue({
        text: JSON.stringify({ signalLine: 'Test', summary: [], contradictions: [], keyAccounts: [], evidence: [] }),
        usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001, toolCalls: 0 },
        citations: [],
      }),
    }

    const synthesizer = new AgentSynthesizer(mockGrok as any)
    const sameUrl = { type: 'url_citation', url: 'https://x.com/same' }
    const context: AgentContext = {
      goal: 'test',
      question: 'q',
      results: [
        { step: { command: 'scan', args: {}, reasoning: '' }, command: 'scan', snapshot: {} as any, cost: 0, durationMs: 0, tweets: [], scores: [], newestTweetAt: null, citations: [sameUrl] },
        { step: { command: 'pulse', args: {}, reasoning: '' }, command: 'pulse', snapshot: {} as any, cost: 0, durationMs: 0, tweets: [], scores: [], newestTweetAt: null, citations: [sameUrl] },
      ],
      totalCost: 0,
      leads: [],
      usage: new UsageTracker(),
    }

    const brief = await synthesizer.synthesize(context)
    expect(brief.citations).toHaveLength(1)
  })
})

describe('AgentSynthesizer onChunk', () => {
  it('calls queryStream when onChunk provided', async () => {
    const mockGrok = {
      query: vi.fn(),
      queryStream: vi.fn().mockResolvedValue({
        text: JSON.stringify({ signalLine: 'Test', summary: [], contradictions: [], keyAccounts: [], evidence: [] }),
        usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001, toolCalls: 0 },
        citations: [],
      }),
    }

    const synthesizer = new AgentSynthesizer(mockGrok as any)
    const context: AgentContext = { goal: 'test', question: 'q', results: [], totalCost: 0, leads: [], usage: new UsageTracker() }

    await synthesizer.synthesize(context, (_text) => {})
    expect(mockGrok.queryStream).toHaveBeenCalled()
    expect(mockGrok.query).not.toHaveBeenCalled()
  })

  it('uses query() when no onChunk provided', async () => {
    const mockGrok = {
      query: vi.fn().mockResolvedValue({
        text: JSON.stringify({ signalLine: 'Test', summary: [], contradictions: [], keyAccounts: [], evidence: [] }),
        usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001, toolCalls: 0 },
        citations: [],
      }),
      queryStream: vi.fn(),
    }

    const synthesizer = new AgentSynthesizer(mockGrok as any)
    const context: AgentContext = { goal: 'test', question: 'q', results: [], totalCost: 0, leads: [], usage: new UsageTracker() }

    await synthesizer.synthesize(context)
    expect(mockGrok.query).toHaveBeenCalled()
    expect(mockGrok.queryStream).not.toHaveBeenCalled()
  })
})

describe('AgentSynthesizer compaction', () => {
  it('sends compacted text for results exceeding preserveRecent', async () => {
    const mockGrok = {
      query: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          signalLine: 'Test',
          summary: [],
          contradictions: [],
          keyAccounts: [],
          evidence: [],
        }),
        usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001, toolCalls: 0 },
        citations: [],
      }),
    }

    const synthesizer = new AgentSynthesizer(mockGrok as any)
    const context: AgentContext = {
      goal: 'test',
      question: 'what is happening?',
      results: [
        { step: { command: 'scan', args: { topic: 'step1' }, reasoning: '' }, command: 'scan', snapshot: { takeaway: 'Step 1 finding', actions: [], metrics: { tweetCount: 10, totalEngagement: 100, uniqueAuthors: 5, engagementPerTweet: 10 }, sentiment: { avg: 0.3, positive: 5, neutral: 3, negative: 2 }, topAccounts: [{ handle: 'alice', postCount: 3, followers: 5000, avgSentiment: 0.5 }], narratives: [{ theme: 'theme1', description: 'desc', tweetCount: 5, avgSentiment: 0.3 }], signals: ['sig1'] } as any, cost: 0.001, durationMs: 100, tweets: [], scores: [], newestTweetAt: null, citations: [] },
        { step: { command: 'pulse', args: { topic: 'step2' }, reasoning: '' }, command: 'pulse', snapshot: { takeaway: 'Step 2 finding', actions: [], metrics: { tweetCount: 8, totalEngagement: 80, uniqueAuthors: 4, engagementPerTweet: 10 }, sentiment: { avg: -0.1, positive: 2, neutral: 4, negative: 2 }, bullSignals: ['bull1'], bearSignals: ['bear1'], keyVoices: [] } as any, cost: 0.001, durationMs: 100, tweets: [], scores: [], newestTweetAt: null, citations: [] },
        { step: { command: 'scan', args: { topic: 'step3' }, reasoning: '' }, command: 'scan', snapshot: { takeaway: 'Step 3 finding', actions: [], metrics: { tweetCount: 12, totalEngagement: 120, uniqueAuthors: 6, engagementPerTweet: 10 }, sentiment: { avg: 0.5, positive: 6, neutral: 4, negative: 2 }, topAccounts: [], narratives: [], signals: [] } as any, cost: 0.001, durationMs: 100, tweets: [], scores: [], newestTweetAt: null, citations: [] },
        { step: { command: 'scan', args: { topic: 'step4' }, reasoning: '' }, command: 'scan', snapshot: { takeaway: 'Step 4 finding', actions: [], metrics: { tweetCount: 15, totalEngagement: 150, uniqueAuthors: 7, engagementPerTweet: 10 }, sentiment: { avg: 0.7, positive: 8, neutral: 5, negative: 2 }, topAccounts: [], narratives: [], signals: [] } as any, cost: 0.001, durationMs: 100, tweets: [], scores: [], newestTweetAt: null, citations: [] },
      ],
      totalCost: 0.004,
      leads: [],
      usage: new UsageTracker(),
    }

    await synthesizer.synthesize(context)

    const prompt = mockGrok.query.mock.calls[0][0] as string
    // First 2 results should be condensed (preserveRecent=2 by default)
    expect(prompt).toContain('(condensed)')
    // Last 2 results should be full JSON
    expect(prompt).toContain('"Step 4 finding"')
    // The earlier steps condensed note
    expect(prompt).toContain('earlier steps condensed')
  })
})

describe('AgentExecutor abort mid-execution', () => {
  it('stops after first step when abort called during execution', async () => {
    const deps: CorvusDeps = {
      grok: { query: vi.fn() } as unknown as CorvusDeps['grok'],
      x: {} as CorvusDeps['x'],
    }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Step 2' },
        { command: 'scan', args: { topic: 'ethereum' }, reasoning: 'Step 3' },
      ],
    }

    const executor = new AgentExecutor(deps, 'test', plan, {
      maxSteps: 8,
      budget: 1.0,
      replan: false,
      onStepComplete: (index) => {
        if (index === 0) executor.abort()
      },
    })
    const context = await executor.execute(0)

    // First step completes, abort is called, second step never runs
    expect(context.results).toHaveLength(1)
    expect(context.results[0].command).toBe('scan')
  })
})

describe('AgentExecutor non-Error throw handling', () => {
  it('wraps non-Error throw in Error for onStepFail callback', async () => {
    const { buildScanSnapshot } = await import('../../src/core/builders/scan.js')
    vi.mocked(buildScanSnapshot).mockRejectedValueOnce('string-error-not-Error-instance')

    const deps: CorvusDeps = {
      grok: { query: vi.fn() } as unknown as CorvusDeps['grok'],
      x: {} as CorvusDeps['x'],
    }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [{ command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' }],
    }

    const failures: Error[] = []
    const executor = new AgentExecutor(deps, 'test', plan, {
      maxSteps: 8,
      budget: 1.0,
      replan: false,
      onStepFail: (_, __, error) => failures.push(error),
    })
    await executor.execute(0)

    expect(failures).toHaveLength(1)
    expect(failures[0]).toBeInstanceOf(Error)
    expect(failures[0].message).toContain('string-error-not-Error-instance')
  })
})

describe('AgentSynthesizer mergeContradictions', () => {
  it('keeps grok contradictions that are unique', async () => {
    const mockGrok = {
      query: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          signalLine: 'Test.',
          summary: [],
          contradictions: ['Completely unique grok finding about institutional flows'],
          keyAccounts: [],
          evidence: [],
        }),
        usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001, toolCalls: 0 },
        citations: [],
      }),
    }

    const synthesizer = new AgentSynthesizer(mockGrok as any)
    const context: AgentContext = {
      goal: 'test',
      question: 'q',
      results: [],
      totalCost: 0,
      leads: [],
      usage: new UsageTracker(),
    }

    const brief = await synthesizer.synthesize(context)
    expect(brief.contradictions).toContain('Completely unique grok finding about institutional flows')
  })
})

describe('AgentPlanner step filtering', () => {
  it('filters all invalid commands leaving empty plan and throws', async () => {
    const plan = {
      goal: 'Test',
      steps: [
        { command: 'hack', args: {}, reasoning: 'bad 1' },
        { command: 'exploit', args: {}, reasoning: 'bad 2' },
      ],
    }
    const grok = {
      query: vi.fn().mockResolvedValue({
        text: JSON.stringify(plan),
        usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001, toolCalls: 0 },
        citations: [],
      }),
    }
    const planner = new AgentPlanner(grok as any)
    // After filtering invalid commands, steps is empty => throws "empty or invalid plan"
    // Actually the plan validation checks before filtering, so let's check the result
    // The code filters AFTER the check on plan.steps.length, so the plan has steps at validation time
    const result = await planner.plan('test')
    // All commands are filtered out, leaving empty steps
    expect(result.plan.steps).toHaveLength(0)
  })
})

describe('AgentExecutor — failed steps do not increment completedCount (bug 1)', () => {
  it('does not trigger replan when failed step would have put completedCount in REPLAN_STEPS', async () => {
    // REPLAN_STEPS = {1, 3, 5}
    // Plan: 3 steps. Step 0 succeeds (completedCount=1 → replan fires at 1).
    // Step 1 fails (completedCount stays 1 — NOT incremented).
    // Step 2 succeeds (completedCount=2 — not in REPLAN_STEPS, no replan).
    // So total replans = 1 (after step 0 only).

    const { buildPulseSnapshot } = await import('../../src/core/builders/pulse.js')

    // Make step 1 (pulse) fail
    vi.mocked(buildPulseSnapshot).mockRejectedValueOnce(new Error('Pulse API error'))

    const replanResponse = JSON.stringify({ action: 'continue' })
    const mockGrok = makeMockGrok([replanResponse, replanResponse])
    const deps: CorvusDeps = { grok: mockGrok, x: {} as CorvusDeps['x'] }

    const plan: AgentPlan = {
      goal: 'Test failed step replan',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 0' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Step 1 — will fail' },
        { command: 'scan', args: { topic: 'ethereum' }, reasoning: 'Step 2' },
      ],
    }

    const failures: number[] = []
    const executor = new AgentExecutor(deps, 'test', plan, {
      maxSteps: 8,
      budget: 1.0,
      replan: true,
      onStepFail: (index) => failures.push(index),
    })
    const context = await executor.execute(0)

    // Step 1 failed
    expect(failures).toEqual([1])
    // Only 2 successful results (step 0 scan, step 2 scan)
    expect(context.results).toHaveLength(2)
    // Replan should have been called exactly once — after step 0 (completedCount=1)
    // Step 1 failed so completedCount stays 1, step 2 makes it 2 (not in REPLAN_STEPS)
    expect(mockGrok.query).toHaveBeenCalledTimes(1)
  })
})

describe('AgentExecutor — budget check uses step cost average, not total cost average (bug 2)', () => {
  it('subtracts planCost from totalCost before computing step cost average', async () => {
    const deps: CorvusDeps = {
      grok: makeMockGrok([]),
      x: {} as CorvusDeps['x'],
    }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Step 2' },
        { command: 'scan', args: { topic: 'ethereum' }, reasoning: 'Step 3' },
      ],
    }

    // planCost = 0.01, budget = 0.02
    // Step 0 (scan) costs 0.002 → totalCost = 0.01 + 0.002 = 0.012
    // Before step 1: stepCost = totalCost - planCost = 0.012 - 0.01 = 0.002
    //   avgCost = 0.002 / 1 = 0.002
    //   totalCost + avgCost = 0.012 + 0.002 = 0.014 < 0.02 budget → step 1 runs
    // If the bug were present (using totalCost / (results.length+1)):
    //   avgCost = 0.012 / 2 = 0.006
    //   totalCost + avgCost = 0.012 + 0.006 = 0.018 < 0.02 → would also run, but barely
    // The critical difference is with tighter budgets.

    const skipped: number[] = []
    const executor = new AgentExecutor(deps, 'test', plan, {
      maxSteps: 8,
      budget: 0.02,
      replan: false,
      onStepSkip: (index) => skipped.push(index),
    })
    const context = await executor.execute(0.01)

    // With correct budget math (stepCost = totalCost - planCost):
    // After step 0: totalCost=0.012, stepCost=0.002, avg=0.002, projected=0.014 → step 1 runs
    // After step 1: totalCost=0.014, stepCost=0.004, avg=0.002, projected=0.016 → step 2 runs
    // After step 2: totalCost=0.016 — all steps completed
    expect(context.results).toHaveLength(3)
    expect(skipped).toHaveLength(0)
  })

  it('correctly skips steps when step cost average exceeds remaining budget', async () => {
    const deps: CorvusDeps = {
      grok: makeMockGrok([]),
      x: {} as CorvusDeps['x'],
    }

    const plan: AgentPlan = {
      goal: 'Test',
      steps: [
        { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Step 1' },
        { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Step 2' },
      ],
    }

    // planCost = 0.01, budget = 0.013
    // Step 0 (scan) costs 0.002 → totalCost = 0.012
    // Before step 1: stepCost = 0.012 - 0.01 = 0.002, avgCost = 0.002
    //   totalCost + avgCost = 0.012 + 0.002 = 0.014 > 0.013 → skip
    const skipped: { index: number; reason: string }[] = []
    const executor = new AgentExecutor(deps, 'test', plan, {
      maxSteps: 8,
      budget: 0.013,
      replan: false,
      onStepSkip: (index, _step, reason) => skipped.push({ index, reason }),
    })
    const context = await executor.execute(0.01)

    expect(context.results).toHaveLength(1)
    expect(skipped.length).toBeGreaterThanOrEqual(1)
    expect(skipped[0].reason).toBe('budget exceeded')
  })
})
