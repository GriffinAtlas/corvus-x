import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerReadCommand, extractTweetId } from '../../../src/cli/commands/read.js'

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

function mockReadFetch() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/tweets/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            data: {
              id: '12345',
              text: 'Test tweet',
              author_id: 'author_1',
              created_at: '2024-01-01',
              public_metrics: {
                like_count: 10,
                retweet_count: 5,
                reply_count: 2,
                impression_count: 100,
              },
            },
          }),
        text: () => Promise.resolve(''),
      })
    }
    if (url.includes('/users/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            data: {
              id: 'author_1',
              username: 'testuser',
              name: 'Test User',
              description: '',
              public_metrics: { followers_count: 1000, following_count: 500, tweet_count: 100 },
              verified: false,
            },
          }),
        text: () => Promise.resolve(''),
      })
    }
    return Promise.reject(new Error('Unknown URL'))
  })
}

function grokReadResponse() {
  const json = JSON.stringify({
    analysis: 'This tweet discusses important topic',
    significance: 'high',
    signals: ['signal 1'],
  })
  return {
    choices: [{ message: { content: json } }],
    usage: { prompt_tokens: 100, completion_tokens: 200 },
  }
}

describe('extractTweetId', () => {
  it('extracts ID from x.com URL', () => {
    expect(extractTweetId('https://x.com/user/status/123456')).toBe('123456')
  })

  it('extracts ID from twitter.com URL', () => {
    expect(extractTweetId('https://twitter.com/user/status/789')).toBe('789')
  })

  it('accepts bare numeric ID', () => {
    expect(extractTweetId('123456789')).toBe('123456789')
  })

  it('returns null for non-numeric non-URL input', () => {
    expect(extractTweetId('not-a-tweet')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractTweetId('')).toBeNull()
  })
})

describe('registerReadCommand', () => {
  let program: Command
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerReadCommand(program)

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

  it('registers read command', () => {
    const cmd = program.commands.find((c) => c.name() === 'read')
    expect(cmd).toBeDefined()
  })

  it('exits with code 1 when no grok key', async () => {
    try {
      await program.parseAsync(['node', 'corvus', 'read', '123456'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('--cost flag shows pricing without API call', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'read', '--cost', '123'])
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
  })

  it('rejects invalid tweet ID', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    try {
      await program.parseAsync(['node', 'corvus', 'read', 'not-a-tweet-id'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('Invalid tweet ID or URL'))).toBe(true)
  })

  it('successful read prints analysis', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockReadFetch()
    mockQuery.mockResolvedValueOnce(grokReadResponse())

    await program.parseAsync(['node', 'corvus', 'read', '12345'])
    const output = logs.join('\n')
    expect(output).toContain('Analysis')
    expect(output).toContain('This tweet discusses important topic')
  })

  it('--format json produces valid JSON with command=read', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockReadFetch()
    mockQuery.mockResolvedValueOnce(grokReadResponse())

    await program.parseAsync(['node', 'corvus', 'read', '-f', 'json', '12345'])
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
    expect(parsed.command).toBe('read')
  })

  it('API error prints message and exits', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    try {
      await program.parseAsync(['node', 'corvus', 'read', '12345'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('network error'))).toBe(true)
  })

  it('errors when no X token is set', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    try {
      await program.parseAsync(['node', 'corvus', 'read', '12345'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('X API token required'))).toBe(true)
  })
})
