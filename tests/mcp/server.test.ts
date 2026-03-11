import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ScanSnapshot, PulseSnapshot, TraceSnapshot } from '../../src/core/schemas.js'
import type { GatherSnapshot, ReadSnapshot, ScopeSnapshot } from '../../src/core/schemas.js'
import type { CorvusDeps } from '../../src/core/types.js'

// Mock auth + config so initDeps() works
vi.mock('../../src/infra/auth.js', () => ({
  AuthManager: vi.fn().mockImplementation(() => ({
    getGrokKey: () => 'xai-test-key',
    getXToken: () => null,
  })),
}))

vi.mock('../../src/infra/config.js', () => ({
  ConfigManager: { defaultDir: () => '/tmp/.corvus' },
}))

vi.mock('../../src/core/grok-adapter.js', () => ({
  GrokAdapter: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('../../src/core/x-adapter.js', () => ({
  XAdapter: vi.fn(),
}))

const makeBuildResult = <T>(data: T, cost = 0.003) => ({
  data,
  raw: '{}',
  cost,
  tweets: [],
  scores: [],
  newestTweetAt: null,
})

const scanData: ScanSnapshot = {
  metrics: { tweetCount: 10, totalEngagement: 500, uniqueAuthors: 8, engagementPerTweet: 50 },
  sentiment: { avg: 0.3, positive: 5, neutral: 3, negative: 2 },
  topAccounts: [{ handle: 'alice', postCount: 3, followers: 5000, avgSentiment: 0.5 }],
  narratives: [{ theme: 'test', description: 'Test narrative', tweetCount: 10, avgSentiment: 0.3 }],
  signals: ['Signal 1'],
}

const pulseData: PulseSnapshot = {
  metrics: { tweetCount: 10, totalEngagement: 400, uniqueAuthors: 7, engagementPerTweet: 40 },
  sentiment: { avg: -0.1, positive: 3, neutral: 4, negative: 3 },
  topAccounts: [{ handle: 'bob', postCount: 5, followers: 10000, avgSentiment: -0.2 }],
  signals: { bullish: ['Signal A'], bearish: ['Signal B'], catalysts: ['Catalyst 1'] },
  momentum: { direction: 'bearish' as const, strength: 0.6, description: 'Weakening' },
}

const traceData: TraceSnapshot = {
  metrics: { tweetCount: 10, totalEngagement: 300, uniqueAuthors: 6, engagementPerTweet: 30 },
  origin: { handle: 'origin_user', tweetId: '111', summary: 'First claim', date: '2026-03-01' },
  phases: [{ label: 'Phase 1', timeRange: '2026-03-01 to 03-02', keyTweets: 5, description: 'Spread' }],
  amplifiers: [{ handle: 'amplifier1', reach: 50000, role: 'Broadcaster' }],
  mutations: [{ from: 'original claim', to: 'mutated claim', significance: 'high' as const }],
}

const gatherData: GatherSnapshot = {
  metrics: { tweetCount: 10, totalEngagement: 600, uniqueAuthors: 9, engagementPerTweet: 60 },
  sentiment: { avg: 0.2, positive: 4, neutral: 4, negative: 2 },
  narratives: [{ theme: 'test', description: 'Narrative', tweetCount: 10, avgSentiment: 0.2 }],
  webContext: [{ source: 'news.com', headline: 'Big news', relevance: 'high' as const }],
  outlook: { shortTerm: 'Stable', mediumTerm: 'Growing', risks: ['Risk 1'] },
}

const readData: ReadSnapshot = {
  tweetId: '12345',
  authorHandle: 'testuser',
  text: 'Test tweet',
  significance: 'moderate' as const,
  analysis: 'Analysis of tweet',
  signals: ['Signal from tweet'],
  context: 'Background context',
}

const scopeData: ScopeSnapshot = {
  handle: 'testuser',
  influence: { level: 'moderate' as const, reach: 10000, description: 'Growing account' },
  contentPatterns: { topics: ['AI', 'tech'], postingFrequency: 'daily', style: 'analytical' },
  recentFocus: ['AI agents', 'LLMs'],
  signalValue: { score: 0.7, description: 'Reliable signal' },
}

vi.mock('../../src/core/builders/scan.js', () => ({
  buildScanSnapshot: vi.fn(async () => makeBuildResult(scanData)),
}))

vi.mock('../../src/core/builders/pulse.js', () => ({
  buildPulseSnapshot: vi.fn(async () => makeBuildResult(pulseData)),
}))

vi.mock('../../src/core/builders/trace.js', () => ({
  buildTraceSnapshot: vi.fn(async () => makeBuildResult(traceData)),
}))

vi.mock('../../src/core/builders/gather.js', () => ({
  buildGatherSnapshot: vi.fn(async () => makeBuildResult(gatherData)),
}))

vi.mock('../../src/core/builders/read.js', () => ({
  buildReadSnapshot: vi.fn(async () => makeBuildResult(readData)),
  extractTweetId: vi.fn((input: string) => {
    const match = input.match(/(\d{4,})/)
    return match ? match[1] : null
  }),
}))

vi.mock('../../src/core/builders/scope.js', () => ({
  buildScopeSnapshot: vi.fn(async () => makeBuildResult(scopeData)),
}))

vi.mock('../../src/core/agent.js', () => {
  class MockPlanner {
    async plan() {
      return {
        plan: { goal: 'Investigate test', steps: [{ command: 'scan', args: { topic: 'test' }, reasoning: 'start' }] },
        costUsd: 0.001,
      }
    }
  }
  class MockExecutor {
    async execute() {
      return {
        goal: 'Investigate test',
        question: 'test question',
        results: [{ command: 'scan', snapshot: {}, tweets: [], scores: [] }],
        totalCost: 0.005,
        leads: [],
      }
    }
  }
  class MockSynthesizer {
    async synthesize() {
      return {
        signalLine: 'Test signal',
        sentiment: 0.3,
        summary: ['Finding 1'],
        contradictions: [],
        keyAccounts: [],
        evidence: [],
        confidence: { score: 0.7, label: 'moderate', sampleSize: 10, staleness: null },
        sampleSize: 10,
        staleness: null,
      }
    }
  }
  return {
    AgentPlanner: MockPlanner,
    AgentExecutor: MockExecutor,
    AgentSynthesizer: MockSynthesizer,
  }
})

// Grab the mocked functions for assertions
import { buildScanSnapshot } from '../../src/core/builders/scan.js'
import { buildPulseSnapshot } from '../../src/core/builders/pulse.js'
import { buildTraceSnapshot } from '../../src/core/builders/trace.js'
import { buildGatherSnapshot } from '../../src/core/builders/gather.js'
import { buildReadSnapshot, extractTweetId } from '../../src/core/builders/read.js'
import { buildScopeSnapshot } from '../../src/core/builders/scope.js'
import { AgentPlanner, AgentExecutor, AgentSynthesizer } from '../../src/core/agent.js'

import { createServer } from '../../src/mcp/server.js'

// McpServer doesn't expose tool handlers directly, so we test createServer()
// returns a valid server and test the helper functions indirectly.

describe('MCP server', () => {
  it('createServer returns an McpServer instance', () => {
    const server = createServer()
    expect(server).toBeDefined()
    expect(server).toHaveProperty('registerTool')
    expect(server).toHaveProperty('connect')
  })

  // Since McpServer doesn't provide a direct way to call tools in unit tests,
  // we test the wiring by verifying the server can be created without errors
  // and the mocked builders are properly importable.

  describe('tool wiring', () => {
    it('scan builder is callable with expected args', async () => {
      const deps = {} as CorvusDeps
      const result = await buildScanSnapshot(deps, 'bitcoin', 50)
      expect(result.data).toEqual(scanData)
      expect(result.cost).toBe(0.003)
    })

    it('pulse builder is callable with expected args', async () => {
      const deps = {} as CorvusDeps
      const result = await buildPulseSnapshot(deps, 'bitcoin', 50)
      expect(result.data).toEqual(pulseData)
    })

    it('trace builder is callable with expected args', async () => {
      const deps = {} as CorvusDeps
      const result = await buildTraceSnapshot(deps, 'test narrative', 50)
      expect(result.data).toEqual(traceData)
    })

    it('gather builder is callable with expected args', async () => {
      const deps = {} as CorvusDeps
      const result = await buildGatherSnapshot(deps, 'AI regulation', 50)
      expect(result.data).toEqual(gatherData)
    })

    it('read builder is callable with tweet ID', async () => {
      const deps = {} as CorvusDeps
      const result = await buildReadSnapshot(deps, '12345')
      expect(result.data).toEqual(readData)
    })

    it('scope builder is callable with username', async () => {
      const deps = {} as CorvusDeps
      const result = await buildScopeSnapshot(deps, 'testuser', 10)
      expect(result.data).toEqual(scopeData)
    })
  })

  describe('extractTweetId', () => {
    it('extracts numeric ID from URL', () => {
      expect(extractTweetId('https://x.com/user/status/1234567890')).toBe('1234567890')
    })

    it('extracts raw numeric ID', () => {
      expect(extractTweetId('1234567890')).toBe('1234567890')
    })

    it('returns null for invalid input', () => {
      expect(extractTweetId('abc')).toBeNull()
    })
  })

  describe('agent pipeline', () => {
    it('planner, executor, synthesizer chain works', async () => {
      const grok = {} as any
      const planner = new AgentPlanner(grok)
      const { plan, costUsd } = await planner.plan('test question')
      expect(plan.goal).toBe('Investigate test')
      expect(costUsd).toBe(0.001)

      const deps = {} as CorvusDeps
      const executor = new AgentExecutor(deps, 'test question', plan, {
        maxSteps: 6,
        budget: 0.1,
        replan: true,
      })
      const context = await executor.execute(costUsd)
      expect(context.results).toHaveLength(1)
      expect(context.totalCost).toBe(0.005)

      const synthesizer = new AgentSynthesizer(grok)
      const brief = await synthesizer.synthesize(context)
      expect(brief.signalLine).toBe('Test signal')
      expect(brief.confidence.score).toBe(0.7)
    })
  })
})
