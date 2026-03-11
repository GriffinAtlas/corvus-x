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
      throw new Error(`process.exit(${code})`)
    })

    mockQuery.mockReset()
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
    try {
      await program.parseAsync(['node', 'corvus', 'trace', 'AI will replace jobs'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
  })

  it('--cost flag shows pricing without API call', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'trace', '--cost', 'narrative'])
    expect(mockQuery).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
  })

  it('enables both x_search and web_search', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'trace result' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'trace', 'test narrative'])
    const args = mockQuery.mock.calls[0][0]
    const toolNames = args.tools.map((t: { function: { name: string } }) => t.function.name)
    expect(toolNames).toContain('x_search')
    expect(toolNames).toContain('web_search')
  })

  it('successful trace prints output with command name', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'The narrative originated from...' } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    })
    await program.parseAsync(['node', 'corvus', 'trace', 'AI', 'replacing', 'jobs'])
    expect(logs.some((l) => l.includes('The narrative originated from'))).toBe(true)
  })

  it('sets maxTokens to 4096', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'trace', 'test'])
    expect(mockQuery.mock.calls[0][0].max_tokens).toBe(4096)
  })

  it('API error prints message and exits', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockRejectedValueOnce(new Error('timeout'))
    try {
      await program.parseAsync(['node', 'corvus', 'trace', 'test'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('timeout'))).toBe(true)
  })
})
