import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrokAdapter, parseGrokJson, GrokParseError } from '../../src/core/grok-adapter.js'

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

  it('passes signal in request options (second argument)', async () => {
    await adapter.query('test')
    const requestOpts = mockCreate.mock.calls[0][1]
    expect(requestOpts).toBeDefined()
    expect(requestOpts.signal).toBeInstanceOf(AbortSignal)
  })

  it('retries once on transient 500 error', async () => {
    const error500 = Object.assign(new Error('Internal Server Error'), { status: 500 })
    mockCreate
      .mockRejectedValueOnce(error500)
      .mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('retries once on transient 502 error', async () => {
    const error502 = Object.assign(new Error('Bad Gateway'), { status: 502 })
    mockCreate
      .mockRejectedValueOnce(error502)
      .mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('retries once on transient 503 error', async () => {
    const error503 = Object.assign(new Error('Service Unavailable'), { status: 503 })
    mockCreate
      .mockRejectedValueOnce(error503)
      .mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('retries once on 429 without excessive Retry-After', async () => {
    const error429 = Object.assign(new Error('Rate limited'), {
      status: 429,
      headers: { 'retry-after': '3' },
    })
    mockCreate
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('does not retry on 429 with Retry-After > 10s', async () => {
    const error429 = Object.assign(new Error('Rate limited'), {
      status: 429,
      headers: { 'retry-after': '60' },
    })
    mockCreate.mockRejectedValueOnce(error429)

    await expect(adapter.query('test')).rejects.toThrow()
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('does not retry on 401 unauthorized', async () => {
    const error401 = Object.assign(new Error('Unauthorized'), { status: 401 })
    mockCreate.mockRejectedValueOnce(error401)

    await expect(adapter.query('test')).rejects.toThrow('Unauthorized')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('does not retry on 404 not found', async () => {
    const error404 = Object.assign(new Error('Not Found'), { status: 404 })
    mockCreate.mockRejectedValueOnce(error404)

    await expect(adapter.query('test')).rejects.toThrow('Not Found')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('retries on network error with ECONNRESET code', async () => {
    const networkErr = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' })
    mockCreate
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('throws after max retry attempts exhausted', async () => {
    const error500 = Object.assign(new Error('Internal Server Error'), { status: 500 })
    mockCreate
      .mockRejectedValueOnce(error500)
      .mockRejectedValueOnce(error500)

    await expect(adapter.query('test')).rejects.toThrow('Internal Server Error')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  }, 10000)
})

describe('parseGrokJson', () => {
  it('parses clean JSON', () => {
    const result = parseGrokJson<{ foo: number }>('{"foo": 42}')
    expect(result).toEqual({ foo: 42 })
  })

  it('parses JSON wrapped in markdown fences', () => {
    const raw = '```json\n{"foo": 42}\n```'
    const result = parseGrokJson<{ foo: number }>(raw)
    expect(result).toEqual({ foo: 42 })
  })

  it('parses JSON wrapped in bare markdown fences', () => {
    const raw = '```\n{"bar": true}\n```'
    const result = parseGrokJson<{ bar: boolean }>(raw)
    expect(result).toEqual({ bar: true })
  })

  it('strips Grok preamble text before JSON', () => {
    const raw = 'Sure, here is the analysis:\n{"data": [1, 2, 3]}'
    const result = parseGrokJson<{ data: number[] }>(raw)
    expect(result).toEqual({ data: [1, 2, 3] })
  })

  it('strips trailing text after JSON', () => {
    const raw = '{"data": 1}\n\nLet me know if you need more.'
    const result = parseGrokJson<{ data: number }>(raw)
    expect(result).toEqual({ data: 1 })
  })

  it('handles combined preamble, fences, and trailing text', () => {
    const raw = 'Here you go:\n```json\n{"result": "ok"}\n```\nHope this helps!'
    const result = parseGrokJson<{ result: string }>(raw)
    expect(result).toEqual({ result: 'ok' })
  })

  it('parses JSON arrays', () => {
    const raw = 'Results:\n[1, 2, 3]'
    const result = parseGrokJson<number[]>(raw)
    expect(result).toEqual([1, 2, 3])
  })

  it('handles whitespace around JSON', () => {
    const raw = '  \n  {"key": "val"}  \n  '
    const result = parseGrokJson<{ key: string }>(raw)
    expect(result).toEqual({ key: 'val' })
  })

  it('throws GrokParseError on invalid JSON', () => {
    expect(() => parseGrokJson('{not valid json}')).toThrow(GrokParseError)
  })

  it('throws GrokParseError when no JSON found', () => {
    expect(() => parseGrokJson('no json here at all')).toThrow(GrokParseError)
  })

  it('throws GrokParseError on empty string', () => {
    expect(() => parseGrokJson('')).toThrow(GrokParseError)
  })

  it('GrokParseError includes rawPreview', () => {
    try {
      parseGrokJson('definitely not json {broken')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(GrokParseError)
      expect((err as GrokParseError).rawPreview).toContain('definitely not json')
    }
  })

  it('GrokParseError truncates raw preview at 300 chars', () => {
    const longRaw = 'A'.repeat(400) + '{"key": bad}'
    try {
      parseGrokJson(longRaw)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(GrokParseError)
      expect((err as GrokParseError).rawPreview.length).toBeLessThanOrEqual(303) // 300 + '...'
    }
  })

  it('handles nested braces correctly', () => {
    const raw = '{"outer": {"inner": [1, 2]}}'
    const result = parseGrokJson<{ outer: { inner: number[] } }>(raw)
    expect(result.outer.inner).toEqual([1, 2])
  })
})
