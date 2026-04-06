// Adapters
export {
  GrokAdapter,
  GrokParseError,
  parseGrokJson,
  MODEL_PRICING,
  DEFAULT_MODEL,
} from './core/grok-adapter.js'
export { XAdapter, XRateLimitError, XApiError, formatTweetsForAnalysis } from './core/x-adapter.js'

// Builders
export {
  buildScanSnapshot,
  buildPulseSnapshot,
  buildTraceSnapshot,
  buildProfileSnapshot,
  buildDraftSnapshot,
  buildHooksSnapshot,
  buildReviewSnapshot,
  buildTimingSnapshot,
} from './core/builders.js'

// Agent
export {
  AgentPlanner,
  AgentExecutor,
  AgentSynthesizer,
  agentMulti,
  MULTI_AGENT_MODEL,
} from './core/agent.js'

// Compute
export {
  computeBaseMetrics,
  computeSentiment,
  computeTopAccounts,
  computeNarratives,
  computeTopPosts,
  computeKeyVoices,
  computeConfidence,
  computeNewestTweetAt,
  detectContradictions,
  toUserMap,
  X_ENGAGEMENT_WEIGHTS,
  computeEngagementScore,
} from './core/metrics.js'

// Usage & compaction
export { UsageTracker } from './core/usage.js'
export { compactResults, estimateTokens, estimateResultTokens, compactSnapshot } from './core/compaction.js'

// Voice
export { VoiceProfileManager } from './core/voice.js'

// Storage & diff
export { SnapshotStore } from './core/snapshots.js'
export { diffSnapshots, formatDiffLines } from './core/differ.js'
export { QueryCache } from './core/cache.js'

// Types
export type {
  GrokResponse,
  QueryOptions,
  CommandResult,
  StructuredCommandResult,
  BuildResult,
  CorvusDeps,
  GrokCitation,
} from './core/types.js'

export type {
  Snapshot,
  ScanSnapshot,
  PulseSnapshot,
  TraceSnapshot,
  ProfileSnapshot,
  DraftSnapshot,
  HooksSnapshot,
  ReviewSnapshot,
  TimingSnapshot,
  StoredSnapshot,
  MatchKeys,
  GrokTweetScore,
  AgentBrief,
  VoiceProfile,
} from './core/schemas.js'

// Validators
export {
  GrokScanResponseSchema,
  GrokPulseResponseSchema,
  GrokTraceResponseSchema,
  GrokProfileResponseSchema,
  GrokVoiceProfileResponseSchema,
} from './core/validators.js'

export type {
  AgentPlan,
  AgentStep,
  AgentContext,
  AgentStepResult,
  AgentOptions,
  MultiAgentResult,
  ReplanDecision,
  PlanResult,
} from './core/agent.js'

export type { XSearchResult } from './core/x-adapter.js'

export type { TokenUsage } from './core/usage.js'
export type { CompactionConfig } from './core/compaction.js'
export type { Tweet, XUser } from './core/x-adapter.js'
export type { DiffLine } from './core/differ.js'
export type { CacheEntry, CostLedger } from './core/cache.js'
