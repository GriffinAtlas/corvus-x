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
    get() {
      return null
    }
    set() {}
  },
}))

function streamResult(content = 'response', prompt = 10, completion = 10) {
  return {
    [Symbol.asyncIterator]: async function* () {
      yield { choices: [{ delta: { content } }] }
      yield { usage: { prompt_tokens: prompt, completion_tokens: completion } }
    },
  }
}

function plainResult(content = 'response', prompt = 10, completion = 10) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: prompt, completion_tokens: completion },
  }
}

describe('registerAskCommand', () => {
  let program: Command
  let logs: string[]
  let writes: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerAskCommand(program)

    logs = []
    writes = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk))
      return true
    })
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
      exitCode = typeof code === 'number' ? code : undefined
      throw new Error(`process.exit(${code})`)
    })

    mockQuery.mockReset()
    mockQuery.mockImplementation((params: Record<string, unknown>) => {
      if (params?.stream) return Promise.resolve(streamResult())
      return Promise.resolve(plainResult())
    })
    exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('registers ask command on program', () => {
    const cmd = program.commands.find((c) => c.name() === 'ask')
    expect(cmd).toBeDefined()
    expect(cmd!.description()).toBe('Quick question — prose answer via Grok x_search')
  })

  it('exits with code 1 when no grok key is configured', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', '')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', '')
    try {
      await program.parseAsync(['node', 'corvus', 'ask', 'test question'])
    } catch {
      /* process.exit */
    }
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

  it('successful query streams output to stdout', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockImplementation((params: Record<string, unknown>) => {
      if (params?.stream)
        return Promise.resolve(streamResult('AI discourse is heating up', 100, 50))
      return Promise.resolve(plainResult('AI discourse is heating up', 100, 50))
    })
    await program.parseAsync(['node', 'corvus', 'ask', 'what is trending'])
    expect(writes.some((w) => w.includes('AI discourse is heating up'))).toBe(true)
  })

  it('joins multi-word question parts', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'ask', 'what', 'is', 'trending'])
    const userMsg = mockQuery.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === 'user',
    )
    expect(userMsg.content).toBe('what is trending')
  })

  it('passes enableXSearch: true to the adapter', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'ask', 'test'])
    const args = mockQuery.mock.calls[0][0]
    expect(args.tools).toBeDefined()
    expect(args.tools[0].type).toBe('live_search')
  })

  it('API error prints message and exits with code 1', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockRejectedValueOnce(new Error('rate limit exceeded'))
    try {
      await program.parseAsync(['node', 'corvus', 'ask', 'test'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('rate limit exceeded'))).toBe(true)
  })

  it('non-Error thrown in catch path is stringified', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockRejectedValueOnce('string error')
    try {
      await program.parseAsync(['node', 'corvus', 'ask', 'test'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('string error'))).toBe(true)
  })

  it('--format json produces valid JSON output', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce(plainResult('json test'))
    await program.parseAsync(['node', 'corvus', 'ask', '-f', 'json', 'test'])
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
    expect(parsed.command).toBe('ask')
    expect(parsed.response).toBe('json test')
  })

  it('non-streaming path used for json format', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'ask', '-f', 'json', 'test'])
    const args = mockQuery.mock.calls[0][0]
    expect(args.stream).toBeUndefined()
  })

  it('streaming path used for default table format', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'ask', 'test'])
    const args = mockQuery.mock.calls[0][0]
    expect(args.stream).toBe(true)
  })

  describe('--from/--to date validation (bug 12)', () => {
    it('rejects invalid calendar date like Feb 30', async () => {
      vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
      await expect(
        program.parseAsync(['node', 'corvus', 'ask', 'test', '--from', '2026-02-30']),
      ).rejects.toThrow('Invalid calendar date: 2026-02-30')
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it('rejects invalid calendar date like Apr 31', async () => {
      vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
      await expect(
        program.parseAsync(['node', 'corvus', 'ask', 'test', '--to', '2026-04-31']),
      ).rejects.toThrow('Invalid calendar date: 2026-04-31')
    })

    it('rejects month 13', async () => {
      vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
      await expect(
        program.parseAsync(['node', 'corvus', 'ask', 'test', '--from', '2026-13-01']),
      ).rejects.toThrow('Invalid calendar date: 2026-13-01')
    })

    it('rejects malformed date format', async () => {
      vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
      await expect(
        program.parseAsync(['node', 'corvus', 'ask', 'test', '--from', '2026/01/15']),
      ).rejects.toThrow('expected YYYY-MM-DD')
    })

    it('accepts valid calendar date like Feb 28 in non-leap year', async () => {
      vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
      // 2025 is not a leap year, Feb 28 is valid
      await program.parseAsync(['node', 'corvus', 'ask', 'test', '--from', '2025-02-28'])
      expect(mockQuery).toHaveBeenCalled()
    })

    it('rejects Feb 29 in non-leap year', async () => {
      vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
      await expect(
        program.parseAsync(['node', 'corvus', 'ask', 'test', '--from', '2025-02-29']),
      ).rejects.toThrow('Invalid calendar date: 2025-02-29')
    })
  })

  describe('--exclude-handle', () => {
    it('passes excluded_x_handles to grok query', async () => {
      vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
      await program.parseAsync([
        'node',
        'corvus',
        'ask',
        'test',
        '--exclude-handle',
        'bot1',
        'bot2',
      ])
      const args = mockQuery.mock.calls[0][0]
      expect(args.tools[0].excluded_x_handles).toEqual(['bot1', 'bot2'])
    })

    it('strips @ prefix from exclude handles', async () => {
      vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
      await program.parseAsync([
        'node',
        'corvus',
        'ask',
        'test',
        '--exclude-handle',
        '@bot1',
      ])
      const args = mockQuery.mock.calls[0][0]
      expect(args.tools[0].excluded_x_handles).toEqual(['bot1'])
    })

    it('rejects both --handle and --exclude-handle', async () => {
      vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
      try {
        await program.parseAsync([
          'node',
          'corvus',
          'ask',
          'test',
          '--handle',
          'user1',
          '--exclude-handle',
          'bot1',
        ])
      } catch {
        /* process.exit */
      }
      expect(exitCode).toBe(1)
      expect(logs.some((l) => l.includes('mutually exclusive'))).toBe(true)
    })
  })
})
