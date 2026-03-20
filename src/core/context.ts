import type { ContextEntry } from '../tui/hooks/use-session.js'
import type {
  ScanSnapshot,
  PulseSnapshot,
  TraceSnapshot,
  ProfileSnapshot,
  HooksSnapshot,
  ReviewSnapshot,
  TimingSnapshot,
} from './schemas.js'

const MAX_CONTEXT_LENGTH = 2000

function summarizeScan(snapshot: ScanSnapshot): string {
  const parts = [`Takeaway: ${snapshot.takeaway}`]
  if (snapshot.actions.length > 0) parts.push(`Actions: ${snapshot.actions.slice(0, 3).join('; ')}`)
  if (snapshot.sentiment) parts.push(`Sentiment: ${snapshot.sentiment.avg.toFixed(2)}`)
  if (snapshot.signals.length > 0) parts.push(`Signals: ${snapshot.signals.slice(0, 3).join('; ')}`)
  return `[scan] ${parts.join(' | ')}`
}

function summarizePulse(snapshot: PulseSnapshot): string {
  const parts = [`Takeaway: ${snapshot.takeaway}`]
  parts.push(`Sentiment: ${snapshot.sentiment.avg.toFixed(2)}`)
  if (snapshot.bullSignals.length > 0) parts.push(`Bull: ${snapshot.bullSignals.slice(0, 2).join('; ')}`)
  if (snapshot.bearSignals.length > 0) parts.push(`Bear: ${snapshot.bearSignals.slice(0, 2).join('; ')}`)
  return `[pulse] ${parts.join(' | ')}`
}

function summarizeTrace(snapshot: TraceSnapshot): string {
  const parts: string[] = []
  if (snapshot.origin) parts.push(`Origin: @${snapshot.origin.account}`)
  if (snapshot.mutations.length > 0) parts.push(`${snapshot.mutations.length} mutations`)
  if (snapshot.timeline.length > 0) parts.push(`${snapshot.timeline.length} phases`)
  return `[trace] ${parts.join(' | ')}`
}

function summarizeProfile(snapshot: ProfileSnapshot): string {
  const parts = [`@${snapshot.handle}`]
  parts.push(`${snapshot.followers} followers`)
  if (snapshot.algorithmScore) parts.push(`Algo grade: ${snapshot.algorithmScore.grade}`)
  if (snapshot.voiceTraits) parts.push(`Tone: ${snapshot.voiceTraits.tone}`)
  if (snapshot.recommendations?.length) parts.push(`Recs: ${snapshot.recommendations.slice(0, 2).join('; ')}`)
  return `[profile] ${parts.join(' | ')}`
}

function summarizeHooks(snapshot: HooksSnapshot): string {
  const opps = snapshot.opportunities.slice(0, 3)
  if (opps.length === 0) return '[hooks] No opportunities found'
  const lines = opps.map((o) =>
    `@${o.author} (${o.engagement.likes} likes, ${o.engagement.replies} replies): ${o.suggestedAngle.slice(0, 100)}`,
  )
  return `[hooks] ${opps.length} top opportunities:\n${lines.join('\n')}`
}

function summarizeReview(snapshot: ReviewSnapshot): string {
  const parts = [`${snapshot.totalPosts} posts reviewed`]
  parts.push(`Avg engagement: ${snapshot.avgEngagementPerPost}`)
  if (snapshot.patterns.length > 0) parts.push(`Patterns: ${snapshot.patterns.slice(0, 2).map((p) => p.pattern).join('; ')}`)
  if (snapshot.recommendations.length > 0) parts.push(`Recs: ${snapshot.recommendations.slice(0, 2).join('; ')}`)
  return `[review] ${parts.join(' | ')}`
}

function summarizeTiming(snapshot: TimingSnapshot): string {
  const windows = snapshot.peakWindows.slice(0, 3)
  if (windows.length === 0) return '[timing] No peak windows found'
  const windowStrs = windows.map((w) => `${w.day} ${w.hour}:00`)
  return `[timing] Peak windows: ${windowStrs.join(', ')}`
}

function summarizeEntry(entry: ContextEntry): string {
  const snap = entry.snapshot
  if ('takeaway' in snap && 'signals' in snap) return summarizeScan(snap as ScanSnapshot)
  if ('takeaway' in snap && 'bullSignals' in snap) return summarizePulse(snap as PulseSnapshot)
  if ('origin' in snap && 'mutations' in snap) return summarizeTrace(snap as TraceSnapshot)
  if ('handle' in snap && 'algorithmScore' in snap) return summarizeProfile(snap as ProfileSnapshot)
  if ('opportunities' in snap) return summarizeHooks(snap as HooksSnapshot)
  if ('patterns' in snap && 'underperformers' in snap) return summarizeReview(snap as ReviewSnapshot)
  if ('peakWindows' in snap) return summarizeTiming(snap as TimingSnapshot)
  return `[${entry.command}] (data available)`
}

export function buildContextSummary(entries: ContextEntry[]): string {
  if (entries.length === 0) return ''

  const summaries = entries.map(summarizeEntry)
  let result = 'Prior context from this session:\n\n' + summaries.join('\n\n')

  if (result.length > MAX_CONTEXT_LENGTH) {
    result = result.slice(0, MAX_CONTEXT_LENGTH - 3) + '...'
  }

  return result
}
