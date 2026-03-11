import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerAgentCommand } from '../../../src/cli/commands/agent.js'
import type { AgentPlan } from '../../../src/core/agent.js'

const mockQuery = vi.fn()
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockQuery } }
    constructor() {}
  },
}))

vi.mock('../../../src/core/snapshots.js', () => ({
  SnapshotStore: class {
    save(_cmd: string, _topic: string, data: unknown, raw: string, cost: number) {
      return { command: _cmd, topic: _topic, data, raw, timestamp: Date.now(), cost }
    }
    loadLatest() {
      return null
    }
    loadAll() {
      return []
    }
    listTopics() {
      return []
    }
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock isTTY to false for predictable test output
vi.mock('../../../src/cli/theme.js', async () => {
  const actual = await vi.importActual('../../../src/cli/theme.js')
  return {
    ...(actual as object),
    isTTY: false,
  }
})

function makePlanResponse(): AgentPlan {
  return {
    goal: 'Assess bitcoin sentiment',
    steps: [
      { command: 'scan', args: { topic: 'bitcoin' }, reasoning: 'Get landscape' },
      { command: 'pulse', args: { topic: 'bitcoin' }, reasoning: 'Check momentum' },
    ],
  }
}

function makeScanGrokResponse() {
  return JSON.stringify({
    tweetAnalysis: [
      { index: 0, sentiment: 0.5, narrative: 'bullish' },
      { index: 1, sentiment: 0.3, narrative: 'bullish' },
    ],
    narratives: [{ theme: 'bullish', description: 'Market optimism' }],
    signals: ['Signal 1'],
  })
}

function makePulseGrokResponse() {
  return JSON.stringify({
    tweetAnalysis: [
      { index: 0, sentiment: -0.2, narrative: 'mixed' },
      { index: 1, sentiment: 0.1, narrative: 'mixed' },
    ],
    bullSignals: ['Bull 1'],
    bearSignals: ['Bear 1'],
  })
}

function makeBriefResponse() {
  return JSON.stringify({
    signalLine: 'Bitcoin sentiment is cautiously bullish.',
    summary: ['Net positive sentiment across scan and pulse.'],
    contradictions: [],
    keyAccounts: [{ handle: 'user1', reach: 1000, sentiment: 0.5, stance: 'Bullish' }],
    evidence: [{ source: 'scan', key: 'Sentiment', detail: 'Positive at +0.4' }],
  })
}

function xSearchResponse(tweetCount = 2) {
  const tweets = Array.from({ length: tweetCount }, (_, i) => ({
    id: String(i + 1),
    text: `Test tweet ${i + 1}`,
    author_id: `author_${i + 1}`,
    created_at: '2024-01-01T00:00:00Z',
    public_metrics: {
      retweet_count: 5,
      reply_count: 2,
      like_count: 10,
      impression_count: 100,
    },
  }))
  const users = Array.from({ length: tweetCount }, (_, i) => ({
    id: `author_${i + 1}`,
    username: `user${i + 1}`,
    name: `User ${i + 1}`,
    description: '',
    public_metrics: {
      followers_count: 1000 * (i + 1),
      following_count: 500,
      tweet_count: 100,
    },
    verified: false,
  }))

  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () =>
      Promise.resolve({
        data: tweets,
        includes: { users },
        meta: { result_count: tweetCount },
      }),
    text: () => Promise.resolve(''),
  }
}

function grokApiResponse(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 500, completion_tokens: 300 },
  }
}

describe('registerAgentCommand', () => {
  let program: Command
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerAgentCommand(program)

    logs = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      exitCode = typeof code === 'number' ? code : undefined
      throw new Error('process.exit')
    })

    mockQuery.mockReset()
    mockFetch.mockReset()
    exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('registers agent command on program', () => {
    const cmd = program.commands.find((c) => c.name() === 'agent')
    expect(cmd).toBeDefined()
    expect(cmd!.description()).toBe('Investigate a question — plans, executes, and synthesizes a brief')
  })

  it('exits with code 1 when no grok key is configured', async () => {
    try {
      await program.parseAsync(['node', 'corvus', 'agent', 'What is bitcoin doing'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('--cost flag shows pricing without API call', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'agent', '--cost', 'bitcoin sentiment'])
    expect(logs.some((l) => l.includes('grok-4-1-fast'))).toBe(true)
    expect(logs.some((l) => l.includes('Estimated cost per step'))).toBe(true)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('runs full agent pipeline and produces brief output', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')

    // Plan with no-replan to keep it predictable
    // Grok calls: plan, scan analysis, pulse analysis, synthesis
    // But scan leads may add scope steps, so provide extra mock responses
    mockQuery
      .mockResolvedValueOnce(grokApiResponse(JSON.stringify(makePlanResponse()))) // plan
      .mockResolvedValueOnce(grokApiResponse(makeScanGrokResponse())) // scan
      .mockResolvedValueOnce(grokApiResponse(makePulseGrokResponse())) // pulse
      .mockResolvedValueOnce(grokApiResponse(makeBriefResponse())) // synthesis

    // X API calls: scan search, pulse search
    mockFetch
      .mockResolvedValueOnce(xSearchResponse()) // scan X search
      .mockResolvedValueOnce(xSearchResponse()) // pulse X search

    await program.parseAsync([
      'node',
      'corvus',
      'agent',
      '--no-replan',
      '-n',
      '2',
      'bitcoin',
      'sentiment',
    ])

    const output = logs.join('\n')
    expect(output).toContain('╔═╗╔═╗╦═╗') // logo box chars
    expect(output).toContain('Bitcoin sentiment is cautiously bullish') // signal line
    expect(output).toContain('Confidence') // confidence section
    expect(output).toContain('steps') // footer
  })

  it('--format json produces valid JSON', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')

    mockQuery
      .mockResolvedValueOnce(grokApiResponse(JSON.stringify(makePlanResponse())))
      .mockResolvedValueOnce(grokApiResponse(makeScanGrokResponse()))
      .mockResolvedValueOnce(grokApiResponse(makePulseGrokResponse()))
      .mockResolvedValueOnce(grokApiResponse(makeBriefResponse()))

    mockFetch.mockResolvedValueOnce(xSearchResponse()).mockResolvedValueOnce(xSearchResponse())

    await program.parseAsync([
      'node',
      'corvus',
      'agent',
      '-f',
      'json',
      '--no-replan',
      '-n',
      '2',
      'test',
    ])

    const jsonLog = logs.find((l) => {
      try {
        JSON.parse(l)
        return true
      } catch {
        return false
      }
    })
    expect(jsonLog).toBeDefined()
    const parsed = JSON.parse(jsonLog!)
    expect(parsed.signalLine).toBeDefined()
    expect(parsed.confidence).toBeDefined()
  })

  it('planning error prints message and exits', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockRejectedValueOnce(new Error('Grok unavailable'))

    try {
      await program.parseAsync(['node', 'corvus', 'agent', 'test'])
    } catch {
      /* process.exit */
    }

    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('Planning failed'))).toBe(true)
  })

  it('agent command requires at least one argument', () => {
    const cmd = program.commands.find((c) => c.name() === 'agent')
    expect(cmd).toBeDefined()
    // Commander's <question...> syntax requires at least one argument
    // Verify the command is configured with a required variadic argument
    const argDef = cmd!.registeredArguments?.[0]
    expect(argDef?.required).toBe(true)
    expect(argDef?.variadic).toBe(true)
  })
})

