import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerPulseCommand } from '../../../src/cli/commands/pulse.js'

const mockQuery = vi.fn()
vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: mockQuery }
    constructor() {}
  },
}))

vi.mock('../../../src/core/snapshots.js', () => ({
  SnapshotStore: class {
    save(_cmd: string, _topic: string, data: any, raw: string, cost: number) {
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

function grokPulseResponse() {
  const json = JSON.stringify({
    takeaway: 'test pulse takeaway',
    actions: ['test pulse action'],
    tweetAnalysis: [{ index: 0, sentiment: 0.5, narrative: 'theme' }],
    bullSignals: ['bull 1'],
    bearSignals: ['bear 1'],
  })
  return {
    output_text: json,
    output: [],
    usage: { input_tokens: 200, output_tokens: 300 },
    citations: [],
  }
}

function grokOnlyPulseResponse() {
  const json = JSON.stringify({
    takeaway: 'grok-only pulse takeaway',
    actions: ['grok-only pulse action'],
    tweetCount: 10,
    uniqueAuthors: 5,
    estimatedEngagement: 500,
    tweetAnalysis: [{ index: 0, sentiment: 0.4, narrative: 'theme' }],
    bullSignals: ['grok bull'],
    bearSignals: ['grok bear'],
    keyVoices: [{ handle: 'user1', sentiment: 0.5, reach: 1000 }],
  })
  return {
    output_text: json,
    output: [],
    usage: { input_tokens: 200, output_tokens: 300 },
    citations: [],
  }
}

describe('registerPulseCommand', () => {
  let program: Command
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerPulseCommand(program)

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

  it('registers pulse command', () => {
    const cmd = program.commands.find((c) => c.name() === 'pulse')
    expect(cmd).toBeDefined()
    expect(cmd!.description()).toContain('pulse')
  })

  it('exits with code 1 when no grok key', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', '')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', '')
    try {
      await program.parseAsync(['node', 'corvus', 'pulse', 'bitcoin'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('--cost flag shows pricing without API call', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'pulse', '--cost', 'bitcoin'])
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
  })

  it('successful pulse prints bull signals', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockResolvedValueOnce(xSearchResponse())
    mockQuery.mockResolvedValueOnce(grokPulseResponse())

    await program.parseAsync(['node', 'corvus', 'pulse', 'bitcoin'])
    const output = logs.join('\n')
    expect(output).toContain('Bull Signals')
    expect(output).toContain('bull 1')
  })

  it('--format json produces valid JSON with command=pulse', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockResolvedValueOnce(xSearchResponse())
    mockQuery.mockResolvedValueOnce(grokPulseResponse())

    await program.parseAsync(['node', 'corvus', 'pulse', '-f', 'json', 'test'])
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
    expect(parsed.command).toBe('pulse')
  })

  it('API error prints message and exits', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockRejectedValueOnce(new Error('connection refused'))
    try {
      await program.parseAsync(['node', 'corvus', 'pulse', 'test'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('connection refused'))).toBe(true)
  })

  it('falls back to Grok-only when no X token is set', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', '')
    mockQuery.mockResolvedValueOnce(grokOnlyPulseResponse())

    await program.parseAsync(['node', 'corvus', 'pulse', 'test'])
    expect(exitCode).toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const output = logs.join('\n')
    expect(output).toContain('Bull Signals')
  })
})
