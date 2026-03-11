import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerScanCommand } from '../../../src/cli/commands/scan.js'

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

describe('registerScanCommand', () => {
  let program: Command
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerScanCommand(program)

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

  it('registers scan command on program', () => {
    const cmd = program.commands.find((c) => c.name() === 'scan')
    expect(cmd).toBeDefined()
    expect(cmd!.description()).toBe('Scan X discourse on a topic')
  })

  it('exits with code 1 when no grok key is configured', async () => {
    try {
      await program.parseAsync(['node', 'corvus', 'scan', 'AI agents'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('--cost flag shows model pricing', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'scan', '--cost', 'AI agents'])
    expect(logs.some((l) => l.includes('grok-4-1-fast'))).toBe(true)
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('successful scan prints formatted output', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'AI discourse is active across crypto and tech circles' } }],
      usage: { prompt_tokens: 200, completion_tokens: 300 },
    })
    await program.parseAsync(['node', 'corvus', 'scan', 'AI', 'agents'])
    expect(logs.some((l) => l.includes('AI discourse is active'))).toBe(true)
  })

  it('joins multi-word topic parts', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'scan', 'AI', 'agents', 'on', 'X'])
    const userMsg = mockQuery.mock.calls[0][0].messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('AI agents on X')
  })

  it('enables x_search tool', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'scan', 'test'])
    const args = mockQuery.mock.calls[0][0]
    expect(args.tools).toBeDefined()
    expect(args.tools.some((t: { function: { name: string } }) => t.function.name === 'x_search')).toBe(true)
  })

  it('API error prints message and exits', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockRejectedValueOnce(new Error('service unavailable'))
    try {
      await program.parseAsync(['node', 'corvus', 'scan', 'test'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('service unavailable'))).toBe(true)
  })

  it('--format json produces valid JSON', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'scan result' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'scan', '-f', 'json', 'test'])
    const jsonLog = logs.find((l) => { try { JSON.parse(l); return true } catch { return false } })
    expect(jsonLog).toBeDefined()
    const parsed = JSON.parse(jsonLog!)
    expect(parsed.command).toBe('scan')
  })

  it('sets maxTokens to 3072', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'scan', 'test'])
    expect(mockQuery.mock.calls[0][0].max_tokens).toBe(3072)
  })
})
