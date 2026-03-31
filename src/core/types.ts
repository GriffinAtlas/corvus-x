import type { Snapshot, GrokTweetScore } from './schemas.js'
import type { DiffLine } from './differ.js'
import type { Tweet, XAdapter } from './x-adapter.js'
import type { GrokAdapter } from './grok-adapter.js'
import type { ZodType } from 'zod/v4'

export interface CorvusDeps {
  grok: GrokAdapter
  x: XAdapter | null
}

export interface GrokCitation {
  type: string
  url: string
  title?: string
}

export interface GrokResponse {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
    costUsd: number
    toolCalls: number
  }
  citations: GrokCitation[]
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
  xSearchExcludeHandles?: string[]
  responseSchema?: ZodType
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
  citations: GrokCitation[]
}

export interface BuildResult<T extends Snapshot> {
  data: T
  raw: string
  cost: number
  inputTokens: number
  outputTokens: number
  toolCalls: number
  tweets: Tweet[]
  scores: GrokTweetScore[]
  newestTweetAt: number | null
  citations: GrokCitation[]
}
