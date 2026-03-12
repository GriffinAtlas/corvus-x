import type { GrokCitation } from './types.js'

// ── Grok JSON response shapes ──

export interface GrokTweetScore {
  index: number
  sentiment: number // -1.0 to 1.0
  narrative: string // theme label matching a narrative entry
}

export interface GrokNarrative {
  theme: string
  description: string
}

export interface GrokScanResponse {
  tweetAnalysis: GrokTweetScore[]
  narratives: GrokNarrative[]
  signals: string[]
}

export interface GrokPulseResponse {
  tweetAnalysis: GrokTweetScore[]
  bullSignals: string[]
  bearSignals: string[]
}

export interface GrokTraceResponse {
  tweetAnalysis: GrokTweetScore[]
  originIndex: number | null
  phases: {
    name: string
    tweetIndices: number[]
    timeframe: string
  }[]
  mutations: {
    original: string
    variant: string
  }[]
}

export interface GrokGatherResponse {
  tweetAnalysis: GrokTweetScore[]
  narratives: GrokNarrative[]
  signals: string[]
  webContext: string[]
  outlook: string
}

export interface GrokReadResponse {
  analysis: string
  significance: 'high' | 'medium' | 'low'
  signals: string[]
}

export interface GrokScopeResponse {
  contentPatterns: string[]
  recentFocus: string[]
  networkPosition: string
  influence: 'high' | 'medium' | 'low'
  signalValue: 'high' | 'medium' | 'low'
}

// ── Computed snapshot shapes ──

export interface AccountEntry {
  handle: string
  postCount: number
  followers: number
  avgSentiment: number
  engagementScore?: number
}

export interface NarrativeEntry {
  theme: string
  description: string
  tweetCount: number
  avgSentiment: number
}

export interface SentimentBreakdown {
  avg: number
  rawAvg?: number
  positive: number
  neutral: number
  negative: number
}

export interface BaseMetrics {
  tweetCount: number
  totalEngagement: number
  uniqueAuthors: number
  engagementPerTweet: number
}

export interface ScanSnapshot {
  metrics: BaseMetrics
  sentiment: SentimentBreakdown
  topAccounts: AccountEntry[]
  narratives: NarrativeEntry[]
  signals: string[]
}

export interface PulseSnapshot {
  metrics: BaseMetrics
  sentiment: SentimentBreakdown
  bullSignals: string[]
  bearSignals: string[]
  keyVoices: {
    handle: string
    sentiment: number
    reach: number
  }[]
}

export interface TraceSnapshot {
  metrics: BaseMetrics
  origin: {
    account: string
    date: string
    tweetId: string
    content: string
  } | null
  timeline: {
    phase: string
    tweetCount: number
    keyAmplifiers: string[]
    timeframe: string
  }[]
  mutations: {
    original: string
    variant: string
  }[]
  reach: {
    totalTweets: number
    totalEngagement: number
    uniqueAuthors: number
  }
}

export interface GatherSnapshot {
  metrics: BaseMetrics
  sentiment: SentimentBreakdown
  topPosts: {
    id: string
    author: string
    text: string
    engagement: number
  }[]
  narratives: NarrativeEntry[]
  webContext: string[]
  outlook: string
}

export interface ReadSnapshot {
  tweet: {
    id: string
    author: string
    text: string
    engagement: { likes: number; retweets: number; replies: number; impressions: number }
    postedAt: string
  }
  analysis: string
  significance: 'high' | 'medium' | 'low'
  signals: string[]
}

export interface ScopeSnapshot {
  account: {
    handle: string
    followers: number
    following: number
    tweetCount: number
  }
  recentActivity: {
    avgEngagement: number
    postsAnalyzed: number
    topTweet: { id: string; text: string; engagement: number } | null
  }
  contentPatterns: string[]
  recentFocus: string[]
  networkPosition: string
  influence: 'high' | 'medium' | 'low'
  signalValue: 'high' | 'medium' | 'low'
}

// ── Agent output shapes ──

export interface ConfidenceScore {
  overall: number
  volume: 'low' | 'moderate' | 'high'
  consistency: number
  diversity: number
}

export interface BriefAccount {
  handle: string
  reach: number
  sentiment: number
  stance: string
}

export interface BriefEvidence {
  source: string
  key: string
  detail: string
}

export interface AgentBrief {
  signalLine: string
  sentiment: number
  summary: string[]
  contradictions: string[]
  keyAccounts: BriefAccount[]
  evidence: BriefEvidence[]
  confidence: ConfidenceScore
  sampleSize: number
  staleness: number | null
  citations: GrokCitation[]
}

export type Snapshot =
  | ScanSnapshot
  | PulseSnapshot
  | TraceSnapshot
  | GatherSnapshot
  | ReadSnapshot
  | ScopeSnapshot
  | AgentBrief

// ── Stored snapshot wrapper ──

export interface StoredSnapshot<T extends Snapshot = Snapshot> {
  command: string
  topic: string
  data: T
  raw: string
  timestamp: number
  cost: number
  tweets?: import('./x-adapter.js').Tweet[]
  scores?: GrokTweetScore[]
  citations?: GrokCitation[]
}

// ── Diff match keys ──

export type MatchKeys = Record<string, string>

export const SCAN_MATCH_KEYS: MatchKeys = {
  topAccounts: 'handle',
  narratives: 'theme',
}

export const PULSE_MATCH_KEYS: MatchKeys = {
  keyVoices: 'handle',
}

export const TRACE_MATCH_KEYS: MatchKeys = {
  timeline: 'phase',
}

export const GATHER_MATCH_KEYS: MatchKeys = {
  topPosts: 'id',
  narratives: 'theme',
}

export const AGENT_MATCH_KEYS: MatchKeys = {
  keyAccounts: 'handle',
  evidence: 'source',
}
