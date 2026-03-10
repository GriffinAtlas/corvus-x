import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrokAdapter } from '../../src/core/grok-adapter.js'

vi.mock('openai', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Test response about AI agents' } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  })

  return {
    default: class MockOpenAI {
      chat = { completions: { create: mockCreate } }
      constructor(_opts: Record<string, unknown>) {}
    },
  }
})

describe('GrokAdapter', () => {
  let adapter: GrokAdapter

  beforeEach(() => {
    adapter = new GrokAdapter('xai-test-key')
  })

  it('sends query and returns structured response', async () => {
    const result = await adapter.query('What are devs saying about AI agents?')
    expect(result.text).toBe('Test response about AI agents')
    expect(result.usage.inputTokens).toBe(100)
    expect(result.usage.outputTokens).toBe(50)
  })

  it('calculates cost correctly for grok-4-1-fast', async () => {
    const result = await adapter.query('test query')
    // grok-4-1-fast: $0.20/M input, $0.50/M output
    // 100 input = $0.00002, 50 output = $0.000025
    expect(result.usage.costUsd).toBeCloseTo(0.000045, 6)
  })

  it('returns empty string when no content in response', async () => {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({})
    const mock = client.chat.completions.create as ReturnType<typeof vi.fn>
    mock.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 0 },
    })

    const result = await adapter.query('empty test')
    expect(result.text).toBe('')
  })
})
