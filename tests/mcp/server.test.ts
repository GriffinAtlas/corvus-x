import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  ScanSnapshot,
  PulseSnapshot,
  TraceSnapshot,
  GatherSnapshot,
  ReadSnapshot,
  ScopeSnapshot,
  AgentBrief,
} from '../../src/core/schemas.js'
import { extractTweetId } from '../../src/core/builders/read.js'

vi.mock('../../src/infra/auth.js', () => ({
  AuthManager: class {
    getGrokKey() { return 'xai-test-key' }
    getXToken() { return null }
  },
}))

vi.mock('../../src/infra/config.js', () => ({
  ConfigManager: { defaultDir: () => '/tmp/.corvus' },
}))

vi.mock('../../src/core/grok-adapter.js', () => ({
  GrokAdapter: class {},
}))

vi.mock('../../src/core/x-adapter.js', () => ({
  XAdapter: class {},
}))

const makeBuildResult = <T>(data: T, cost = 0.003) => ({
  data,
  raw: '{}',
  cost,
  tweets: [],
  scores: [],
  newestTweetAt: null,
  citations: [],
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
  bullSignals: ['Bull signal A'],
  bearSignals: ['Bear signal B'],
  keyVoices: [{ handle: 'bob', sentiment: -0.2, reach: 10000 }],
}

const traceData: TraceSnapshot = {
  metrics: { tweetCount: 10, totalEngagement: 300, uniqueAuthors: 6, engagementPerTweet: 30 },
  origin: { account: 'origin_user', date: '2026-03-01', tweetId: '111', content: 'First claim' },
  timeline: [
    {
      phase: 'Phase 1',
      tweetCount: 5,
      keyAmplifiers: ['amplifier1'],
      timeframe: '2026-03-01 to 03-02',
    },
  ],
  mutations: [{ original: 'original claim', variant: 'mutated claim' }],
  reach: { totalTweets: 10, totalEngagement: 300, uniqueAuthors: 6 },
}

const gatherData: GatherSnapshot = {
  metrics: { tweetCount: 10, totalEngagement: 600, uniqueAuthors: 9, engagementPerTweet: 60 },
  sentiment: { avg: 0.2, positive: 4, neutral: 4, negative: 2 },
  topPosts: [{ id: '999', author: 'topuser', text: 'Top post', engagement: 200 }],
  narratives: [{ theme: 'test', description: 'Narrative', tweetCount: 10, avgSentiment: 0.2 }],
  webContext: ['Major news article about the topic'],
  outlook: 'Stable short-term, growing medium-term',
}

const readData: ReadSnapshot = {
  tweet: {
    id: '12345',
    author: 'testuser',
    text: 'Test tweet content',
    engagement: { likes: 100, retweets: 20, replies: 5, impressions: 5000 },
    postedAt: '2026-03-10T12:00:00Z',
  },
  analysis: 'Analysis of the tweet content and significance',
  significance: 'medium',
  signals: ['Signal from tweet'],
}

const scopeData: ScopeSnapshot = {
  account: { handle: 'testuser', followers: 10000, following: 500, tweetCount: 3000 },
  recentActivity: {
    avgEngagement: 150,
    postsAnalyzed: 10,
    topTweet: { id: '555', text: 'Best tweet', engagement: 500 },
  },
  contentPatterns: ['AI', 'tech'],
  recentFocus: ['AI agents', 'LLMs'],
  networkPosition: 'Mid-tier tech voice',
  influence: 'medium',
  signalValue: 'high',
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

vi.mock('../../src/core/builders/read.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/core/builders/read.js')>()
  return {
    ...original,
    buildReadSnapshot: vi.fn(async () => makeBuildResult(readData)),
  }
})

vi.mock('../../src/core/builders/scope.js', () => ({
  buildScopeSnapshot: vi.fn(async () => makeBuildResult(scopeData)),
}))

