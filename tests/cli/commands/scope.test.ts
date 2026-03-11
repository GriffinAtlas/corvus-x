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

vi.mock('../../../src/core/cache.js', () => ({
  QueryCache: class {
    get() { return null }
    set() {}
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function xApiResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }
}

const MOCK_USER = {
  id: 'user_1',
  username: 'corvus_dev',
  name: 'Corvus Dev',
  description: 'Building intelligence tools',
  public_metrics: { followers_count: 1200, following_count: 300, tweet_count: 4500 },
  verified: false,
}

const MOCK_TWEETS = [
  {
    id: 't1',
    text: 'Working on Corvus today',
    author_id: 'user_1',
    created_at: '2026-03-10T12:00:00Z',
    public_metrics: { retweet_count: 5, reply_count: 2, like_count: 30, impression_count: 800 },
  },
  {
    id: 't2',
    text: 'Grok API is impressive',
    author_id: 'user_1',
    created_at: '2026-03-09T18:00:00Z',
    public_metrics: { retweet_count: 10, reply_count: 5, like_count: 50, impression_count: 1200 },
  },
]

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
      throw new Error(`process.exit(${code})`)
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
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('exits with code 1 when no x token', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    try {
      await program.parseAsync(['node', 'corvus', 'scope', 'testuser'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('X API token required'))).toBe(true)
  })

  it('strips @ prefix from username', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')

    // First call: getUser, second call: getUserTweets
    mockFetch
      .mockResolvedValueOnce(xApiResponse({ data: MOCK_USER }))
      .mockResolvedValueOnce(xApiResponse({ data: MOCK_TWEETS }))
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'profile analysis' } }],
      usage: { prompt_tokens: 200, completion_tokens: 300 },
    })

    await program.parseAsync(['node', 'corvus', 'scope', '@corvus_dev'])
    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toContain('/users/by/username/corvus_dev')
    expect(fetchUrl).not.toContain('@')
  })

  it('fetches user profile and recent tweets then sends to Grok', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')

    mockFetch
      .mockResolvedValueOnce(xApiResponse({ data: MOCK_USER }))
      .mockResolvedValueOnce(xApiResponse({ data: MOCK_TWEETS }))
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'This account is a mid-tier tech builder...' } }],
      usage: { prompt_tokens: 300, completion_tokens: 400 },
    })

    await program.parseAsync(['node', 'corvus', 'scope', 'corvus_dev'])

    // Verify Grok received the profile context
    const userMsg = mockQuery.mock.calls[0][0].messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('@corvus_dev')
    expect(userMsg.content).toContain('Building intelligence tools')
    expect(userMsg.content).toContain('1200')
    expect(userMsg.content).toContain('Working on Corvus today')
    expect(logs.some((l) => l.includes('mid-tier tech builder'))).toBe(true)
  })

  it('-n flag controls tweet count', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')

    mockFetch
      .mockResolvedValueOnce(xApiResponse({ data: MOCK_USER }))
      .mockResolvedValueOnce(xApiResponse({ data: MOCK_TWEETS }))
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'analysis' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })

    await program.parseAsync(['node', 'corvus', 'scope', '-n', '25', 'testuser'])
    const tweetsUrl = mockFetch.mock.calls[1][0] as string
    expect(tweetsUrl).toContain('max_results=25')
  })

  it('--format json produces valid JSON with command=scope', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')

    mockFetch
      .mockResolvedValueOnce(xApiResponse({ data: MOCK_USER }))
      .mockResolvedValueOnce(xApiResponse({ data: MOCK_TWEETS }))
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'json scope' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })

    await program.parseAsync(['node', 'corvus', 'scope', '-f', 'json', 'testuser'])
    const jsonLog = logs.find((l) => { try { JSON.parse(l); return true } catch { return false } })
    const parsed = JSON.parse(jsonLog!)
    expect(parsed.command).toBe('scope')
    expect(parsed.query).toBe('@testuser')
  })

  it('--cost flag shows pricing without API call', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')
    await program.parseAsync(['node', 'corvus', 'scope', '--cost', 'testuser'])
    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
  })

  it('X API error is reported', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')
    mockFetch.mockResolvedValueOnce(xApiResponse({ detail: 'Unauthorized' }, 401))
    try {
      await program.parseAsync(['node', 'corvus', 'scope', 'testuser'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('401'))).toBe(true)
  })
})
