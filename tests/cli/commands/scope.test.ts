import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerScopeCommand } from '../../../src/cli/commands/scope.js'

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

function mockScopeFetch() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/users/by/username/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            data: {
              id: 'uid_1',
              username: 'testuser',
              name: 'Test User',
              description: 'A test account',
              public_metrics: { followers_count: 5000, following_count: 200, tweet_count: 500 },
              verified: false,
            },
          }),
        text: () => Promise.resolve(''),
      })
    }
    if (url.includes('/tweets')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            data: [
              {
                id: '1',
                text: 'Tweet 1',
                author_id: 'uid_1',
                created_at: '2024-01-01',
                public_metrics: {
                  like_count: 10,
                  retweet_count: 5,
                  reply_count: 2,
                  impression_count: 100,
                },
              },
              {
                id: '2',
                text: 'Tweet 2',
                author_id: 'uid_1',
                created_at: '2024-01-02',
                public_metrics: {
                  like_count: 20,
                  retweet_count: 8,
                  reply_count: 3,
                  impression_count: 200,
                },
              },
            ],
          }),
        text: () => Promise.resolve(''),
      })
    }
    return Promise.reject(new Error('Unknown URL'))
  })
}

function grokScopeResponse() {
  const json = JSON.stringify({
    contentPatterns: ['Posts about tech', 'Discusses crypto'],
    recentFocus: ['AI developments'],
    networkPosition: 'Mid-tier tech commentator',
    influence: 'medium',
    signalValue: 'high',
  })
  return {
    choices: [{ message: { content: json } }],
    usage: { prompt_tokens: 200, completion_tokens: 300 },
  }
}

describe('registerScopeCommand', () => {
  let program: Command
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerScopeCommand(program)

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

  it('registers scope command', () => {
    const cmd = program.commands.find((c) => c.name() === 'scope')
    expect(cmd).toBeDefined()
  })

  it('exits with code 1 when no grok key', async () => {
    try {
      await program.parseAsync(['node', 'corvus', 'scope', 'testuser'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('--cost flag shows pricing without API call', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'scope', '--cost', 'testuser'])
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
  })

  it('successful scope prints account info and followers', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockScopeFetch()
    mockQuery.mockResolvedValueOnce(grokScopeResponse())

    await program.parseAsync(['node', 'corvus', 'scope', 'testuser'])
    const output = logs.join('\n')
    expect(output).toContain('@testuser')
    expect(output).toContain('followers')
  })

  it('--format json produces valid JSON with command=scope', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockScopeFetch()
    mockQuery.mockResolvedValueOnce(grokScopeResponse())

    await program.parseAsync(['node', 'corvus', 'scope', '-f', 'json', 'testuser'])
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
    expect(parsed.command).toBe('scope')
  })

  it('X API error prints message and exits', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-x-token')
    mockFetch.mockRejectedValueOnce(new Error('Unauthorized'))
    try {
      await program.parseAsync(['node', 'corvus', 'scope', 'testuser'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('Unauthorized'))).toBe(true)
  })

  it('errors when no X token is set', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    try {
      await program.parseAsync(['node', 'corvus', 'scope', 'testuser'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('X API token required'))).toBe(true)
  })
})
