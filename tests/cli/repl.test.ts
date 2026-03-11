import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

const mockQuery = vi.fn()
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockQuery } }
    constructor() {}
  },
}))

// Mock readline to simulate user input
class MockReadline extends EventEmitter {
  output: string[] = []
  promptCalled = 0
  closed = false

  prompt() {
    this.promptCalled++
  }

  close() {
    this.closed = true
    this.emit('close')
  }

  question(_q: string, cb: (answer: string) => void) {
    cb('')
  }

  simulateLine(text: string) {
    this.emit('line', text)
  }
}

let mockRl: MockReadline
vi.mock('readline', () => ({
  createInterface: () => {
    mockRl = new MockReadline()
    return mockRl
  },
}))

describe('REPL', () => {
  let logs: string[]
  let exitCode: number | undefined

  beforeEach(() => {
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
    vi.spyOn(console, 'clear').mockImplementation(() => {})
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

  it('exits with code 1 when no grok key', async () => {
    try {
      const { startRepl } = await import('../../src/cli/repl.js')
      await startRepl()
    } catch { /* process.exit */ }
    expect(exitCode).toBe(1)
    expect(logs.some((l) => l.includes('No Grok API key found'))).toBe(true)
  })

  it('starts and shows welcome message', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    const { startRepl } = await import('../../src/cli/repl.js')

    // startRepl is async but sets up the readline listener
    // We need to trigger close after it starts
    const replPromise = startRepl()
    // Give it a tick to set up
    await new Promise((r) => setTimeout(r, 10))

    expect(logs.some((l) => l.includes('corvus interactive'))).toBe(true)
    expect(mockRl.promptCalled).toBeGreaterThan(0)

    // Clean up
    mockRl.close()
    await replPromise
  })

  it('/help shows available commands', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    const { startRepl } = await import('../../src/cli/repl.js')

    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    mockRl.simulateLine('/help')
    await new Promise((r) => setTimeout(r, 10))

    expect(logs.some((l) => l.includes('/help'))).toBe(true)
    expect(logs.some((l) => l.includes('/exit'))).toBe(true)
    expect(logs.some((l) => l.includes('/format'))).toBe(true)

    mockRl.close()
    await replPromise
  })

  it('/cost shows session cost', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    const { startRepl } = await import('../../src/cli/repl.js')

    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    mockRl.simulateLine('/cost')
    await new Promise((r) => setTimeout(r, 10))

    expect(logs.some((l) => l.includes('session cost') && l.includes('$0.0000'))).toBe(true)

    mockRl.close()
    await replPromise
  })

  it('/history shows empty history initially', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    const { startRepl } = await import('../../src/cli/repl.js')

    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    mockRl.simulateLine('/history')
    await new Promise((r) => setTimeout(r, 10))

    expect(logs.some((l) => l.includes('no queries yet'))).toBe(true)

    mockRl.close()
    await replPromise
  })

  it('/format sets output format', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    const { startRepl } = await import('../../src/cli/repl.js')

    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    mockRl.simulateLine('/format json')
    await new Promise((r) => setTimeout(r, 10))

    expect(logs.some((l) => l.includes('format set to json'))).toBe(true)

    mockRl.close()
    await replPromise
  })

  it('/format rejects invalid format', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    const { startRepl } = await import('../../src/cli/repl.js')

    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    mockRl.simulateLine('/format xml')
    await new Promise((r) => setTimeout(r, 10))

    expect(logs.some((l) => l.includes('invalid format'))).toBe(true)

    mockRl.close()
    await replPromise
  })

  it('unknown slash command shows error', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    const { startRepl } = await import('../../src/cli/repl.js')

    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    mockRl.simulateLine('/bogus')
    await new Promise((r) => setTimeout(r, 10))

    expect(logs.some((l) => l.includes('unknown command'))).toBe(true)

    mockRl.close()
    await replPromise
  })

  it('/exit closes the REPL', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    const { startRepl } = await import('../../src/cli/repl.js')

    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    mockRl.simulateLine('/exit')
    await new Promise((r) => setTimeout(r, 10))

    expect(mockRl.closed).toBe(true)
    await replPromise
  })

  it('empty input re-prompts', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    const { startRepl } = await import('../../src/cli/repl.js')

    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    const before = mockRl.promptCalled
    mockRl.simulateLine('')
    await new Promise((r) => setTimeout(r, 10))

    expect(mockRl.promptCalled).toBe(before + 1)

    mockRl.close()
    await replPromise
  })

  it('sends query to Grok and displays result', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'AI agents are trending heavily' } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    })

    const { startRepl } = await import('../../src/cli/repl.js')
    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    mockRl.simulateLine('what is trending in AI?')
    await new Promise((r) => setTimeout(r, 50))

    expect(logs.some((l) => l.includes('AI agents are trending heavily'))).toBe(true)

    mockRl.close()
    await replPromise
  })

  it('handles API errors gracefully in REPL', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockRejectedValueOnce(new Error('rate limit'))

    const { startRepl } = await import('../../src/cli/repl.js')
    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    mockRl.simulateLine('test query')
    await new Promise((r) => setTimeout(r, 50))

    expect(logs.some((l) => l.includes('rate limit'))).toBe(true)
    // REPL should still be alive (not crashed)
    expect(mockRl.closed).toBe(false)

    mockRl.close()
    await replPromise
  })

  it('shows session summary on close', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    mockQuery.mockResolvedValueOnce({
      choices: [{ message: { content: 'response' } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    })

    const { startRepl } = await import('../../src/cli/repl.js')
    const replPromise = startRepl()
    await new Promise((r) => setTimeout(r, 10))

    mockRl.simulateLine('test')
    await new Promise((r) => setTimeout(r, 50))

    mockRl.close()
    await replPromise

    expect(logs.some((l) => l.includes('session:') && l.includes('1 queries'))).toBe(true)
  })
})
