import type { Snapshot, ScanSnapshot, PulseSnapshot, TraceSnapshot, ProfileSnapshot } from './schemas.js'
import type { AgentStepResult } from './agent.js'

const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function estimateResultTokens(results: AgentStepResult[]): number {
  let total = 0
  for (const r of results) {
    total += estimateTokens(JSON.stringify(r.snapshot))
  }
  return total
}

function summarizeScanSnapshot(snap: ScanSnapshot): Record<string, unknown> {
  return {
    takeaway: snap.takeaway,
    sentiment: snap.sentiment.avg,
    tweetCount: snap.metrics.tweetCount,
    topAccounts: snap.topAccounts.slice(0, 3).map((a) => a.handle),
    narrativeCount: snap.narratives.length,
    signals: snap.signals.slice(0, 3),
  }
}

function summarizePulseSnapshot(snap: PulseSnapshot): Record<string, unknown> {
  return {
    takeaway: snap.takeaway,
    sentiment: snap.sentiment.avg,
    tweetCount: snap.metrics.tweetCount,
    bullSignals: snap.bullSignals.slice(0, 2),
    bearSignals: snap.bearSignals.slice(0, 2),
    keyVoices: snap.keyVoices.slice(0, 3).map((v) => v.handle),
  }
}

function summarizeTraceSnapshot(snap: TraceSnapshot): Record<string, unknown> {
  return {
    origin: snap.origin?.account ?? 'unknown',
    phases: snap.timeline.length,
    tweetCount: snap.metrics.tweetCount,
    mutations: snap.mutations.length,
    totalReach: snap.reach.totalEngagement,
  }
}

function summarizeProfileSnapshot(snap: ProfileSnapshot): Record<string, unknown> {
  return {
    handle: snap.handle,
    followers: snap.followers,
    grade: snap.algorithmScore.grade,
    replyRate: snap.algorithmScore.replyRate,
    topContentType: snap.contentMix[0]?.category ?? 'unknown',
    voiceTone: snap.voiceTraits.tone,
  }
}

function summarizeGenericSnapshot(snap: Snapshot): Record<string, unknown> {
  const obj = snap as unknown as Record<string, unknown>
  const summary: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      summary[key] = value.length > 120 ? value.slice(0, 120) + '...' : value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = value
    } else if (Array.isArray(value)) {
      summary[key] = `[${value.length} items]`
    } else if (value !== null && typeof value === 'object') {
      const nested = value as Record<string, unknown>
      const keys = Object.keys(nested)
      const preview: Record<string, unknown> = {}
      for (const k of keys.slice(0, 4)) {
        const v = nested[k]
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          preview[k] = v
        }
      }
      summary[key] = Object.keys(preview).length > 0 ? preview : `{${keys.length} keys}`
    }
  }
  return summary
}

function summarizeMinimal(result: AgentStepResult): string {
  const snap = result.snapshot
  if ('takeaway' in snap && typeof snap.takeaway === 'string') return snap.takeaway
  if ('handle' in snap && typeof snap.handle === 'string') return `profile: @${snap.handle}`
  if ('topic' in snap && typeof snap.topic === 'string') return `${result.command}: ${snap.topic}`
  return `${result.command} completed`
}

export function compactSnapshot(command: string, snapshot: Snapshot): Record<string, unknown> {
  if (command === 'scan' && 'narratives' in snapshot) return summarizeScanSnapshot(snapshot as ScanSnapshot)
  if (command === 'pulse' && 'bullSignals' in snapshot) return summarizePulseSnapshot(snapshot as PulseSnapshot)
  if (command === 'trace' && 'timeline' in snapshot) return summarizeTraceSnapshot(snapshot as TraceSnapshot)
  if (command === 'profile' && 'algorithmScore' in snapshot) return summarizeProfileSnapshot(snapshot as ProfileSnapshot)
  return summarizeGenericSnapshot(snapshot)
}

export interface CompactionConfig {
  maxTokenBudget: number
  preserveRecent: number
}

export const DEFAULT_COMPACTION: CompactionConfig = {
  maxTokenBudget: 24_000,
  preserveRecent: 2,
}

export function compactResults(
  results: AgentStepResult[],
  config: CompactionConfig = DEFAULT_COMPACTION,
): { summaries: string; compactedCount: number } {
  if (results.length <= config.preserveRecent) {
    return {
      summaries: results
        .map((r) => `## ${r.command}\n${JSON.stringify(r.snapshot, null, 2)}`)
        .join('\n\n'),
      compactedCount: 0,
    }
  }

  const recentResults = results.slice(-config.preserveRecent)
  const recentJson = recentResults
    .map((r) => `## ${r.command}\n${JSON.stringify(r.snapshot, null, 2)}`)
    .join('\n\n')

  const recentTokens = estimateTokens(recentJson)
  const remainingBudget = config.maxTokenBudget - recentTokens

  if (remainingBudget <= 0) {
    const lostCount = results.length - config.preserveRecent
    const lostCommands = results.slice(0, lostCount).map((r) => r.command).join(', ')
    const lostNote = `[${lostCount} earlier steps omitted for context limits: ${lostCommands}]\n\n`
    return { summaries: lostNote + recentJson, compactedCount: lostCount }
  }

  const olderResults = results.slice(0, -config.preserveRecent)
  const compactedSummaries = olderResults.map((r) => {
    const compact = compactSnapshot(r.command, r.snapshot)
    return `## ${r.command} (condensed)\n${JSON.stringify(compact)}`
  })

  const olderJson = compactedSummaries.join('\n\n')
  const olderTokens = estimateTokens(olderJson)

  if (olderTokens <= remainingBudget) {
    return {
      summaries: olderJson + '\n\n' + recentJson,
      compactedCount: olderResults.length,
    }
  }

  const perResultBudget = Math.floor(remainingBudget / olderResults.length)
  const truncatedSummaries = olderResults.map((r, i) => {
    if (estimateTokens(compactedSummaries[i]) <= perResultBudget) return compactedSummaries[i]
    const minimal = { command: r.command, summary: summarizeMinimal(r) }
    return `## ${r.command} (condensed)\n${JSON.stringify(minimal)}`
  })

  return {
    summaries: truncatedSummaries.join('\n\n') + '\n\n' + recentJson,
    compactedCount: olderResults.length,
  }
}
