import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrokAdapter } from '../../src/core/grok-adapter.js'

const mockCreate = vi.fn()

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } }
    constructor() {}
  },
}))

function mockResponse(overrides: Record<string, unknown> = {}) {
  return {
    choices: [{ message: { content: 'Test response' } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    ...overrides,
  }
}

function mockStream(chunks: Record<string, unknown>[] = []) {
  mockCreate.mockResolvedValueOnce({
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk
    },
  })
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const result: string[] = []
  for await (const chunk of stream) result.push(chunk)
  return result
}

describe('GrokAdapter', () => {
  let adapter: GrokAdapter

  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(mockResponse())
    adapter = new GrokAdapter('xai-test-key')
  })

  it('returns structured response with text and usage', async () => {
    const result = await adapter.query('What are devs saying?')
    expect(result.text).toBe('Test response')
    expect(result.usage.inputTokens).toBe(100)
    expect(result.usage.outputTokens).toBe(50)
    expect(typeof result.usage.costUsd).toBe('number')
  })

  it('sends user message in the request', async () => {
    await adapter.query('my question')
    const args = mockCreate.mock.calls[0][0]
    const userMsg = args.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg).toBeDefined()
    expect(userMsg.content).toBe('my question')
  })

  it('includes system message when systemPrompt is provided', async () => {
    await adapter.query('test', { systemPrompt: 'You are Corvus.' })
    const args = mockCreate.mock.calls[0][0]
    const sysMsg = args.messages.find((m: { role: string }) => m.role === 'system')
    expect(sysMsg).toBeDefined()
    expect(sysMsg.content).toBe('You are Corvus.')
  })

  it('system message comes before user message', async () => {
    await adapter.query('test', { systemPrompt: 'system text' })
    const args = mockCreate.mock.calls[0][0]
    expect(args.messages[0].role).toBe('system')
    expect(args.messages[1].role).toBe('user')
  })

  it('omits system message when no systemPrompt', async () => {
    await adapter.query('test')
    const args = mockCreate.mock.calls[0][0]
    expect(args.messages).toHaveLength(1)
    expect(args.messages[0].role).toBe('user')
  })

  it('passes x_search tool when enableXSearch is true', async () => {
    await adapter.query('trending?', { enableXSearch: true })
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(1)
    expect(args.tools[0].function.name).toBe('x_search')
    expect(args.tools[0].type).toBe('function')
  })

  it('passes web_search tool when enableWebSearch is true', async () => {
    await adapter.query('news?', { enableWebSearch: true })
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(1)
    expect(args.tools[0].function.name).toBe('web_search')
  })

  it('passes both tools when both search options are true', async () => {
    await adapter.query('search all', { enableXSearch: true, enableWebSearch: true })
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(2)
    const names = args.tools.map((t: { function: { name: string } }) => t.function.name)
    expect(names).toContain('x_search')
    expect(names).toContain('web_search')
  })

  it('omits tools property entirely when no search options', async () => {
    await adapter.query('plain question')
    expect(mockCreate.mock.calls[0][0].tools).toBeUndefined()
  })

  it('uses grok-4-1-fast by default', async () => {
    await adapter.query('test')
    expect(mockCreate.mock.calls[0][0].model).toBe('grok-4-1-fast')
  })

  it('uses custom model when specified', async () => {
    await adapter.query('test', { model: 'grok-4' })
    expect(mockCreate.mock.calls[0][0].model).toBe('grok-4')
  })

  it('calculates cost for grok-4-1-fast', async () => {
    const result = await adapter.query('test')
    const expected = (100 * 0.2 + 50 * 0.5) / 1_000_000
    expect(result.usage.costUsd).toBeCloseTo(expected, 10)
  })

  it('calculates cost for grok-4 model', async () => {
    const result = await adapter.query('test', { model: 'grok-4' })
    const expected = (100 * 3.0 + 50 * 15.0) / 1_000_000
    expect(result.usage.costUsd).toBeCloseTo(expected, 10)
  })

  it('falls back to default pricing for unknown model', async () => {
    const result = await adapter.query('test', { model: 'grok-future-99' })
    const expected = (100 * 0.2 + 50 * 0.5) / 1_000_000
    expect(result.usage.costUsd).toBeCloseTo(expected, 10)
  })

  it('returns zero cost when usage has zero tokens', async () => {
    mockCreate.mockResolvedValueOnce(mockResponse({
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    }))
    const result = await adapter.query('test')
    expect(result.usage.costUsd).toBe(0)
    expect(result.usage.inputTokens).toBe(0)
    expect(result.usage.outputTokens).toBe(0)
  })

  it('passes default maxTokens of 2048', async () => {
    await adapter.query('test')
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(2048)
  })

  it('passes custom maxTokens when specified', async () => {
    await adapter.query('test', { maxTokens: 500 })
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(500)
  })

  it('returns empty string when content is null', async () => {
    mockCreate.mockResolvedValueOnce(mockResponse({
      choices: [{ message: { content: null } }],
    }))
    expect((await adapter.query('test')).text).toBe('')
  })

  it('returns empty string when choices array is empty', async () => {
    mockCreate.mockResolvedValueOnce(mockResponse({ choices: [] }))
    expect((await adapter.query('test')).text).toBe('')
  })

  it('defaults to zero tokens when usage is missing', async () => {
    mockCreate.mockResolvedValueOnce(mockResponse({ usage: undefined }))
    const result = await adapter.query('test')
    expect(result.usage.inputTokens).toBe(0)
    expect(result.usage.outputTokens).toBe(0)
    expect(result.usage.costUsd).toBe(0)
  })

  it('propagates API errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'))
    await expect(adapter.query('test')).rejects.toThrow('API rate limit exceeded')
  })

  it('propagates network errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('fetch failed'))
    await expect(adapter.query('test')).rejects.toThrow('fetch failed')
  })

  it('yields content chunks from stream', async () => {
    mockStream([
      { choices: [{ delta: { content: 'Hello' } }] },
      { choices: [{ delta: { content: ' world' } }] },
      { choices: [{ delta: { content: '!' } }] },
    ])
    expect(await collect(adapter.stream('test'))).toEqual(['Hello', ' world', '!'])
  })

  it('skips chunks with null content', async () => {
    mockStream([
      { choices: [{ delta: { content: 'data' } }] },
      { choices: [{ delta: { content: null } }] },
      { choices: [{ delta: {} }] },
      { choices: [{ delta: { content: 'more' } }] },
    ])
    expect(await collect(adapter.stream('test'))).toEqual(['data', 'more'])
  })

  it('yields nothing for empty stream', async () => {
    mockStream()
    expect(await collect(adapter.stream('test'))).toEqual([])
  })

  it('stream passes stream: true to API', async () => {
    mockStream()
    await collect(adapter.stream('test'))
    expect(mockCreate.mock.calls[0][0].stream).toBe(true)
  })

  it('stream uses custom model', async () => {
    mockStream()
    await collect(adapter.stream('test', { model: 'grok-4' }))
    expect(mockCreate.mock.calls[0][0].model).toBe('grok-4')
  })

  it('stream passes x_search tool when enableXSearch is true', async () => {
    mockStream()
    await collect(adapter.stream('test', { enableXSearch: true }))
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(1)
    expect(args.tools[0].function.name).toBe('x_search')
  })

  it('stream passes both tools when both search options set', async () => {
    mockStream()
    await collect(adapter.stream('test', { enableXSearch: true, enableWebSearch: true }))
    expect(mockCreate.mock.calls[0][0].tools).toHaveLength(2)
  })

  it('stream omits tools when no search options', async () => {
    mockStream()
    await collect(adapter.stream('test'))
    expect(mockCreate.mock.calls[0][0].tools).toBeUndefined()
  })

  it('stream propagates API errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('stream error'))
    await expect(adapter.stream('test').next()).rejects.toThrow('stream error')
  })
})
