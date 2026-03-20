import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
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

const TIMEOUT_MS = 60_000
const RETRY_DELAY_MS = 2_000
const MAX_ATTEMPTS = 2
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503])
const TRANSIENT_NETWORK_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'])

export class GrokParseError extends Error {
  constructor(raw: string, cleaned: string, cause: SyntaxError) {
    super(`Failed to parse Grok JSON: ${cause.message}`)
    this.name = 'GrokParseError'
    const rawPreview = raw.length > 300 ? raw.slice(0, 300) + '...' : raw
    const cleanedPreview = cleaned.length > 300 ? cleaned.slice(0, 300) + '...' : cleaned
    console.error(`[GrokParseError] Raw (first 300): ${rawPreview}`)
    console.error(`[GrokParseError] Cleaned (first 300): ${cleanedPreview}`)
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

  const openChar = cleaned[start]
  const end = openChar === '{' ? cleaned.lastIndexOf('}') : cleaned.lastIndexOf(']')

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

const isGrok4Family = (model: string) => model.startsWith('grok-4')

export class GrokAdapter {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    })
  }

  private buildInput(prompt: string, options: QueryOptions): { role: string; content: string }[] {
    const input: { role: string; content: string }[] = []
    if (options.systemPrompt) input.push({ role: 'system', content: options.systemPrompt })
    input.push({ role: 'user', content: prompt })
    return input
  }

  private buildTools(options: QueryOptions): Record<string, unknown>[] {
    if (options.xSearchHandles?.length && options.xSearchExcludeHandles?.length) {
      throw new Error('Cannot use both xSearchHandles and xSearchExcludeHandles — they are mutually exclusive')
    }

    if (!options.enableXSearch && !options.enableWebSearch) return []

    const tools: Record<string, unknown>[] = []

    if (options.enableXSearch) {
      const xTool: Record<string, unknown> = { type: 'x_search' }
      if (options.xSearchFromDate) xTool.from_date = options.xSearchFromDate
      if (options.xSearchToDate) xTool.to_date = options.xSearchToDate
      if (options.xSearchHandles?.length) xTool.x_handles = options.xSearchHandles
      if (options.xSearchExcludeHandles?.length) xTool.excluded_x_handles = options.xSearchExcludeHandles
      tools.push(xTool)
    }

    if (options.enableWebSearch) {
      tools.push({ type: 'web_search' })
    }

    return tools
  }

  private computeCost(model: string, inputTokens: number, outputTokens: number, toolCallCount: number): number {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL]
    const tokenCost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
    return tokenCost + toolCallCount * TOOL_COST_PER_CALL
  }

  async query(prompt: string, options: QueryOptions = {}): Promise<GrokResponse> {
    const model = options.model ?? DEFAULT_MODEL
    const input = this.buildInput(prompt, options)
    const tools = this.buildTools(options)

    const createParams: Record<string, unknown> = {
      model,
      input,
      max_output_tokens: options.maxTokens ?? 2048,
      ...(tools.length > 0 ? { tools } : {}),
      ...(options.responseSchema && isGrok4Family(model)
        ? (() => {
            const fmt = zodResponseFormat(options.responseSchema, 'response')
            return { text: { format: { type: 'json_schema', name: fmt.json_schema.name, schema: fmt.json_schema.schema, strict: true } } }
          })()
        : {}),
    }

    let lastError: unknown

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: any = await (this.client as any).responses.create(createParams, {
          signal: controller.signal,
        })

        clearTimeout(timer)

        const text = response.output_text ?? ''
        const inputTokens = response.usage?.input_tokens ?? 0
        const outputTokens = response.usage?.output_tokens ?? 0
        const toolCallCount = response.output?.filter((o: { type: string }) => o.type === 'tool_call')?.length ?? 0
        const costUsd = this.computeCost(model, inputTokens, outputTokens, toolCallCount)

        const seenUrls = new Set<string>()
        const citations: GrokCitation[] = []
        for (const c of response.citations ?? []) {
          const url = c.url ?? c
          if (typeof url === 'string' && !seenUrls.has(url)) {
            seenUrls.add(url)
            citations.push({ type: 'citation', url, title: c.title })
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
    const input = this.buildInput(prompt, options)
    const tools = this.buildTools(options)

    const createParams: Record<string, unknown> = {
      model,
      input,
      max_output_tokens: options.maxTokens ?? 2048,
      stream: true,
      ...(tools.length > 0 ? { tools } : {}),
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream: any = await (this.client as any).responses.create({
      ...createParams,
      signal: controller.signal,
    })

    let text = ''
    let inputTokens = 0
    let outputTokens = 0
    let toolCallCount = 0

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta' && event.delta) {
        text += event.delta
        onChunk(event.delta)
      }
      if (event.type === 'response.completed' && event.response) {
        inputTokens = event.response.usage?.input_tokens ?? 0
        outputTokens = event.response.usage?.output_tokens ?? 0
        toolCallCount = event.response.output?.filter((o: { type: string }) => o.type === 'tool_call')?.length ?? 0
      }
    }

    clearTimeout(timer)

    if (inputTokens === 0 && outputTokens === 0) {
      outputTokens = Math.ceil(text.length / 4)
    }

    const costUsd = this.computeCost(model, inputTokens, outputTokens, toolCallCount)

    return {
      text,
      usage: { inputTokens, outputTokens, costUsd, toolCalls: toolCallCount },
      citations: [],
    }
  }
}
