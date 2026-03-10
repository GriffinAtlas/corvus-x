export interface GrokResponse {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
}

export interface QueryOptions {
  model?: string
  enableXSearch?: boolean
  enableWebSearch?: boolean
  systemPrompt?: string
  maxTokens?: number
}

export interface CommandResult {
  command: string
  query: string
  response: string
  cost: number
  cached: boolean
  timestamp: number
}
