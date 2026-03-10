import OpenAI from 'openai'
import type { GrokResponse, QueryOptions } from './types.js'

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'grok-4-1-fast': { input: 0.2, output: 0.5 },
  'grok-4': { input: 3.0, output: 15.0 },
}

const DEFAULT_MODEL = 'grok-4-1-fast'

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

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }

    messages.push({ role: 'user', content: prompt })

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens ?? 2048,
    })

    const choice = response.choices[0]
    const text = choice?.message?.content ?? ''
    const usage = response.usage

    const inputTokens = usage?.prompt_tokens ?? 0
    const outputTokens = usage?.completion_tokens ?? 0
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL]
    const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000

    return {
      text,
      usage: { inputTokens, outputTokens, costUsd },
    }
  }

  async *stream(prompt: string, options: QueryOptions = {}): AsyncGenerator<string> {
    const model = options.model ?? DEFAULT_MODEL

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) yield content
    }
  }
}