describe('renderAgentBrief', () => {
  it('is exported and callable', async () => {
    const { renderAgentBrief } = await import('../../../src/cli/output.js')
    expect(typeof renderAgentBrief).toBe('function')
  })

  it('renders all sections', async () => {
    const { renderAgentBrief } = await import('../../../src/cli/output.js')
    const { strip } = await import('../../../src/cli/theme.js')

    const brief = {
      signalLine: 'Bitcoin is bullish.',
      sentiment: 0.42,
      summary: ['Finding 1', 'Finding 2'],
      contradictions: ['Contradiction 1'],
      keyAccounts: [{ handle: 'alice', reach: 5000, sentiment: 0.6, stance: 'Long BTC' }],
      evidence: [{ source: 'scan', key: 'Sentiment', detail: '+0.42 avg' }],
      confidence: {
        overall: 0.72,
        volume: 'moderate' as const,
        consistency: 0.3,
        diversity: 0.65,
      },
      sampleSize: 147,
      staleness: null,
    }

    const output = strip(
      renderAgentBrief(brief, {
        stepCount: 4,
        durationMs: 12500,
        tweetCount: 147,
        accountCount: 38,
        cost: 0.0234,
      }),
    )

    expect(output).toContain('Bitcoin is bullish')
    expect(output).toContain('Finding 1')
    expect(output).toContain('Finding 2')
    expect(output).toContain('Contradiction 1')
    expect(output).toContain('@alice')
    expect(output).toContain('Long BTC')
    expect(output).toContain('0.72')
    expect(output).toContain('147 tweets')
    expect(output).toContain('4 steps')
    expect(output).toContain('$0.0234')
  })

  it('shows staleness warning when > 1h', async () => {
    const { renderAgentBrief } = await import('../../../src/cli/output.js')
    const { strip } = await import('../../../src/cli/theme.js')

    const brief = {
      signalLine: 'Test.',
      sentiment: 0,
      summary: [],
      contradictions: [],
      keyAccounts: [],
      evidence: [],
      confidence: { overall: 0, volume: 'low' as const, consistency: 0, diversity: 0 },
      sampleSize: 0,
      staleness: 8 * 3600_000, // 8 hours
    }

    const output = strip(
      renderAgentBrief(brief, {
        stepCount: 1,
        durationMs: 1000,
        tweetCount: 0,
        accountCount: 0,
        cost: 0.001,
      }),
    )

    expect(output).toContain('stale')
    expect(output).toContain('8h')
  })

  it('shows previous sentiment when provided', async () => {
    const { renderAgentBrief } = await import('../../../src/cli/output.js')
    const { strip } = await import('../../../src/cli/theme.js')

    const brief = {
      signalLine: 'Test.',
      sentiment: -0.3,
      summary: [],
      contradictions: [],
      keyAccounts: [],
      evidence: [],
      confidence: { overall: 0.5, volume: 'moderate' as const, consistency: 0.2, diversity: 0.5 },
      sampleSize: 50,
      staleness: null,
    }

    const output = strip(
      renderAgentBrief(brief, {
        stepCount: 2,
        durationMs: 5000,
        tweetCount: 50,
        accountCount: 20,
        cost: 0.01,
        previousSentiment: 0.12,
      }),
    )

    expect(output).toContain('was +0.12')
  })

  it('omits contradictions section when empty', async () => {
    const { renderAgentBrief } = await import('../../../src/cli/output.js')
    const { strip } = await import('../../../src/cli/theme.js')

    const brief = {
      signalLine: 'Test.',
      sentiment: 0,
      summary: ['Finding'],
      contradictions: [],
      keyAccounts: [],
      evidence: [],
      confidence: { overall: 0.5, volume: 'moderate' as const, consistency: 0.2, diversity: 0.5 },
      sampleSize: 50,
      staleness: null,
    }

    const output = strip(
      renderAgentBrief(brief, {
        stepCount: 1,
        durationMs: 1000,
        tweetCount: 50,
        accountCount: 10,
        cost: 0.005,
      }),
    )

    expect(output).not.toContain('Contradictions')
  })

  it('renders with zero sentiment', async () => {
    const { renderAgentBrief } = await import('../../../src/cli/output.js')
    const { strip } = await import('../../../src/cli/theme.js')

    const brief = {
      signalLine: 'Neutral signal.',
      sentiment: 0,
      summary: ['Neutral finding'],
      contradictions: [],
      keyAccounts: [],
      evidence: [],
      confidence: { overall: 0.5, volume: 'moderate' as const, consistency: 0.3, diversity: 0.4 },
      sampleSize: 30,
      staleness: null,
    }

    const output = strip(
      renderAgentBrief(brief, {
        stepCount: 2,
        durationMs: 3000,
        tweetCount: 30,
        accountCount: 10,
        cost: 0.01,
      }),
    )

    expect(output).toContain('+0')
  })

  it('renders empty summary and keyAccounts without section headers', async () => {
    const { renderAgentBrief } = await import('../../../src/cli/output.js')
    const { strip } = await import('../../../src/cli/theme.js')

    const brief = {
      signalLine: 'Minimal brief.',
      sentiment: 0.1,
      summary: [],
      contradictions: [],
      keyAccounts: [],
      evidence: [],
      confidence: { overall: 0.3, volume: 'low' as const, consistency: 0.1, diversity: 0.2 },
      sampleSize: 5,
      staleness: null,
    }

    const output = strip(
      renderAgentBrief(brief, {
        stepCount: 1,
        durationMs: 1000,
        tweetCount: 5,
        accountCount: 2,
        cost: 0.002,
      }),
    )

    expect(output).not.toContain('Key Findings')
    expect(output).not.toContain('Top Voices')
  })

  it('renderAgentBriefMd produces valid markdown', async () => {
    const { renderAgentBriefMd } = await import('../../../src/cli/output.js')

    const brief = {
      signalLine: 'Bitcoin trending bullish.',
      sentiment: 0.35,
      summary: ['Strong buying pressure', 'Institutional interest'],
      contradictions: ['Some bear warnings'],
      keyAccounts: [{ handle: 'whale1', reach: 50000, sentiment: 0.8, stance: 'Accumulating' }],
      evidence: [{ source: 'scan', key: 'Sentiment', detail: '+0.35 avg' }],
      confidence: { overall: 0.7, volume: 'moderate' as const, consistency: 0.5, diversity: 0.6 },
      sampleSize: 200,
      staleness: null,
    }

    const output = renderAgentBriefMd(brief, {
      stepCount: 3,
      durationMs: 8000,
      tweetCount: 200,
      accountCount: 45,
      cost: 0.03,
    })

    expect(output).toContain('##')
    expect(output).toContain('**Sentiment:**')
    expect(output).toContain('### Key Findings')
    expect(output).toContain('| Handle |')
    expect(output).toContain('Confidence')
  })
})
