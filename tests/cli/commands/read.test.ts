import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerReadCommand } from '../../../src/cli/commands/read.js'

const mockQuery = vi.fn()
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockQuery } }
    constructor() {}
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

  it('registers read command', () => {
    const cmd = program.commands.find((c) => c.name() === 'read')
    expect(cmd).toBeDefined()
  })

  it('exits with code 1 when no grok key', async () => {
    try {
      await program.parseAsync(['node', 'corvus', 'read', '123456'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('exits with code 1 when no x token', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    try {
      await program.parseAsync(['node', 'corvus', 'read', '123456'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('X API token required'))).toBe(true)
  })

  it('extracts tweet ID from full URL', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')

    mockFetch.mockResolvedValueOnce(xApiResponse({
      data: {
        id: '789012',
        text: 'This is the tweet',
        author_id: 'user_1',
        created_at: '2026-03-10T12:00:00Z',
        public_metrics: { retweet_count: 5, reply_count: 2, like_count: 50, impression_count: 1000 },
      },
    }))
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'analysis of tweet' } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    })

    await program.parseAsync(['node', 'corvus', 'read', 'https://x.com/user/status/789012'])
    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toContain('/tweets/789012')
  })

  it('accepts bare numeric tweet ID', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')

    mockFetch.mockResolvedValueOnce(xApiResponse({
      data: {
        id: '555',
        text: 'bare id tweet',
        author_id: 'u1',
        created_at: '2026-03-10T12:00:00Z',
        public_metrics: { retweet_count: 0, reply_count: 0, like_count: 0, impression_count: 0 },
      },
    }))
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'analysis' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })

    await program.parseAsync(['node', 'corvus', 'read', '555'])
    const fetchUrl = mockFetch.mock.calls[0][0] as string
    expect(fetchUrl).toContain('/tweets/555')
  })

  it('sends tweet data to Grok for analysis', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')

    mockFetch.mockResolvedValueOnce(xApiResponse({
      data: {
        id: '123',
        text: 'AI agents will change everything',
        author_id: 'user_1',
        created_at: '2026-03-10T12:00:00Z',
        public_metrics: { retweet_count: 50, reply_count: 10, like_count: 200, impression_count: 5000 },
      },
    }))
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'This tweet is significant because...' } }],
      usage: { prompt_tokens: 200, completion_tokens: 300 },
    })

    await program.parseAsync(['node', 'corvus', 'read', '123'])
    const userMsg = mockQuery.mock.calls[0][0].messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('AI agents will change everything')
    expect(userMsg.content).toContain('200 likes')
    expect(logs.some((l) => l.includes('This tweet is significant'))).toBe(true)
  })

  it('X API error is reported', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')
    mockFetch.mockResolvedValueOnce(xApiResponse({ detail: 'Not Found' }, 404))
    try {
      await program.parseAsync(['node', 'corvus', 'read', '999'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('404'))).toBe(true)
  })

  it('--format json produces valid JSON with command=read', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'x-token')

    mockFetch.mockResolvedValueOnce(xApiResponse({
      data: { id: '1', text: 'test', author_id: 'u', created_at: '', public_metrics: { retweet_count: 0, reply_count: 0, like_count: 0, impression_count: 0 } },
    }))
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'json read' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })

    await program.parseAsync(['node', 'corvus', 'read', '-f', 'json', '1'])
    const jsonLog = logs.find((l) => { try { JSON.parse(l); return true } catch { return false } })
    const parsed = JSON.parse(jsonLog!)
    expect(parsed.command).toBe('read')
    expect(parsed.query).toContain('tweet:1')
  })
})