vi.mock('../../src/core/agent.js', () => {
  const brief: AgentBrief = {
    signalLine: 'Test signal',
    sentiment: 0.3,
    summary: ['Finding 1'],
    contradictions: [],
    keyAccounts: [],
    evidence: [],
    confidence: { overall: 0.7, volume: 'moderate', consistency: 0.8, diversity: 0.6 },
    sampleSize: 10,
    staleness: null,
    citations: [],
  }

  class MockPlanner {
    async plan() {
      return {
        plan: {
          goal: 'Investigate test',
          steps: [{ command: 'scan', args: { topic: 'test' }, reasoning: 'start' }],
        },
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
      return brief
    }
  }
  return {
    AgentPlanner: MockPlanner,
    AgentExecutor: MockExecutor,
    AgentSynthesizer: MockSynthesizer,
  }
})

import { createServer } from '../../src/mcp/server.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildScanSnapshot } from '../../src/core/builders/scan.js'
import { buildPulseSnapshot } from '../../src/core/builders/pulse.js'
import { buildTraceSnapshot } from '../../src/core/builders/trace.js'
import { buildGatherSnapshot } from '../../src/core/builders/gather.js'
import { buildReadSnapshot } from '../../src/core/builders/read.js'
import { buildScopeSnapshot } from '../../src/core/builders/scope.js'

async function connectClient() {
  const mcpServer = createServer()
  const client = new Client({ name: 'test-client', version: '0.0.1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([
    client.connect(clientTransport),
    mcpServer.server.connect(serverTransport),
  ])
  return { client, mcpServer }
}

function parseContent(result: Awaited<ReturnType<Client['callTool']>>) {
  const text = result.content as { type: string; text: string }[]
  return JSON.parse(text[0].text)
}

describe('MCP server', () => {
  it('createServer returns an McpServer with registerTool and connect', () => {
    const server = createServer()
    expect(typeof server.registerTool).toBe('function')
    expect(typeof server.connect).toBe('function')
  })

  it('can be created multiple times without error', () => {
    const s1 = createServer()
    const s2 = createServer()
    expect(s1).not.toBe(s2)
  })

  it('all zod schemas are valid', () => {
    expect(() => createServer()).not.toThrow()
  })

  describe('tool handlers via MCP client', () => {
    let client: Client
    let mcpServer: Awaited<ReturnType<typeof createServer>>

    beforeEach(async () => {
      vi.mocked(buildScanSnapshot).mockClear()
      vi.mocked(buildPulseSnapshot).mockClear()
      vi.mocked(buildTraceSnapshot).mockClear()
      vi.mocked(buildGatherSnapshot).mockClear()
      vi.mocked(buildReadSnapshot).mockClear()
      vi.mocked(buildScopeSnapshot).mockClear()
      ;({ client, mcpServer } = await connectClient())
    })

    afterEach(async () => {
      await client.close()
      await mcpServer.close()
    })

    it('lists all 7 tools', async () => {
      const { tools } = await client.listTools()
      const names = tools.map((t) => t.name).sort()
      expect(names).toEqual([
        'corvus_agent',
        'corvus_gather',
        'corvus_pulse',
        'corvus_read',
        'corvus_scan',
        'corvus_scope',
        'corvus_trace',
      ])
    })

    it('corvus_scan calls buildScanSnapshot and returns data with _cost', async () => {
      const result = await client.callTool({
        name: 'corvus_scan',
        arguments: { topic: 'bitcoin', maxResults: 25 },
      })
      const parsed = parseContent(result)
      expect(vi.mocked(buildScanSnapshot)).toHaveBeenCalledOnce()
      const [deps, topic, maxResults] = vi.mocked(buildScanSnapshot).mock.calls[0]
      expect(topic).toBe('bitcoin')
      expect(maxResults).toBe(25)
      expect(deps).toHaveProperty('grok')
      expect(parsed._cost).toBe(0.003)
      expect(parsed.metrics.tweetCount).toBe(10)
      expect(parsed.signals).toEqual(['Signal 1'])
    })

    it('corvus_pulse calls buildPulseSnapshot with correct args', async () => {
      const result = await client.callTool({
        name: 'corvus_pulse',
        arguments: { topic: 'ETH merge', maxResults: 30 },
      })
      const parsed = parseContent(result)
      const [, topic, maxResults] = vi.mocked(buildPulseSnapshot).mock.calls[0]
      expect(topic).toBe('ETH merge')
      expect(maxResults).toBe(30)
      expect(parsed.bullSignals).toEqual(['Bull signal A'])
      expect(parsed.bearSignals).toEqual(['Bear signal B'])
    })

    it('corvus_trace calls buildTraceSnapshot with narrative arg', async () => {
      const result = await client.callTool({
        name: 'corvus_trace',
        arguments: { narrative: 'lab leak', maxResults: 40 },
      })
      const parsed = parseContent(result)
      const [, narrative, maxResults] = vi.mocked(buildTraceSnapshot).mock.calls[0]
      expect(narrative).toBe('lab leak')
      expect(maxResults).toBe(40)
      expect(parsed.origin.account).toBe('origin_user')
    })

    it('corvus_gather calls buildGatherSnapshot with correct args', async () => {
      const result = await client.callTool({
        name: 'corvus_gather',
        arguments: { topic: 'AI regulation', maxResults: 50 },
      })
      const parsed = parseContent(result)
      const [, topic, maxResults] = vi.mocked(buildGatherSnapshot).mock.calls[0]
      expect(topic).toBe('AI regulation')
      expect(maxResults).toBe(50)
      expect(parsed.webContext).toEqual(['Major news article about the topic'])
      expect(parsed.outlook).toBe('Stable short-term, growing medium-term')
    })

    it('corvus_read calls buildReadSnapshot with extracted tweet ID', async () => {
      const result = await client.callTool({
        name: 'corvus_read',
        arguments: { tweetIdOrUrl: 'https://x.com/user/status/12345' },
      })
      const parsed = parseContent(result)
      const [, tweetId] = vi.mocked(buildReadSnapshot).mock.calls[0]
      expect(tweetId).toBe('12345')
      expect(parsed.tweet.author).toBe('testuser')
      expect(parsed.significance).toBe('medium')
    })

    it('corvus_read returns error for invalid tweet ID', async () => {
      const result = await client.callTool({
        name: 'corvus_read',
        arguments: { tweetIdOrUrl: 'not-a-tweet' },
      })
      expect(result.isError).toBe(true)
      const parsed = parseContent(result)
      expect(parsed.error).toBe('Invalid tweet ID or URL')
      expect(vi.mocked(buildReadSnapshot)).not.toHaveBeenCalled()
    })

    it('corvus_scope strips @ and calls buildScopeSnapshot', async () => {
      const result = await client.callTool({
        name: 'corvus_scope',
        arguments: { username: '@elonmusk', tweetCount: 20 },
      })
      const parsed = parseContent(result)
      const [, handle, tweetCount] = vi.mocked(buildScopeSnapshot).mock.calls[0]
      expect(handle).toBe('elonmusk')
      expect(tweetCount).toBe(20)
      expect(parsed.account.handle).toBe('testuser')
      expect(parsed.influence).toBe('medium')
    })

    it('corvus_agent runs plan-execute-synthesize pipeline', async () => {
      const result = await client.callTool({
        name: 'corvus_agent',
        arguments: { question: 'What is happening with AI?', maxSteps: 4, budget: 0.05 },
      })
      const parsed = parseContent(result)
      expect(parsed.brief.signalLine).toBe('Test signal')
      expect(parsed.brief.confidence.overall).toBe(0.7)
      expect(parsed.stepsExecuted).toBe(1)
      expect(parsed._cost).toBe(0.005)
    })

    it('includes _citations in response when builder returns citations', async () => {
      vi.mocked(buildScanSnapshot).mockResolvedValueOnce({
        ...makeBuildResult(scanData),
        citations: [
          { type: 'url_citation', url: 'https://x.com/user/status/123', title: 'A tweet' },
        ],
      })
      const result = await client.callTool({
        name: 'corvus_scan',
        arguments: { topic: 'test', maxResults: 10 },
      })
      const parsed = parseContent(result)
      expect(parsed._citations).toEqual([
        { type: 'url_citation', url: 'https://x.com/user/status/123', title: 'A tweet' },
      ])
    })

    it('omits _citations when builder returns empty citations', async () => {
      const result = await client.callTool({
        name: 'corvus_scan',
        arguments: { topic: 'test', maxResults: 10 },
      })
      const parsed = parseContent(result)
      expect(parsed._citations).toBeUndefined()
    })

    it('corvus_scan uses default maxResults when not provided', async () => {
      const result = await client.callTool({
        name: 'corvus_scan',
        arguments: { topic: 'bitcoin' },
      })
      const parsed = parseContent(result)
      expect(vi.mocked(buildScanSnapshot)).toHaveBeenCalledOnce()
      const [, topic, maxResults] = vi.mocked(buildScanSnapshot).mock.calls[0]
      expect(topic).toBe('bitcoin')
      expect(maxResults).toBe(50) // default
      expect(parsed.metrics.tweetCount).toBe(10)
    })

    it('corvus_scope works without tweetCount (uses default)', async () => {
      const result = await client.callTool({
        name: 'corvus_scope',
        arguments: { username: 'satoshi' },
      })
      const parsed = parseContent(result)
      expect(vi.mocked(buildScopeSnapshot)).toHaveBeenCalledOnce()
      const [, handle] = vi.mocked(buildScopeSnapshot).mock.calls[0]
      expect(handle).toBe('satoshi')
      expect(parsed.account.handle).toBe('testuser')
    })

    it('corvus_read handles URL with tracking params', async () => {
      const result = await client.callTool({
        name: 'corvus_read',
        arguments: { tweetIdOrUrl: 'https://x.com/user/status/99999?ref=timeline&s=20' },
      })
      const parsed = parseContent(result)
      expect(vi.mocked(buildReadSnapshot)).toHaveBeenCalledOnce()
      const [, tweetId] = vi.mocked(buildReadSnapshot).mock.calls[0]
      expect(tweetId).toBe('99999')
      expect(parsed.tweet.author).toBe('testuser')
    })

    it('corvus_scan propagates builder errors', async () => {
      vi.mocked(buildScanSnapshot).mockRejectedValueOnce(new Error('API unavailable'))
      const result = await client.callTool({
        name: 'corvus_scan',
        arguments: { topic: 'test', maxResults: 10 },
      })
      expect(result.isError).toBe(true)
      const text = result.content as { type: string; text: string }[]
      expect(text[0].text).toContain('API unavailable')
    })

    it('corvus_pulse propagates builder errors', async () => {
      vi.mocked(buildPulseSnapshot).mockRejectedValueOnce(new Error('Grok timeout'))
      const result = await client.callTool({
        name: 'corvus_pulse',
        arguments: { topic: 'test', maxResults: 10 },
      })
      expect(result.isError).toBe(true)
      const text = result.content as { type: string; text: string }[]
      expect(text[0].text).toContain('Grok timeout')
    })

    it('all 7 tools have descriptions', async () => {
      const { tools } = await client.listTools()
      for (const tool of tools) {
        expect(tool.description).toBeDefined()
        expect(tool.description!.length).toBeGreaterThan(10)
      }
    })

    it('all 7 tools have input schemas', async () => {
      const { tools } = await client.listTools()
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined()
        expect(tool.inputSchema.type).toBe('object')
      }
    })
  })

  describe('extractTweetId', () => {
    it('extracts ID from x.com status URL', () => {
      expect(extractTweetId('https://x.com/user/status/1234567890')).toBe('1234567890')
    })

    it('extracts ID from twitter.com status URL', () => {
      expect(extractTweetId('https://twitter.com/user/status/9876543210')).toBe('9876543210')
    })

    it('extracts ID from URL with query parameters', () => {
      expect(extractTweetId('https://x.com/user/status/111222333?s=20')).toBe('111222333')
    })

    it('accepts raw numeric ID', () => {
      expect(extractTweetId('1234567890')).toBe('1234567890')
    })

    it('returns null for plain text', () => {
      expect(extractTweetId('abc')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(extractTweetId('')).toBeNull()
    })

    it('returns null for URL without /status/', () => {
      expect(extractTweetId('https://x.com/user')).toBeNull()
    })

    it('returns null for mixed alphanumeric', () => {
      expect(extractTweetId('abc123def')).toBeNull()
    })

    it('handles very long numeric IDs', () => {
      const longId = '18446744073709551615'
      expect(extractTweetId(longId)).toBe(longId)
    })
  })
})
