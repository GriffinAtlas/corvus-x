import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import type { ZodType } from 'zod/v4'
import type { GrokResponse, GrokCitation, QueryOptions } from './types.js'

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Fast tier
  'grok-4-1-fast': { input: 0.2, output: 0.5 },
  'grok-4-1-fast-reasoning': { input: 0.2, output: 0.5 },
  'grok-4-1-fast-non-reasoning': { input: 0.2, output: 0.5 },
  'grok-4-fast-reasoning': { input: 0.2, output: 0.5 },
  'grok-4-fast-non-reasoning': { input: 0.2, output: 0.5 },
  'grok-code-fast-1': { input: 0.2, output: 1.5 },
  'grok-3-mini': { input: 0.3, output: 0.5 },
  // Premium tier
  'grok-4.20-beta-0309-reasoning': { input: 2.0, output: 6.0 },
  'grok-4.20-beta-0309-non-reasoning': { input: 2.0, output: 6.0 },
  'grok-4.20-multi-agent-beta-0309': { input: 2.0, output: 6.0 },
  'grok-3': { input: 3.0, output: 15.0 },
  'grok-4-0709': { input: 3.0, output: 15.0 },
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

export function parseGrokJson<T>(raw: string, schema?: ZodType): T {
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

  const openChar = cleaned[start]
  const end = openChar === '{' ? cleaned.lastIndexOf('}') : cleaned.lastIndexOf(']')

  if (end < start) {
    throw new GrokParseError(raw, cleaned, new SyntaxError('No closing brace/bracket found'))
  }

  cleaned = cleaned.slice(start, end + 1)

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    throw new GrokParseError(raw, cleaned, err as SyntaxError)
  }

  if (schema) {
    return schema.parse(parsed) as T
  }
  return parsed as T
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

const isGrok4Family = (model: string) => model.startsWith('grok-4')

export class GrokAdapter {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    })
  }

  private buildMessages(prompt: string, options: QueryOptions): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt })
    messages.push({ role: 'user', content: prompt })
    return messages
  }

  private buildTools(options: QueryOptions): OpenAI.Chat.Completions.ChatCompletionTool[] {
    if (options.xSearchHandles?.length && options.xSearchExcludeHandles?.length) {
      throw new Error('Cannot use both xSearchHandles and xSearchExcludeHandles — they are mutually exclusive')
    }

    if (!options.enableXSearch && !options.enableWebSearch) return []

    const tool: Record<string, unknown> = { type: 'live_search' }
    if (options.enableXSearch) {
      if (options.xSearchFromDate) tool.from_date = options.xSearchFromDate
      if (options.xSearchToDate) tool.to_date = options.xSearchToDate
      if (options.xSearchHandles?.length) tool.allowed_x_handles = options.xSearchHandles
      if (options.xSearchExcludeHandles?.length) tool.excluded_x_handles = options.xSearchExcludeHandles
    }
    return [tool] as unknown as OpenAI.Chat.Completions.ChatCompletionTool[]
  }

  private computeCost(model: string, inputTokens: number, outputTokens: number, toolCallCount: number): number {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL]
    const tokenCost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
    return tokenCost + toolCallCount * TOOL_COST_PER_CALL
  }

  async query(prompt: string, options: QueryOptions = {}): Promise<GrokResponse> {
    const model = options.model ?? DEFAULT_MODEL
    const messages = this.buildMessages(prompt, options)
    const tools = this.buildTools(options)

    const createParams = {
      model,
      messages,
      max_tokens: options.maxTokens ?? 2048,
      ...(tools.length > 0 ? { tools } : {}),
      ...(options.responseSchema && isGrok4Family(model)
        ? { response_format: zodResponseFormat(options.responseSchema, 'response') }
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
        const costUsd = this.computeCost(model, inputTokens, outputTokens, toolCallCount)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const annotations: any[] = (response.choices[0]?.message as any)?.annotations ?? []
        const seenUrls = new Set<string>()
        const citations: GrokCitation[] = []
        for (const a of annotations) {
          const url = a.url_citation?.url
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url)
            citations.push({ type: a.type, url, title: a.url_citation?.title })
          }
        }

        return { text, usage: { inputTokens, outputTokens, costUsd, toolCalls: toolCallCount }, citations }
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

    throw lastError ?? new Error('Grok query: max retry attempts exhausted')
  }

  async queryStream(
    prompt: string,
    options: QueryOptions = {},
    onChunk: (text: string) => void,
  ): Promise<GrokResponse> {
    const model = options.model ?? DEFAULT_MODEL
    const messages = this.buildMessages(prompt, options)
    const tools = this.buildTools(options)

    const createParams = {
      model,
      messages,
      max_tokens: options.maxTokens ?? 2048,
      stream: true as const,
      stream_options: { include_usage: true },
      ...(tools.length > 0 ? { tools } : {}),
    }

    const stream = await this.client.chat.completions.create(createParams)

    let text = ''
    let inputTokens = 0
    let outputTokens = 0
    const toolCallIndices = new Set<number>()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of stream as any) {
      const delta = chunk.choices?.[0]?.delta
      if (delta?.content) {
        text += delta.content
        onChunk(delta.content)
      }
      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          if (typeof tc.index === 'number') toolCallIndices.add(tc.index)
        }
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0
        outputTokens = chunk.usage.completion_tokens ?? 0
      }
    }

    if (inputTokens === 0 && outputTokens === 0) {
      outputTokens = Math.ceil(text.length / 4)
    }

    const toolCallCount = toolCallIndices.size
    const costUsd = this.computeCost(model, inputTokens, outputTokens, toolCallCount)

    return {
      text,
      usage: { inputTokens, outputTokens, costUsd, toolCalls: toolCallCount },
      citations: [],
    }
  }
}
