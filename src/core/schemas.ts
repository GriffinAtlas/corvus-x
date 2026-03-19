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

// ── Growth command snapshot shapes ──

export interface ProfileSnapshot {
  handle: string
  displayName: string
  followers: number
  following: number
  postFrequency: { postsPerWeek: number; activeDays: string[]; peakHours: number[] }
  contentMix: Array<{ category: string; percentage: number; avgEngagement: number }>
  topPerformers: Array<{ url: string; content: string; engagement: number; why: string }>
  voiceTraits: { tone: string; vocabulary: string; emojiUsage: string; avgLength: number }
  recommendations?: string[]
  sentiment: number
  fetchedAt: string
}

export interface DraftSnapshot {
  topic: string
  post: string
  thread?: string[]
  angles: string[]
  hashtags: string[]
  voiceProfileAge: number
  contextUsed: boolean
  replyTo?: string
  fetchedAt: string
}

export interface HooksSnapshot {
  topic: string
  opportunities: Array<{
    tweetUrl: string
    author: string
    authorFollowers: number
    content: string
    engagement: { likes: number; retweets: number; replies: number }
    velocityScore: number
    suggestedAngle: string
    opportunityScore: number
  }>
  fetchedAt: string
}

export interface ReviewSnapshot {
  handle: string
  period: { from: string; to: string }
  totalPosts: number
  totalEngagement: number
  avgEngagementPerPost: number
  topPosts: Array<{ url: string; content: string; engagement: number; why: string }>
  underperformers: Array<{ url: string; content: string; engagement: number; why: string }>
  patterns: Array<{ pattern: string; impact: string; evidence: string }>
  recommendations: string[]
  comparedToLast?: {
    engagementChange: number
    postFrequencyChange: number
    topTopicShift: string
  }
  fetchedAt: string
}

export interface TimingSnapshot {
  handle?: string
  topic?: string
  heatmap: Array<{ day: string; hour: number; score: number }>
  peakWindows: Array<{ day: string; startHour: number; endHour: number; score: number }>
  recommendations: string[]
  sampleSize: number
  fetchedAt: string
}

export interface VoiceProfile {
  handle: string
  generatedAt: string
  postCount: number
  traits: {
    tone: string
    vocabulary: string
    sentenceStyle: string
    emojiUsage: string
    hashtagUsage: string
    humor: string
    catchphrases: string[]
    avgPostLength: number
    threadStyle: string
  }
  topicPreferences: Array<{ topic: string; frequency: number }>
  examplePosts: string[]
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
  | ProfileSnapshot
  | DraftSnapshot
  | HooksSnapshot
  | ReviewSnapshot
  | TimingSnapshot
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

export type MatchKeys = Record<string, string | string[]>

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

export const AGENT_MATCH_KEYS: MatchKeys = {
  keyAccounts: 'handle',
  evidence: 'source',
}

export const PROFILE_MATCH_KEYS: MatchKeys = {
  contentMix: 'category',
  topPerformers: 'url',
}

export const HOOKS_MATCH_KEYS: MatchKeys = {
  opportunities: 'tweetUrl',
}

export const REVIEW_MATCH_KEYS: MatchKeys = {
  topPosts: 'url',
  underperformers: 'url',
  patterns: 'pattern',
}

export const TIMING_MATCH_KEYS: MatchKeys = {
  peakWindows: ['day', 'startHour'],
}
