import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerGatherCommand } from '../../../src/cli/commands/gather.js'

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

function grokGatherResponse() {
  const json = JSON.stringify({
    tweetAnalysis: [{ index: 0, sentiment: 0.5, narrative: 'theme' }],
    narratives: [{ theme: 'theme1', description: 'desc' }],
    signals: ['signal'],
    webContext: ['context 1'],
    outlook: 'Looking positive',
  })
  return {
    choices: [{ message: { content: json } }],
    usage: { prompt_tokens: 500, completion_tokens: 2000 },
  }
}

describe('registerGatherCommand', () => {
  let program: Command
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerGatherCommand(program)

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

  it('registers gather command', () => {
    const cmd = program.commands.find((c) => c.name() === 'gather')
    expect(cmd).toBeDefined()
    expect(cmd!.description()).toContain('Comprehensive intelligence')
  })

  it('exits with code 1 when no grok key', async () => {
    try {
      await program.parseAsync(['node', 'corvus', 'gather', 'AI regulation'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('--cost flag shows pricing without API call', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'gather', '--cost', 'topic'])
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
  })

  it('successful gather prints outlook', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockResolvedValueOnce(xSearchResponse())
    mockQuery.mockResolvedValueOnce(grokGatherResponse())

    await program.parseAsync(['node', 'corvus', 'gather', 'AI', 'regulation'])
    const output = logs.join('\n')
    expect(output).toContain('Outlook')
    expect(output).toContain('Looking positive')
  })

  it('--format json produces valid JSON with command=gather', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockResolvedValueOnce(xSearchResponse())
    mockQuery.mockResolvedValueOnce(grokGatherResponse())

    await program.parseAsync(['node', 'corvus', 'gather', '-f', 'json', 'test'])
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
    expect(parsed.command).toBe('gather')
  })

  it('API error exits with code 1', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockRejectedValueOnce(new Error('insufficient quota'))
    try {
      await program.parseAsync(['node', 'corvus', 'gather', 'test'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('insufficient quota'))).toBe(true)
  })

  it('errors when no X token is set', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    try {
      await program.parseAsync(['node', 'corvus', 'gather', 'test'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('X API token required'))).toBe(true)
  })
})
