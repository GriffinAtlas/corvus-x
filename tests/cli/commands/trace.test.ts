import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerTraceCommand } from '../../../src/cli/commands/trace.js'

const mockQuery = vi.fn()
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockQuery } }
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

function grokTraceResponse() {
  const json = JSON.stringify({
    tweetAnalysis: [{ index: 0, sentiment: 0.5, narrative: 'spread' }],
    originIndex: 0,
    phases: [{ name: 'emergence', tweetIndices: [0], timeframe: 'morning' }],
    mutations: [{ original: 'original', variant: 'variant' }],
  })
  return {
    choices: [{ message: { content: json } }],
    usage: { prompt_tokens: 200, completion_tokens: 300 },
  }
}

function grokOnlyTraceResponse() {
  const json = JSON.stringify({
    tweetCount: 10,
    uniqueAuthors: 5,
    estimatedEngagement: 500,
    tweetAnalysis: [{ index: 0, sentiment: 0.3, narrative: 'spread' }],
    origin: { account: 'source_user', date: '2024-01-01', tweetId: '999', content: 'original post' },
    timeline: [{ phase: 'emergence', tweetCount: 3, keyAmplifiers: ['user1'], timeframe: 'morning' }],
    mutations: [{ original: 'original', variant: 'evolved' }],
  })
  return {
    choices: [{ message: { content: json } }],
    usage: { prompt_tokens: 200, completion_tokens: 300 },
  }
}

describe('registerTraceCommand', () => {
  let program: Command
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerTraceCommand(program)

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

  it('registers trace command', () => {
    const cmd = program.commands.find((c) => c.name() === 'trace')
    expect(cmd).toBeDefined()
  })

  it('exits with code 1 when no grok key', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', '')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', '')
    try {
      await program.parseAsync(['node', 'corvus', 'trace', 'AI will replace jobs'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('--cost flag shows pricing without API call', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'trace', '--cost', 'narrative'])
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
  })

  it('successful trace prints reach and timeline', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockResolvedValueOnce(xSearchResponse())
    mockQuery.mockResolvedValueOnce(grokTraceResponse())

    await program.parseAsync(['node', 'corvus', 'trace', 'AI', 'replacing', 'jobs'])
    const output = logs.join('\n')
    expect(output).toContain('Reach:')
    expect(output).toContain('Timeline')
  })

  it('--format json produces valid JSON with command=trace', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockResolvedValueOnce(xSearchResponse())
    mockQuery.mockResolvedValueOnce(grokTraceResponse())

    await program.parseAsync(['node', 'corvus', 'trace', '-f', 'json', 'test'])
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
    expect(parsed.command).toBe('trace')
  })

  it('API error prints message and exits', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockRejectedValueOnce(new Error('timeout'))
    try {
      await program.parseAsync(['node', 'corvus', 'trace', 'test'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('timeout'))).toBe(true)
  })

  it('falls back to Grok-only when no X token is set', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce(grokOnlyTraceResponse())

    await program.parseAsync(['node', 'corvus', 'trace', 'test'])
    expect(exitCode).toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const output = logs.join('\n')
    expect(output).toContain('Reach:')
  })
})
