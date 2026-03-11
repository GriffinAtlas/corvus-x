import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerAskCommand } from '../../../src/cli/commands/ask.js'

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

describe('registerAskCommand', () => {
  let program: Command
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerAskCommand(program)

    logs = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      exitCode = typeof code === 'number' ? code : undefined
      throw new Error(`process.exit(${code})`)
    })

    mockQuery.mockReset()
    exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('registers ask command on program', () => {
    const cmd = program.commands.find((c) => c.name() === 'ask')
    expect(cmd).toBeDefined()
    expect(cmd!.description()).toBe('Ask a natural language question about X')
  })

  it('exits with code 1 when no grok key is configured', async () => {
    try {
      await program.parseAsync(['node', 'corvus', 'ask', 'test question'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('--cost flag shows model pricing from real pricing table', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'ask', '--cost', 'test question'])
    expect(logs.some((l) => l.includes('grok-4-1-fast'))).toBe(true)
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
  })

  it('--cost flag returns without making an API call', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'ask', '--cost', 'test question'])
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('successful query prints formatted output', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'AI discourse is heating up' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    })
    await program.parseAsync(['node', 'corvus', 'ask', 'what is trending'])
    expect(logs.some((l) => l.includes('AI discourse is heating up'))).toBe(true)
  })

  it('joins multi-word question parts', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'ask', 'what', 'is', 'trending'])
    const userMsg = mockQuery.mock.calls[0][0].messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toBe('what is trending')
  })

  it('passes enableXSearch: true to the adapter', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'ask', 'test'])
    const args = mockQuery.mock.calls[0][0]
    expect(args.tools).toBeDefined()
    expect(args.tools[0].function.name).toBe('x_search')
  })

  it('API error prints message and exits with code 1', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockRejectedValueOnce(new Error('rate limit exceeded'))
    try {
      await program.parseAsync(['node', 'corvus', 'ask', 'test'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('rate limit exceeded'))).toBe(true)
  })

  it('non-Error thrown in catch path is stringified', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockRejectedValueOnce('string error')
    try {
      await program.parseAsync(['node', 'corvus', 'ask', 'test'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('string error'))).toBe(true)
  })

  it('--format json produces valid JSON output', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'json test' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'ask', '-f', 'json', 'test'])
    const jsonLog = logs.find((l) => { try { JSON.parse(l); return true } catch { return false } })
    expect(jsonLog).toBeDefined()
    const parsed = JSON.parse(jsonLog!)
    expect(parsed.command).toBe('ask')
    expect(parsed.response).toBe('json test')
  })
})
