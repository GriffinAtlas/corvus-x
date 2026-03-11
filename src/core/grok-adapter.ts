import OpenAI from 'openai'
import type { GrokResponse, QueryOptions } from './types.js'

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'grok-4-1-fast': { input: 0.2, output: 0.5 },
  'grok-4': { input: 3.0, output: 15.0 },
}

export const DEFAULT_MODEL = 'grok-4-1-fast'

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

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = []
    if (options.enableXSearch) {
      tools.push({
        type: 'function',
        function: { name: 'x_search', description: 'Search X posts', parameters: { type: 'object', properties: {} } },
      })
    }
    if (options.enableWebSearch) {
      tools.push({
        type: 'function',
        function: { name: 'web_search', description: 'Search the web', parameters: { type: 'object', properties: {} } },
      })
    }

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens ?? 2048,
      ...(tools.length > 0 ? { tools } : {}),
    })

    const text = response.choices[0]?.message?.content ?? ''
    const inputTokens = response.usage?.prompt_tokens ?? 0
    const outputTokens = response.usage?.completion_tokens ?? 0
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL]
    const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000

    return { text, usage: { inputTokens, outputTokens, costUsd } }
  }
}
