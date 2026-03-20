import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrokAdapter, parseGrokJson, GrokParseError, MODEL_PRICING } from '../../src/core/grok-adapter.js'
import { z } from 'zod/v4'

const mockCreate = vi.fn()

vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: mockCreate }
    constructor() {}
  },
}))

function mockResponse(overrides: Record<string, unknown> = {}) {
  return {
    output_text: 'Test response',
    output: [],
    usage: { input_tokens: 100, output_tokens: 50 },
    citations: [],
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
    const userMsg = args.input.find((m: { role: string }) => m.role === 'user')
    expect(userMsg).toBeDefined()
    expect(userMsg.content).toBe('my question')
  })

  it('includes system message when systemPrompt is provided', async () => {
    await adapter.query('test', { systemPrompt: 'You are Corvus.' })
    const args = mockCreate.mock.calls[0][0]
    const sysMsg = args.input.find((m: { role: string }) => m.role === 'system')
    expect(sysMsg).toBeDefined()
    expect(sysMsg.content).toBe('You are Corvus.')
  })

  it('system message comes before user message', async () => {
    await adapter.query('test', { systemPrompt: 'system text' })
    const args = mockCreate.mock.calls[0][0]
    expect(args.input[0].role).toBe('system')
    expect(args.input[1].role).toBe('user')
  })

  it('omits system message when no systemPrompt', async () => {
    await adapter.query('test')
    const args = mockCreate.mock.calls[0][0]
    expect(args.input).toHaveLength(1)
    expect(args.input[0].role).toBe('user')
  })

  it('passes live_search with x source when enableXSearch is true', async () => {
    await adapter.query('trending?', { enableXSearch: true })
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(1)
    expect(args.tools[0].type).toBe('x_search')
  })

  it('passes live_search with date and handle params', async () => {
    await adapter.query('trending?', {
      enableXSearch: true,
      xSearchFromDate: '2026-01-01',
      xSearchToDate: '2026-03-01',
      xSearchHandles: ['elonmusk', 'naval'],
    })
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(1)
    expect(args.tools[0]).toEqual({
      type: 'x_search',
      from_date: '2026-01-01',
      to_date: '2026-03-01',
      x_handles: ['elonmusk', 'naval'],
    })
  })

  it('omits undefined x_search params', async () => {
    await adapter.query('trending?', { enableXSearch: true, xSearchFromDate: '2026-01-01' })
    const args = mockCreate.mock.calls[0][0]
    const tool = args.tools[0]
    expect(tool.type).toBe('x_search')
    expect(tool.from_date).toBe('2026-01-01')
    expect(tool.to_date).toBeUndefined()
    expect(tool.x_handles).toBeUndefined()
  })

  it('passes live_search with web source when enableWebSearch is true', async () => {
    await adapter.query('news?', { enableWebSearch: true })
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(1)
    expect(args.tools[0].type).toBe('web_search')
  })

  it('sends separate x_search and web_search tools when both options are true', async () => {
    await adapter.query('search all', { enableXSearch: true, enableWebSearch: true })
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(2)
    expect(args.tools.map((t: { type: string }) => t.type).sort()).toEqual(['web_search', 'x_search'])
  })

  it('includes x_search params when both flags true', async () => {
    await adapter.query('test', {
      enableXSearch: true,
      enableWebSearch: true,
      xSearchFromDate: '2026-01-01',
      xSearchHandles: ['user1'],
    })
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(2)
    expect(args.tools[0]).toEqual({
      type: 'x_search',
      from_date: '2026-01-01',
      x_handles: ['user1'],
    })
    expect(args.tools[1]).toEqual({ type: 'web_search' })
  })

  it('does not attach x_search params when only enableWebSearch is true', async () => {
    await adapter.query('test', {
      enableWebSearch: true,
      xSearchFromDate: '2026-01-01',
      xSearchToDate: '2026-03-01',
      xSearchHandles: ['someone'],
    })
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(1)
    expect(args.tools[0]).toEqual({ type: 'web_search' })
  })

  it('omits tools property entirely when no search options', async () => {
    await adapter.query('plain question')
    expect(mockCreate.mock.calls[0][0].tools).toBeUndefined()
  })

  it('omits tools when both flags explicitly false', async () => {
    await adapter.query('test', { enableXSearch: false, enableWebSearch: false })
    expect(mockCreate.mock.calls[0][0].tools).toBeUndefined()
  })

  it('does not attach empty handle arrays as params', async () => {
    await adapter.query('test', {
      enableXSearch: true,
      xSearchHandles: [],
      xSearchExcludeHandles: [],
    })
    const tool = mockCreate.mock.calls[0][0].tools[0]
    expect(tool).toEqual({ type: 'x_search' })
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

  it('calculates cost for grok-4-0709 model', async () => {
    const result = await adapter.query('test', { model: 'grok-4-0709' })
    const expected = (100 * 3.0 + 50 * 15.0) / 1_000_000
    expect(result.usage.costUsd).toBeCloseTo(expected, 10)
  })

  it('falls back to default pricing for unknown model', async () => {
    const result = await adapter.query('test', { model: 'grok-future-99' })
    const expected = (100 * 0.2 + 50 * 0.5) / 1_000_000
    expect(result.usage.costUsd).toBeCloseTo(expected, 10)
  })

  it('includes tool call cost in total', async () => {
    mockCreate.mockResolvedValueOnce(
      mockResponse({
        output: [
          { type: 'tool_call', id: '1', name: 'x_search' },
          { type: 'message', content: [{ type: 'output_text', text: 'response with tools' }] },
        ],
      }),
    )
    const result = await adapter.query('test', { enableXSearch: true })
    const tokenCost = (100 * 0.2 + 50 * 0.5) / 1_000_000
    expect(result.usage.toolCalls).toBe(1)
    expect(result.usage.costUsd).toBeCloseTo(tokenCost + 0.005, 10)
  })

  it('calculates cost for multiple tool calls', async () => {
    mockCreate.mockResolvedValueOnce(
      mockResponse({
        output: [
          { type: 'tool_call', id: '1', name: 'x_search' },
          { type: 'tool_call', id: '2', name: 'x_search' },
          { type: 'tool_call', id: '3', name: 'x_search' },
          { type: 'message', content: [{ type: 'output_text', text: 'multi-tool response' }] },
        ],
      }),
    )
    const result = await adapter.query('test', { enableXSearch: true })
    const tokenCost = (100 * 0.2 + 50 * 0.5) / 1_000_000
    expect(result.usage.toolCalls).toBe(3)
    expect(result.usage.costUsd).toBeCloseTo(tokenCost + 3 * 0.005, 10)
  })

  it('reports toolCalls as 0 when no tools used', async () => {
    const result = await adapter.query('test')
    expect(result.usage.toolCalls).toBe(0)
  })

  it('returns zero cost when usage has zero tokens', async () => {
    mockCreate.mockResolvedValueOnce(
      mockResponse({
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    )
    const result = await adapter.query('test')
    expect(result.usage.costUsd).toBe(0)
    expect(result.usage.inputTokens).toBe(0)
    expect(result.usage.outputTokens).toBe(0)
  })

  it('passes default maxTokens of 2048', async () => {
    await adapter.query('test')
    expect(mockCreate.mock.calls[0][0].max_output_tokens).toBe(2048)
  })

  it('passes custom maxTokens when specified', async () => {
    await adapter.query('test', { maxTokens: 500 })
    expect(mockCreate.mock.calls[0][0].max_output_tokens).toBe(500)
  })

  it('returns empty string when output_text is null', async () => {
    mockCreate.mockResolvedValueOnce(
      mockResponse({ output_text: null }),
    )
    expect((await adapter.query('test')).text).toBe('')
  })

  it('returns empty string when output_text is missing', async () => {
    mockCreate.mockResolvedValueOnce(mockResponse({ output_text: undefined }))
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
    mockCreate.mockRejectedValueOnce(error500).mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('retries once on transient 502 error', async () => {
    const error502 = Object.assign(new Error('Bad Gateway'), { status: 502 })
    mockCreate.mockRejectedValueOnce(error502).mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('retries once on transient 503 error', async () => {
    const error503 = Object.assign(new Error('Service Unavailable'), { status: 503 })
    mockCreate.mockRejectedValueOnce(error503).mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('retries once on 429 without excessive Retry-After', async () => {
    const error429 = Object.assign(new Error('Rate limited'), {
      status: 429,
      headers: { 'retry-after': '3' },
    })
    mockCreate.mockRejectedValueOnce(error429).mockResolvedValueOnce(mockResponse())

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
    mockCreate.mockRejectedValueOnce(networkErr).mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('throws after max retry attempts exhausted', async () => {
    const error500 = Object.assign(new Error('Internal Server Error'), { status: 500 })
    mockCreate.mockRejectedValueOnce(error500).mockRejectedValueOnce(error500)

    await expect(adapter.query('test')).rejects.toThrow('Internal Server Error')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  }, 10000)

  it('retries on 429 with Retry-After "0" (skips wait, uses default delay)', async () => {
    const error429 = Object.assign(new Error('Rate limited'), {
      status: 429,
      headers: { 'retry-after': '0' },
    })
    mockCreate.mockRejectedValueOnce(error429).mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('retries on 429 with non-numeric Retry-After', async () => {
    const error429 = Object.assign(new Error('Rate limited'), {
      status: 429,
      headers: { 'retry-after': 'abc' },
    })
    mockCreate.mockRejectedValueOnce(error429).mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('retries on ECONNREFUSED network error', async () => {
    const networkErr = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' })
    mockCreate.mockRejectedValueOnce(networkErr).mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('retries on ETIMEDOUT network error', async () => {
    const networkErr = Object.assign(new Error('connection timed out'), { code: 'ETIMEDOUT' })
    mockCreate.mockRejectedValueOnce(networkErr).mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 10000)

  it('does not retry on AbortError', async () => {
    const abortErr = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    mockCreate.mockRejectedValueOnce(abortErr)

    await expect(adapter.query('test')).rejects.toThrow('The operation was aborted')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('does not retry on unknown errors without status or code', async () => {
    const genericErr = new Error('something wrong')
    mockCreate.mockRejectedValueOnce(genericErr)

    await expect(adapter.query('test')).rejects.toThrow('something wrong')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 with Retry-After at 10 (boundary — allowed)', async () => {
    const error429 = Object.assign(new Error('Rate limited'), {
      status: 429,
      headers: { 'retry-after': '10' },
    })
    mockCreate.mockRejectedValueOnce(error429).mockResolvedValueOnce(mockResponse())

    const result = await adapter.query('test')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('Test response')
  }, 15000)

  it('does not retry on 429 with Retry-After at 11 (boundary — rejected)', async () => {
    const error429 = Object.assign(new Error('Rate limited'), {
      status: 429,
      headers: { 'retry-after': '11' },
    })
    mockCreate.mockRejectedValueOnce(error429)

    await expect(adapter.query('test')).rejects.toThrow('Rate limited')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
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

  it('GrokParseError message does not leak raw response content', () => {
    try {
      parseGrokJson('definitely not json {broken')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(GrokParseError)
      expect((err as GrokParseError).message).toContain('Failed to parse Grok JSON')
      expect((err as GrokParseError).message).not.toContain('definitely not json')
    }
  })

  it('handles nested braces correctly', () => {
    const raw = '{"outer": {"inner": [1, 2]}}'
    const result = parseGrokJson<{ outer: { inner: number[] } }>(raw)
    expect(result.outer.inner).toEqual([1, 2])
  })

  it('parses JSON with unicode characters', () => {
    const result = parseGrokJson<{ emoji: string; name: string }>('{"emoji": "🚀", "name": "café"}')
    expect(result).toEqual({ emoji: '🚀', name: 'café' })
  })

  it('handles multiple JSON-like objects, takes first', () => {
    const raw = 'Here: {"a": 1} and {"b": 2}'
    expect(() => parseGrokJson(raw)).toThrow(GrokParseError)
  })

  it('matches closing brace to opening brace, ignoring trailing brackets (bug 4)', () => {
    // Old code used lastIndexOf('}') OR lastIndexOf(']') regardless of what opened.
    // With opening '{', it would find the last ']' from the trailing array and try to
    // parse '{"key":"value"} trailing [1,2,3]' which is invalid.
    // Fixed code matches '{' to '}' and '[' to ']'.
    const result = parseGrokJson<{ key: string }>('{"key":"value"} trailing [1,2,3]')
    expect(result).toEqual({ key: 'value' })
  })

  it('matches closing bracket to opening bracket, ignoring trailing braces (bug 4)', () => {
    const result = parseGrokJson<number[]>('[1,2,3] and then {"extra":"data"}')
    expect(result).toEqual([1, 2, 3])
  })

  it('handles object with trailing array on same line (bug 4)', () => {
    const raw = 'Response: {"signals": ["bull"]} see also [more, data]'
    const result = parseGrokJson<{ signals: string[] }>(raw)
    expect(result).toEqual({ signals: ['bull'] })
  })

  it('handles array at top level with preamble', () => {
    const raw = 'Result:\n[{"id": 1}, {"id": 2}]'
    const result = parseGrokJson<{ id: number }[]>(raw)
    expect(result).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('throws on only opening brace', () => {
    const raw = 'text { more text'
    expect(() => parseGrokJson(raw)).toThrow(GrokParseError)
  })

  it('handles empty markdown fences', () => {
    const raw = '```json\n\n```'
    expect(() => parseGrokJson(raw)).toThrow(GrokParseError)
  })

  it('handles JSON with trailing comma (invalid JSON)', () => {
    const raw = '{"a": 1,}'
    expect(() => parseGrokJson(raw)).toThrow(GrokParseError)
  })

  it('GrokParseError message contains syntax error detail only', () => {
    try {
      parseGrokJson('preamble {"bad": }')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(GrokParseError)
      const msg = (err as GrokParseError).message
      expect(msg).toContain('Failed to parse Grok JSON')
      expect(msg).not.toContain('preamble')
    }
  })
})

describe('MODEL_PRICING', () => {
  it('has grok-4-fast-reasoning', () => {
    expect(MODEL_PRICING['grok-4-fast-reasoning']).toEqual({ input: 0.2, output: 0.5 })
  })

  it('has grok-4-fast-non-reasoning', () => {
    expect(MODEL_PRICING['grok-4-fast-non-reasoning']).toEqual({ input: 0.2, output: 0.5 })
  })

  it('has grok-3-mini', () => {
    expect(MODEL_PRICING['grok-3-mini']).toEqual({ input: 0.3, output: 0.5 })
  })

  it('has grok-3', () => {
    expect(MODEL_PRICING['grok-3']).toEqual({ input: 3.0, output: 15.0 })
  })

  it('has grok-4-0709', () => {
    expect(MODEL_PRICING['grok-4-0709']).toEqual({ input: 3.0, output: 15.0 })
  })

  it('does not have stale grok-4 entry', () => {
    expect(MODEL_PRICING['grok-4']).toBeUndefined()
  })
})

describe('structured output', () => {
  let adapter: GrokAdapter

  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(mockResponse())
    adapter = new GrokAdapter('xai-test-key')
  })

  it('adds text.format when responseSchema provided and model is grok-4 family', async () => {
    const schema = z.object({ signals: z.array(z.string()) })
    mockCreate.mockResolvedValue(
      mockResponse({
        output_text: '{"signals":["test"]}',
      }),
    )

    const result = await adapter.query('test', {
      responseSchema: schema,
    })

    const args = mockCreate.mock.calls[0][0]
    expect(args.text).toBeDefined()
    expect(args.text.format).toBeDefined()
    expect(result.text).toBe('{"signals":["test"]}')
  })

  it('includes both text.format and tools when both provided', async () => {
    const schema = z.object({ signals: z.array(z.string()) })
    mockCreate.mockResolvedValue(
      mockResponse({
        output_text: '{"signals":["test"]}',
      }),
    )

    await adapter.query('test', {
      responseSchema: schema,
      enableXSearch: true,
      enableWebSearch: true,
    })

    const args = mockCreate.mock.calls[0][0]
    expect(args.text).toBeDefined()
    expect(args.text.format).toBeDefined()
    expect(args.tools).toHaveLength(2)
    expect(args.tools.map((t: { type: string }) => t.type).sort()).toEqual(['web_search', 'x_search'])
  })

  it('does not add text.format for non-grok-4 model', async () => {
    const schema = z.object({ signals: z.array(z.string()) })
    mockCreate.mockResolvedValue(
      mockResponse({
        output_text: '{"signals":["test"]}',
      }),
    )

    await adapter.query('test', {
      model: 'grok-3-mini',
      responseSchema: schema,
    })

    const args = mockCreate.mock.calls[0][0]
    expect(args.text).toBeUndefined()
  })

  it('does not add text.format when no schema provided', async () => {
    await adapter.query('test')
    const args = mockCreate.mock.calls[0][0]
    expect(args.text).toBeUndefined()
  })
})

describe('excluded_x_handles', () => {
  let adapter: GrokAdapter

  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(mockResponse())
    adapter = new GrokAdapter('xai-test-key')
  })

  it('adds excluded_x_handles to x_search tool config', async () => {
    await adapter.query('test', {
      enableXSearch: true,
      xSearchExcludeHandles: ['bot1', 'bot2'],
    })
    const args = mockCreate.mock.calls[0][0]
    const xTool = args.tools[0]
    expect(xTool.excluded_x_handles).toEqual(['bot1', 'bot2'])
  })

  it('throws when both xSearchHandles and xSearchExcludeHandles provided', async () => {
    await expect(
      adapter.query('test', {
        enableXSearch: true,
        xSearchHandles: ['alice'],
        xSearchExcludeHandles: ['bot1'],
      }),
    ).rejects.toThrow('mutually exclusive')
  })

  it('throws mutual exclusion even when search flags are off', async () => {
    await expect(
      adapter.query('test', {
        xSearchHandles: ['alice'],
        xSearchExcludeHandles: ['bot1'],
      }),
    ).rejects.toThrow('mutually exclusive')
  })

  it('does not add excluded_x_handles when not provided', async () => {
    await adapter.query('test', { enableXSearch: true })
    const args = mockCreate.mock.calls[0][0]
    const xTool = args.tools[0]
    expect(xTool.excluded_x_handles).toBeUndefined()
  })
})

describe('citations', () => {
  let adapter: GrokAdapter

  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(mockResponse())
    adapter = new GrokAdapter('xai-test-key')
  })

  it('extracts citations from response', async () => {
    mockCreate.mockResolvedValue(
      mockResponse({
        citations: [
          { url: 'https://x.com/user/status/123', title: 'A tweet' },
          { url: 'https://example.com/article', title: 'An article' },
        ],
      }),
    )

    const result = await adapter.query('test', { enableXSearch: true })
    expect(result.citations).toHaveLength(2)
    expect(result.citations[0]).toEqual({
      type: 'citation',
      url: 'https://x.com/user/status/123',
      title: 'A tweet',
    })
  })

  it('deduplicates citations by URL', async () => {
    mockCreate.mockResolvedValue(
      mockResponse({
        citations: [
          { url: 'https://x.com/same', title: 'A' },
          { url: 'https://x.com/same', title: 'B' },
        ],
      }),
    )

    const result = await adapter.query('test')
    expect(result.citations).toHaveLength(1)
  })

  it('returns empty citations when none present', async () => {
    const result = await adapter.query('test')
    expect(result.citations).toEqual([])
  })
})

describe('queryStream', () => {
  let adapter: GrokAdapter

  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(mockResponse())
    adapter = new GrokAdapter('xai-test-key')
  })

  it('calls onChunk for each delta', async () => {
    const events = [
      { type: 'response.output_text.delta', delta: 'Hello' },
      { type: 'response.output_text.delta', delta: ' world' },
      { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 }, output: [] } },
    ]
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) yield event
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    const received: string[] = []
    const result = await adapter.queryStream('test', {}, (text) => received.push(text))

    expect(received).toEqual(['Hello', ' world'])
    expect(result.text).toBe('Hello world')
    expect(result.usage.inputTokens).toBe(10)
    expect(result.usage.outputTokens).toBe(5)
  })

  it('passes stream: true to create()', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 }, output: [] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    await adapter.queryStream('test', {}, () => {})
    const args = mockCreate.mock.calls[0][0]
    expect(args.stream).toBe(true)
  })

  it('counts tool calls from response.completed output', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.output_text.delta', delta: 'hi' }
        yield { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 }, output: [{ type: 'tool_call', id: 'call_1', name: 'x_search' }] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    const result = await adapter.queryStream('test', { enableXSearch: true }, () => {})
    expect(result.usage.toolCalls).toBe(1)
    expect(result.usage.costUsd).toBeGreaterThan(0.005)
  })

  it('estimates tokens from text length when usage not provided', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.output_text.delta', delta: 'hello world' }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    const result = await adapter.queryStream('test', {}, () => {})
    expect(result.usage.inputTokens).toBe(0)
    expect(result.usage.outputTokens).toBe(Math.ceil('hello world'.length / 4))
  })

  it('returns empty citations', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.output_text.delta', delta: 'hi' }
        yield { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 2 }, output: [] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    const result = await adapter.queryStream('test', {}, () => {})
    expect(result.citations).toEqual([])
  })

  it('throws on mutual exclusion of xSearchHandles and xSearchExcludeHandles', async () => {
    await expect(
      adapter.queryStream(
        'test',
        {
          enableXSearch: true,
          xSearchHandles: ['alice'],
          xSearchExcludeHandles: ['bot1'],
        },
        () => {},
      ),
    ).rejects.toThrow('mutually exclusive')
  })

  it('passes x_search and web_search tools when both search options set', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.output_text.delta', delta: 'hi' }
        yield { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 2 }, output: [] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    await adapter.queryStream('test', { enableXSearch: true, enableWebSearch: true }, () => {})
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(2)
    expect(args.tools.map((t: { type: string }) => t.type).sort()).toEqual(['web_search', 'x_search'])
  })

  it('counts multiple tool calls from response.completed output', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.output_text.delta', delta: 'hi' }
        yield { type: 'response.completed', response: { usage: { input_tokens: 100, output_tokens: 50 }, output: [{ type: 'tool_call', id: 'call_1', name: 'x_search' }, { type: 'tool_call', id: 'call_2', name: 'x_search' }] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    const result = await adapter.queryStream('test', { enableXSearch: true, enableWebSearch: true }, () => {})
    expect(result.usage.toolCalls).toBe(2)
    const tokenCost = (100 * 0.2 + 50 * 0.5) / 1_000_000
    expect(result.usage.costUsd).toBeCloseTo(tokenCost + 0.01, 10) // 2 * $0.005
  })

  it('passes system prompt and custom model to create()', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 2 }, output: [] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    await adapter.queryStream('prompt', { systemPrompt: 'You are Corvus.', model: 'grok-3', maxTokens: 512 }, () => {})
    const args = mockCreate.mock.calls[0][0]
    expect(args.model).toBe('grok-3')
    expect(args.max_output_tokens).toBe(512)
    expect(args.input[0]).toEqual({ role: 'system', content: 'You are Corvus.' })
    expect(args.input[1]).toEqual({ role: 'user', content: 'prompt' })
  })

  it('handles stream with no content deltas', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 0 }, output: [] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    const received: string[] = []
    const result = await adapter.queryStream('test', {}, (text) => received.push(text))
    expect(received).toEqual([])
    expect(result.text).toBe('')
    expect(result.usage.outputTokens).toBe(0)
  })

  it('counts tool_call items in response.completed output', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 }, output: [{ type: 'tool_call', id: 'call_1', name: 'x_search' }, { type: 'tool_call', id: 'call_2', name: 'x_search' }] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    const result = await adapter.queryStream('test', { enableXSearch: true }, () => {})
    expect(result.usage.toolCalls).toBe(2)
  })

  it('uses last response.completed event for usage', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.output_text.delta', delta: 'a' }
        yield { type: 'response.output_text.delta', delta: 'b' }
        yield { type: 'response.completed', response: { usage: { input_tokens: 200, output_tokens: 100 }, output: [] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    const result = await adapter.queryStream('test', {}, () => {})
    expect(result.usage.inputTokens).toBe(200)
    expect(result.usage.outputTokens).toBe(100)
  })

  it('passes web_search tool with enableWebSearch only', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.output_text.delta', delta: 'ok' }
        yield { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 2 }, output: [] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    await adapter.queryStream('test', { enableWebSearch: true }, () => {})
    const args = mockCreate.mock.calls[0][0]
    expect(args.tools).toHaveLength(1)
    expect(args.tools[0]).toEqual({ type: 'web_search' })
  })

  it('omits tools when no search flags set in stream', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.output_text.delta', delta: 'ok' }
        yield { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 2 }, output: [] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    await adapter.queryStream('test', {}, () => {})
    expect(mockCreate.mock.calls[0][0].tools).toBeUndefined()
  })

  it('handles event with unknown type gracefully', async () => {
    const asyncIterator = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'response.unknown_event' }
        yield { type: 'response.output_text.delta', delta: 'ok' }
        yield { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 2 }, output: [] } }
      },
    }
    mockCreate.mockResolvedValue(asyncIterator)

    const result = await adapter.queryStream('test', {}, () => {})
    expect(result.text).toBe('ok')
  })
})

describe('citations edge cases', () => {
  let adapter: GrokAdapter

  beforeEach(() => {
    mockCreate.mockReset()
    adapter = new GrokAdapter('xai-test-key')
  })

  it('skips citations without valid url', async () => {
    mockCreate.mockResolvedValue(
      mockResponse({
        citations: [
          {},
          { url: null },
          42,
        ],
      }),
    )

    const result = await adapter.query('test')
    expect(result.citations).toEqual([])
  })

  it('preserves title as undefined when missing', async () => {
    mockCreate.mockResolvedValue(
      mockResponse({
        citations: [
          { url: 'https://x.com/foo' },
        ],
      }),
    )

    const result = await adapter.query('test')
    expect(result.citations).toHaveLength(1)
    expect(result.citations[0].title).toBeUndefined()
  })

  it('handles single citation', async () => {
    mockCreate.mockResolvedValue(
      mockResponse({
        citations: [
          { url: 'https://x.com/only', title: 'Only' },
        ],
      }),
    )

    const result = await adapter.query('test')
    expect(result.citations).toEqual([
      { type: 'citation', url: 'https://x.com/only', title: 'Only' },
    ])
  })
})
