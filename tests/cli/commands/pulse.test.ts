import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerPulseCommand } from '../../../src/cli/commands/pulse.js'

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

describe('registerPulseCommand', () => {
  let program: Command
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerPulseCommand(program)

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

  it('registers pulse command', () => {
    const cmd = program.commands.find((c) => c.name() === 'pulse')
    expect(cmd).toBeDefined()
    expect(cmd!.description()).toContain('pulse')
  })

  it('exits with code 1 when no grok key', async () => {
    try {
      await program.parseAsync(['node', 'corvus', 'pulse', 'bitcoin'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
  })

  it('--cost flag shows pricing', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'pulse', '--cost', 'bitcoin'])
    expect(mockQuery).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('/M tokens'))).toBe(true)
  })

  it('enables both x_search and web_search', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'pulse result' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'pulse', 'test'])
    const args = mockQuery.mock.calls[0][0]
    const toolNames = args.tools.map((t: { function: { name: string } }) => t.function.name)
    expect(toolNames).toContain('x_search')
    expect(toolNames).toContain('web_search')
  })

  it('successful pulse prints output', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'Sentiment is bullish, momentum rising' } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    })
    await program.parseAsync(['node', 'corvus', 'pulse', 'bitcoin'])
    expect(logs.some((l) => l.includes('Sentiment is bullish'))).toBe(true)
  })

  it('--format json produces valid JSON with command=pulse', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'json pulse' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })
    await program.parseAsync(['node', 'corvus', 'pulse', '-f', 'json', 'test'])
    const jsonLog = logs.find((l) => { try { JSON.parse(l); return true } catch { return false } })
    const parsed = JSON.parse(jsonLog!)
    expect(parsed.command).toBe('pulse')
  })

  it('API error exits with code 1', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockRejectedValueOnce(new Error('connection refused'))
    try {
      await program.parseAsync(['node', 'corvus', 'pulse', 'test'])
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
  })
})
