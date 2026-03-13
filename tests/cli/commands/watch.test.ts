import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { Watcher, registerWatchCommand } from '../../../src/cli/commands/watch.js'
import type { CommandResult } from '../../../src/core/types.js'
import type { WatchSummary } from '../../../src/cli/commands/watch.js'

const mockQuery = vi.fn()
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockQuery } }
    constructor() {}
  },
}))

describe('Watcher', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs first check immediately on start', async () => {
    const updates: CommandResult[] = []
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'initial state' } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    })

    const watcher = new Watcher('AI agents', {
      interval: 60000,
      maxCycles: 1,
      onUpdate: (r) => updates.push(r),
      onError: () => {},
      onStop: () => {},
    })

    await watcher.start('test-key')
    expect(updates).toHaveLength(1)
    expect(updates[0].response).toBe('initial state')
    expect(updates[0].command).toBe('watch')
    watcher.stop()
  })

  it('includes previous snapshot in subsequent checks', async () => {
    mockQuery
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'snapshot 1' } }],
        usage: { prompt_tokens: 100, completion_tokens: 200 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'snapshot 2 — new developments' } }],
        usage: { prompt_tokens: 200, completion_tokens: 300 },
      })

    const updates: CommandResult[] = []
    const watcher = new Watcher('test topic', {
      interval: 10000,
      maxCycles: 2,
      onUpdate: (r) => updates.push(r),
      onError: () => {},
      onStop: () => {},
    })

    await watcher.start('test-key')
    // First check ran immediately, now advance timer for second check
    await vi.advanceTimersByTimeAsync(10000)

    expect(updates).toHaveLength(2)
    // Second call should include previous snapshot
    const secondPrompt = mockQuery.mock.calls[1][0].messages.find(
      (m: { role: string }) => m.role === 'user',
    ).content
    expect(secondPrompt).toContain('snapshot 1')

    watcher.stop()
  })

  it('stops after maxCycles', async () => {
    mockQuery
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'check 1' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'check 2' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      })

    let summary: WatchSummary | null = null
    const watcher = new Watcher('test', {
      interval: 1000,
      maxCycles: 2,
      onUpdate: () => {},
      onError: () => {},
      onStop: (s) => {
        summary = s
      },
    })

    await watcher.start('test-key')
    await vi.advanceTimersByTimeAsync(1000)

    expect(summary).not.toBeNull()
    expect(summary!.cycles).toBe(2)
    expect(watcher.isRunning).toBe(false)
  })

  it('tracks total cost across cycles', async () => {
    mockQuery
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'r1' } }],
        usage: { prompt_tokens: 500, completion_tokens: 1000 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'r2' } }],
        usage: { prompt_tokens: 500, completion_tokens: 1000 },
      })

    let summary: WatchSummary | null = null
    const watcher = new Watcher('test', {
      interval: 1000,
      maxCycles: 2,
      onUpdate: () => {},
      onError: () => {},
      onStop: (s) => {
        summary = s
      },
    })

    await watcher.start('test-key')
    await vi.advanceTimersByTimeAsync(1000)

    expect(summary!.totalCost).toBeGreaterThan(0)
    expect(summary!.topic).toBe('test')
  })

  it('calls onError when API fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('API down'))

    const errors: Error[] = []
    const watcher = new Watcher('test', {
      interval: 60000,
      maxCycles: 1,
      onUpdate: () => {},
      onError: (e) => errors.push(e),
      onStop: () => {},
    })

    await watcher.start('test-key')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('API down')
    watcher.stop()
  })

  it('stops after 5 consecutive errors', async () => {
    // Mock 5 consecutive failures
    for (let i = 0; i < 5; i++) {
      mockQuery.mockRejectedValueOnce(new Error(`Error ${i + 1}`))
    }

    const errors: Error[] = []
    let summary: WatchSummary | null = null
    const watcher = new Watcher('test', {
      interval: 1000,
      maxCycles: 0, // unlimited
      onUpdate: () => {},
      onError: (e) => errors.push(e),
      onStop: (s) => {
        summary = s
      },
    })

    await watcher.start('test-key')
    // First error fires immediately on start, then advance timer for remaining 4
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(1000)
    }

    expect(errors).toHaveLength(5)
    expect(watcher.isRunning).toBe(false)
    expect(summary).not.toBeNull()
  })

  it('resets consecutive error count on success', async () => {
    // Fail twice, succeed once, fail twice more — should NOT stop
    mockQuery
      .mockRejectedValueOnce(new Error('err1'))
      .mockRejectedValueOnce(new Error('err2'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      })
      .mockRejectedValueOnce(new Error('err3'))
      .mockRejectedValueOnce(new Error('err4'))

    const errors: Error[] = []
    const updates: CommandResult[] = []
    const watcher = new Watcher('test', {
      interval: 1000,
      maxCycles: 5,
      onUpdate: (r) => updates.push(r),
      onError: (e) => errors.push(e),
      onStop: () => {},
    })

    await watcher.start('test-key')
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(1000)
    }

    // Should still be running or have completed max cycles, not stopped from errors
    expect(errors).toHaveLength(4)
    expect(updates).toHaveLength(1)
  })

  it('stop() clears interval and marks not running', async () => {
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })

    const watcher = new Watcher('test', {
      interval: 1000,
      maxCycles: 0,
      onUpdate: () => {},
      onError: () => {},
      onStop: () => {},
    })

    await watcher.start('test-key')
    expect(watcher.isRunning).toBe(true)
    watcher.stop()
    expect(watcher.isRunning).toBe(false)
  })
})

describe('registerWatchCommand', () => {
  let program: Command
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerWatchCommand(program)

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

  it('registers watch command', () => {
    const cmd = program.commands.find((c) => c.name() === 'watch')
    expect(cmd).toBeDefined()
    expect(cmd!.description()).toContain('Live-monitor')
  })

  it('exits with code 1 when no grok key', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', '')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', '')
    try {
      await program.parseAsync(['node', 'corvus', 'watch', 'bitcoin'])
    } catch {
      /* process.exit */
    }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('--cost flag shows per-cycle and hourly estimates', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'watch', '--cost', 'bitcoin'])
    expect(mockQuery).not.toHaveBeenCalled()
    expect(logs.some((l) => l.includes('cost per cycle'))).toBe(true)
    expect(logs.some((l) => l.includes('per hour'))).toBe(true)
  })

  it('--cost with -n shows total estimate', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    await program.parseAsync(['node', 'corvus', 'watch', '--cost', '-n', '10', 'bitcoin'])
    expect(logs.some((l) => l.includes('Max cycles: 10'))).toBe(true)
    expect(logs.some((l) => l.includes('Estimated total'))).toBe(true)
  })
})
