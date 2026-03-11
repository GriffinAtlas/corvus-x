import OpenAI from 'openai'
import type { GrokResponse, QueryOptions } from './types.js'

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'grok-4-1-fast': { input: 0.2, output: 0.5 },
  'grok-4-1-fast-reasoning': { input: 0.2, output: 0.5 },
  'grok-4-1-fast-non-reasoning': { input: 0.2, output: 0.5 },
  'grok-4.20-beta-0309-reasoning': { input: 2.0, output: 6.0 },
  'grok-4.20-beta-0309-non-reasoning': { input: 2.0, output: 6.0 },
  'grok-4.20-multi-agent-beta-0309': { input: 2.0, output: 6.0 },
  'grok-code-fast-1': { input: 0.2, output: 1.5 },
  'grok-4': { input: 2.0, output: 6.0 },
}

const TOOL_COST_PER_CALL = 0.005

export const DEFAULT_MODEL = 'grok-4-1-fast'

const TIMEOUT_MS = 30_000
const RETRY_DELAY_MS = 2_000
const MAX_ATTEMPTS = 2
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503])
const TRANSIENT_NETWORK_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'])

export class GrokParseError extends Error {
  rawPreview: string
  constructor(raw: string, cleaned: string, cause: SyntaxError) {
    const rawPreview = raw.length > 300 ? raw.slice(0, 300) + '...' : raw
    const cleanedPreview = cleaned.length > 300 ? cleaned.slice(0, 300) + '...' : cleaned
    super(
      `Failed to parse Grok JSON: ${cause.message}\n` +
        `Raw (first 300): ${rawPreview}\n` +
        `Cleaned (first 300): ${cleanedPreview}`,
    )
    this.name = 'GrokParseError'
    this.rawPreview = rawPreview
  }
}

export function parseGrokJson<T>(raw: string): T {
  let cleaned = raw.trim()

  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')

  const firstBrace = cleaned.indexOf('{')
  const firstBracket = cleaned.indexOf('[')
  let start = -1
  if (firstBrace >= 0 && firstBracket >= 0) start = Math.min(firstBrace, firstBracket)
  else if (firstBrace >= 0) start = firstBrace
  else if (firstBracket >= 0) start = firstBracket

  if (start < 0) {
    throw new GrokParseError(raw, cleaned, new SyntaxError('No JSON object or array found'))
  }

  const lastBrace = cleaned.lastIndexOf('}')
  const lastBracket = cleaned.lastIndexOf(']')
  const end = Math.max(lastBrace, lastBracket)

  if (end < start) {
    throw new GrokParseError(raw, cleaned, new SyntaxError('No closing brace/bracket found'))
  }

  cleaned = cleaned.slice(start, end + 1)

  try {
    return JSON.parse(cleaned) as T
  } catch (err) {
    throw new GrokParseError(raw, cleaned, err as SyntaxError)
  }
}

function isTransientError(err: unknown): { retry: boolean; retryAfter?: number } {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status
    if (status === 429) {
      let retryAfter: number | undefined
      if ('headers' in err && err.headers && typeof err.headers === 'object') {
        const headers = err.headers as Record<string, string>
        const ra = headers['retry-after']
        if (ra) {
          const seconds = parseInt(ra, 10)
          if (Number.isFinite(seconds) && seconds > 0) {
            if (seconds > 10) return { retry: false }
            retryAfter = seconds * 1000
          }
        }
      }
      return { retry: true, retryAfter }
    }
    if (TRANSIENT_STATUS_CODES.has(status)) return { retry: true }
    return { retry: false }
  }
  if (err instanceof Error && 'code' in err) {
    const code = (err as Error & { code: string }).code
    if (TRANSIENT_NETWORK_CODES.has(code)) return { retry: true }
  }
  if (err instanceof Error && err.name === 'AbortError') return { retry: false }
  return { retry: false }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class GrokAdapter {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    })
  }

  async query(prompt: string, options: QueryOptions = {}): Promise<GrokResponse> {
    const model = options.model ?? DEFAULT_MODEL

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt })
    messages.push({ role: 'user', content: prompt })

    const tools: unknown[] = []
    if (options.enableXSearch) {
      const tool: Record<string, unknown> = { type: 'x_search' }
      if (options.xSearchFromDate) tool.from_date = options.xSearchFromDate
      if (options.xSearchToDate) tool.to_date = options.xSearchToDate
      if (options.xSearchHandles?.length) tool.allowed_x_handles = options.xSearchHandles
      tools.push(tool)
    }
    if (options.enableWebSearch) {
      tools.push({ type: 'web_search' })
    }

    const createParams = {
      model,
      messages,
      max_tokens: options.maxTokens ?? 2048,
      ...(tools.length > 0
        ? { tools: tools as OpenAI.Chat.Completions.ChatCompletionTool[] }
        : {}),
    }

    let lastError: unknown

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      try {
        const response = await this.client.chat.completions.create(createParams, {
          signal: controller.signal,
        })

        clearTimeout(timer)

        const text = response.choices[0]?.message?.content ?? ''
        const inputTokens = response.usage?.prompt_tokens ?? 0
        const outputTokens = response.usage?.completion_tokens ?? 0
        const toolCallCount = response.choices[0]?.message?.tool_calls?.length ?? 0
        const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL]
        const tokenCost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
        const costUsd = tokenCost + toolCallCount * TOOL_COST_PER_CALL

        return { text, usage: { inputTokens, outputTokens, costUsd, toolCalls: toolCallCount } }
      } catch (err) {
        clearTimeout(timer)
        lastError = err

        if (attempt < MAX_ATTEMPTS - 1) {
          const { retry, retryAfter } = isTransientError(err)
          if (retry) {
            await delay(retryAfter ?? RETRY_DELAY_MS)
            continue
          }
        }

        throw err
      }
    }

    throw lastError
  }
}
