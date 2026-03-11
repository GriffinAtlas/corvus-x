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
      throw new Error(`process.exit(${code})`)
    })

    mockQuery.mockReset()
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
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
  })

  it('--cost flag shows pricing', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'gather', '--cost', 'topic'])
    expect(mockQuery).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
  })

  it('enables both x_search and web_search', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'gathered intelligence' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'gather', 'test'])
    const args = mockQuery.mock.calls[0][0]
    const toolNames = args.tools.map((t: { function: { name: string } }) => t.function.name)
    expect(toolNames).toContain('x_search')
    expect(toolNames).toContain('web_search')
  })

  it('sets maxTokens to 6144 for comprehensive output', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'gather', 'test'])
    expect(mockQuery.mock.calls[0][0].max_tokens).toBe(6144)
  })

  it('successful gather prints comprehensive output', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'Executive summary: AI regulation is accelerating...' } }],
      usage: { prompt_tokens: 500, completion_tokens: 2000 },
    })
    await program.parseAsync(['node', 'corvus', 'gather', 'AI', 'regulation'])
    expect(logs.some((l) => l.includes('Executive summary'))).toBe(true)
  })

  it('--format json produces valid JSON with command=gather', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'json gather' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'gather', '-f', 'json', 'test'])
    const jsonLog = logs.find((l) => { try { JSON.parse(l); return true } catch { return false } })
    const parsed = JSON.parse(jsonLog!)
    expect(parsed.command).toBe('gather')
  })

  it('API error exits with code 1', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockRejectedValueOnce(new Error('insufficient quota'))
    try {
      await program.parseAsync(['node', 'corvus', 'gather', 'test'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('insufficient quota'))).toBe(true)
  })
})
