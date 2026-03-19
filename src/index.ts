// Adapters
export { GrokAdapter, parseGrokJson, MODEL_PRICING, DEFAULT_MODEL } from './core/grok-adapter.js'
export { XAdapter, formatTweetsForAnalysis } from './core/x-adapter.js'

// Builders
export {
  buildScanSnapshot,
  buildPulseSnapshot,
  buildTraceSnapshot,
  buildProfileSnapshot,
} from './core/builders.js'

// Agent
export { AgentPlanner, AgentExecutor, AgentSynthesizer } from './core/agent.js'

// Voice
export { VoiceProfileManager } from './core/voice.js'

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
  VoiceProfile,
  StoredSnapshot,
  MatchKeys,
  GrokTweetScore,
  AgentBrief,
} from './core/schemas.js'

// Validators
export {
  GrokScanResponseSchema,
  GrokPulseResponseSchema,
  GrokTraceResponseSchema,
  GrokProfileResponseSchema,
  GrokVoiceProfileResponseSchema,
  AgentPlanSchema,
  ReplanDecisionSchema,
} from './core/validators.js'

export type { Tweet, XUser } from './core/x-adapter.js'
export type { DiffLine } from './core/differ.js'
export type { CacheEntry, CostLedger } from './core/cache.js'
