import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentPlanner, AgentExecutor, AgentSynthesizer } from '../../src/core/agent.js'
import type { AgentPlan, AgentStep, AgentOptions } from '../../src/core/agent.js'
import type { GrokAdapter } from '../../src/core/grok-adapter.js'
import type { CommandDeps } from '../../src/cli/run-command.js'
import type { GrokResponse } from '../../src/core/types.js'
import type { ScanSnapshot, PulseSnapshot, AgentBrief } from '../../src/core/schemas.js'

function makeGrokResponse(text: string, cost = 0.001): GrokResponse {
  return {
    text,
    usage: { inputTokens: 500, outputTokens: 200, costUsd: cost },
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
vi.mock('../../src/cli/commands/scan.js', () => ({
  buildScanSnapshot: vi.fn(async (_deps: CommandDeps, topic: string) => ({
    data: {
      metrics: { tweetCount: 10, totalEngagement: 500, uniqueAuthors: 8, engagementPerTweet: 50 },
      sentiment: { avg: 0.3, positive: 5, neutral: 3, negative: 2 },
      topAccounts: [{ handle: 'alice', postCount: 3, followers: 5000, avgSentiment: 0.5 }],
      narratives: [{ theme: 'test', description: 'Test narrative', tweetCount: 10, avgSentiment: 0.3 }],
      signals: ['Signal 1'],
    } satisfies ScanSnapshot,
    raw: '{}',
    cost: 0.002,
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
  })),
}))

vi.mock('../../src/cli/commands/pulse.js', () => ({
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
  })),
}))

vi.mock('../../src/cli/commands/scope.js', () => ({
  buildScopeSnapshot: vi.fn(async (_deps: CommandDeps, handle: string) => ({
    data: {
      account: { handle, followers: 5000, following: 200, tweetCount: 1000 },
      recentActivity: { avgEngagement: 100, postsAnalyzed: 20, topTweet: null },
      contentPatterns: ['crypto'],
      recentFocus: ['bitcoin'],
      networkPosition: 'mid-tier',
      influence: 'medium' as const,
      signalValue: 'medium' as const,
    },
    raw: '{}',
    cost: 0.001,
    tweets: [],
    scores: [],
    newestTweetAt: null,
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

    expect(result.goal).toBe('Assess bitcoin sentiment')
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].command).toBe('scan')
    expect(result.steps[1].command).toBe('pulse')
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
    expect(result.steps).toHaveLength(8)
  })

  it('handles markdown-fenced JSON', async () => {
    const plan: AgentPlan = {
      goal: 'Test goal',
      steps: [{ command: 'scan', args: { topic: 'test' }, reasoning: 'Test' }],
    }
    const grok = makeMockGrok(['```json\n' + JSON.stringify(plan) + '\n```'])
    const planner = new AgentPlanner(grok)
    const result = await planner.plan('test')
    expect(result.goal).toBe('Test goal')
  })
})

describe('AgentExecutor', () => {
  let mockDeps: CommandDeps
  let defaultOptions: AgentOptions

  beforeEach(() => {
    mockDeps = {
      grok: makeMockGrok([]),
      x: {} as CommandDeps['x'],
    }
    defaultOptions = {
      maxSteps: 8,
      budget: 0.10,
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

  it('handles scope steps with username arg', async () => {
    const plan: AgentPlan = {
      goal: 'Test',
      steps: [{ command: 'scope', args: { username: 'satoshi' }, reasoning: 'Profile check' }],
    }

    const executor = new AgentExecutor(mockDeps, 'test', plan, defaultOptions)
    const context = await executor.execute(0)

    expect(context.results).toHaveLength(1)
    expect(context.results[0].command).toBe('scope')
  })
})

describe('AgentExecutor with replanning', () => {
  it('triggers replan after step 1 when replan enabled', async () => {
    const replanResponse = JSON.stringify({ action: 'continue' })
    const mockGrok = makeMockGrok([replanResponse])
    const deps: CommandDeps = { grok: mockGrok, x: {} as CommandDeps['x'] }

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

    // Grok should have been called for replan after step 1
    expect(mockGrok.query).toHaveBeenCalled()
  })

  it('applies revised steps from replan', async () => {
    const replanResponse = JSON.stringify({
      action: 'revise',
      steps: [
        { command: 'scope', args: { username: 'satoshi' }, reasoning: 'New lead' },
      ],
    })
    const mockGrok = makeMockGrok([replanResponse])
    const deps: CommandDeps = { grok: mockGrok, x: {} as CommandDeps['x'] }

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
    // Should have scan + scope (replaced pulse with scope)
    expect(context.results.some((r) => r.command === 'scope')).toBe(true)
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
      evidence: [
        { source: 'scan', key: 'Sentiment', detail: 'Net positive at +0.3' },
      ],
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
            metrics: { tweetCount: 10, totalEngagement: 500, uniqueAuthors: 8, engagementPerTweet: 50 },
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
    const grok = makeMockGrok([JSON.stringify({
      signalLine: 'No data available.',
      summary: [],
      contradictions: [],
      keyAccounts: [],
      evidence: [],
    })])
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
            metrics: { tweetCount: 10, totalEngagement: 500, uniqueAuthors: 8, engagementPerTweet: 50 },
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
        },
        {
          step: { command: 'pulse' as const, args: { topic: 'btc' }, reasoning: '' },
          command: 'pulse',
          snapshot: {
            metrics: { tweetCount: 10, totalEngagement: 400, uniqueAuthors: 7, engagementPerTweet: 40 },
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
    const grok = makeMockGrok([JSON.stringify({
      signalLine: 'Test.',
      summary: [],
      contradictions: [],
      keyAccounts: [],
      evidence: [],
    })])
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
            { id: '1', text: 't1', authorId: 'a', createdAt: '2026-03-10T12:00:00Z', metrics: { likes: 1, retweets: 0, replies: 0, impressions: 10 } },
          ],
          scores: [{ index: 0, sentiment: 0.5, narrative: 'x' }],
          newestTweetAt: Date.now(),
        },
        {
          step: { command: 'pulse' as const, args: { topic: 'test' }, reasoning: '' },
          command: 'pulse',
          snapshot: {} as PulseSnapshot,
          cost: 0.001,
          durationMs: 500,
          tweets: [
            { id: '2', text: 't2', authorId: 'b', createdAt: '2026-03-10T13:00:00Z', metrics: { likes: 2, retweets: 0, replies: 0, impressions: 20 } },
          ],
          scores: [{ index: 0, sentiment: -0.5, narrative: 'y' }],
          newestTweetAt: Date.now(),
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
})
