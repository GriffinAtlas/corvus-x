import type { Snapshot, GrokTweetScore } from './schemas.js'
import type { DiffLine } from './differ.js'
import type { Tweet } from './x-adapter.js'

export interface GrokResponse {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
    costUsd: number
    toolCalls: number
  }
}

export interface QueryOptions {
  model?: string
  enableXSearch?: boolean
  enableWebSearch?: boolean
  systemPrompt?: string
  maxTokens?: number
  xSearchFromDate?: string
  xSearchToDate?: string
  xSearchHandles?: string[]
}

export interface CommandResult {
  command: string
  query: string
  response: string
  cost: number
  cached: boolean
  timestamp: number
}

export interface StructuredCommandResult<T extends Snapshot = Snapshot> {
  command: string
  topic: string
  data: T
  cost: number
  timestamp: number
  diff: DiffLine[]
  timeSinceLast: number
}

export interface BuildResult<T extends Snapshot> {
  data: T
  raw: string
  cost: number
  tweets: Tweet[]
  scores: GrokTweetScore[]
  newestTweetAt: number | null
}
