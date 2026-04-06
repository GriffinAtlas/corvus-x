import { t, divider, labeledDivider, sentimentBar, confidenceBar, box, banner, percentBar } from './theme.js'
import { formatDiffLines } from '../core/differ.js'
import type { CommandResult, StructuredCommandResult, GrokCitation } from '../core/types.js'
import type {
  Snapshot,
  ScanSnapshot,
  PulseSnapshot,
  TraceSnapshot,
  ProfileSnapshot,
  DraftSnapshot,
  HooksSnapshot,
  ReviewSnapshot,
  TimingSnapshot,
  AgentBrief,
} from '../core/schemas.js'

export type OutputFormat = 'table' | 'json' | 'csv' | 'md'

export function formatOutput(result: CommandResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(result, null, 2)
    case 'csv':
      return formatCsv(result)
    case 'md':
      return formatMarkdown(result)
    case 'table':
    default:
      return formatTable(result)
  }
}

function cleanCitations(text: string): string {
  return text.replace(/\[\[(\d+)\]\]\([^)]+\)/g, '[$1]')
}

function formatTable(result: CommandResult): string {
  const text = cleanCitations(result.response)
  return [
    banner(result.command, result.query),
    `  ${divider()}`,
    '',
    `  ${text.split('\n').join('\n  ')}`,
    '',
  ].join('\n')
}

function formatCsv(result: CommandResult): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = 'command,query,response,cost,cached,timestamp'
  const row = [
    escape(result.command),
    escape(result.query),
    escape(result.response),
    result.cost.toString(),
    result.cached.toString(),
    result.timestamp.toString(),
  ].join(',')
  return `${header}\n${row}`
}

function formatMarkdown(result: CommandResult): string {
  return [
    `## ${result.command}`,
    '',
    `**Query:** ${result.query}`,
    '',
    result.response,
    '',
    `---`,
    `*Cost: $${result.cost.toFixed(4)} | ${result.cached ? 'cached' : 'live'}*`,
  ].join('\n')
}

export function formatStructuredOutput<T extends Snapshot>(
  result: StructuredCommandResult<T>,
  format: OutputFormat,
  renderSnapshot: (data: T) => string,
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(
        {
          command: result.command,
          topic: result.topic,
          data: result.data,
          cost: result.cost,
          timestamp: result.timestamp,
        },
        null,
        2,
      )
    case 'csv': {
      const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
      return `command,topic,data,cost,timestamp\n${escape(result.command)},${escape(result.topic)},${escape(JSON.stringify(result.data))},${result.cost},${result.timestamp}`
    }
    case 'md':
      return [
        `## ${result.command}`,
        '',
        `**Topic:** ${result.topic}`,
        '',
        renderSnapshot(result.data),
        '',
        `---`,
        `*Cost: $${result.cost.toFixed(4)}*`,
      ].join('\n')
    case 'table':
    default: {
      const parts: string[] = [
        banner(result.command, result.topic),
        `  ${divider()}`,
        '',
        renderSnapshot(result.data),
      ]

      const diffText = formatDiffLines(result.diff, result.timeSinceLast)
      if (diffText) {
        parts.push(t.muted(diffText))
      }

      if (result.citations?.length) {
        parts.push(renderCitations(result.citations))
      }

      parts.push('')
      return parts.join('\n')
    }
  }
}

export function renderCitations(citations: GrokCitation[]): string {
  if (citations.length === 0) return ''
  return [
    '',
    `  ${t.heading('Sources')}`,
    ...citations.map((c, i) => `    [${i + 1}] ${c.url.replace(/^https?:\/\//, '')}`),
  ].join('\n')
}

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return n.toLocaleString()
}

function sentimentColor(val: number): string {
  const formatted = val >= 0 ? `+${val}` : String(val)
  return val >= 0 ? t.positive(formatted) : t.negative(formatted)
}

export function renderScan(data: ScanSnapshot): string {
  const { takeaway, actions, metrics, sentiment, topAccounts, narratives, signals } = data
  const parts: string[] = []

  if (takeaway) {
    parts.push(`  ${t.heading(takeaway)}`)
    parts.push('')
  }

  if (actions.length > 0) {
    for (const a of actions) {
      parts.push(`  ${t.positive('→')} ${a}`)
    }
    parts.push('')
  }

  parts.push(`  ${labeledDivider('Details')}`)
  parts.push(
    `  ${t.muted(`${metrics.tweetCount} tweets · ${metrics.uniqueAuthors} authors · ${compactNum(metrics.totalEngagement)} engagement`)}`,
  )
  parts.push(
    `  Sentiment: ${sentimentBar(sentiment.avg, 15)}  ${sentimentColor(sentiment.avg)}`,
  )

  if (narratives.length > 0) {
    parts.push('')
    parts.push(`  ${labeledDivider('Narratives')}`)
    for (const n of narratives.slice(0, 5)) {
      const pct = metrics.tweetCount > 0 ? n.tweetCount / metrics.tweetCount : 0
      parts.push(`    ${n.theme.padEnd(22)} ${percentBar(pct, 10, t.accent)} ${n.tweetCount} tweets  ${sentimentColor(n.avgSentiment)}`)
    }
  }

  if (topAccounts.length > 0) {
    parts.push('')
    parts.push(`  ${labeledDivider('Key Voices')}`)
    for (const a of topAccounts.slice(0, 5)) {
      parts.push(
        `    @${a.handle}  ${compactNum(a.followers)} followers  ${sentimentColor(a.avgSentiment)}`,
      )
    }
  }

  if (signals.length > 0) {
    parts.push('')
    parts.push(`  ${labeledDivider('Signals')}`)
    for (const s of signals) {
      parts.push(`    · ${s}`)
    }
  }

  return parts.join('\n')
}

export function renderPulse(data: PulseSnapshot): string {
  const { takeaway, actions, metrics, sentiment, bullSignals, bearSignals, keyVoices } = data
  const parts: string[] = []

  if (takeaway) {
    parts.push(`  ${t.heading(takeaway)}`)
    parts.push('')
  }

  if (actions.length > 0) {
    for (const a of actions) {
      parts.push(`  ${t.positive('→')} ${a}`)
    }
    parts.push('')
  }

  parts.push(`  ${labeledDivider('Sentiment')}`)
  parts.push(
    `  ${sentimentBar(sentiment.avg, 20)}  ${sentimentColor(sentiment.avg)}  ${t.muted(`(${metrics.tweetCount} tweets, ${metrics.uniqueAuthors} authors)`)}`,
  )

  if (bullSignals.length > 0) {
    parts.push('')
    parts.push(`  ${t.positive(t.heading('Bull Signals'))}`)
    for (const s of bullSignals) {
      parts.push(`    ${t.positive('▲')} ${s}`)
    }
  }

  if (bearSignals.length > 0) {
    parts.push('')
    parts.push(`  ${t.negative(t.heading('Bear Signals'))}`)
    for (const s of bearSignals) {
      parts.push(`    ${t.negative('▼')} ${s}`)
    }
  }

  if (keyVoices.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Key Voices')}`)
    for (const v of keyVoices.slice(0, 5)) {
      parts.push(`    @${v.handle}  ${compactNum(v.reach)} reach  ${sentimentColor(v.sentiment)}`)
    }
  }

  return parts.join('\n')
}

export function renderTrace(data: TraceSnapshot): string {
  const { origin, timeline, mutations, reach } = data
  const parts: string[] = []

  parts.push(
    `  Reach: ${reach.totalTweets} tweets  ${reach.totalEngagement.toLocaleString()} engagement  ${reach.uniqueAuthors} authors`,
  )

  if (origin) {
    parts.push('')
    parts.push(`  ${t.heading('Origin')}`)
    parts.push(`    @${origin.account}  ${origin.date}`)
    parts.push(
      `    ${t.muted(origin.content.length > 150 ? origin.content.slice(0, 150) + '...' : origin.content)}`,
    )
  }

  if (timeline.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Timeline')}`)
    for (const phase of timeline) {
      const amplifiers =
        phase.keyAmplifiers.length > 0
          ? ` — ${phase.keyAmplifiers
              .slice(0, 3)
              .map((a) => `@${a}`)
              .join(', ')}`
          : ''
      parts.push(
        `    ${phase.phase}  ${phase.tweetCount} tweets  ${t.muted(phase.timeframe)}${amplifiers}`,
      )
    }
  }

  if (mutations.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Mutations')}`)
    for (const m of mutations) {
      parts.push(`    "${m.original}" → "${m.variant}"`)
    }
  }

  return parts.join('\n')
}

function isReal(val: string | undefined): boolean {
  return !!val && val !== 'undefined' && val !== 'none' && val !== 'n/a' && val !== 'unknown'
}

export function renderProfile(data: ProfileSnapshot): string {
  const parts: string[] = []

  parts.push(
    `  @${data.handle}  ${compactNum(data.followers)} followers  ${compactNum(data.following)} following`,
  )
  if (data.displayName && data.displayName !== data.handle) {
    parts.push(`  ${t.muted(data.displayName)}`)
  }

  if (data.postFrequency.postsPerWeek > 0) {
    parts.push('')
    parts.push(`  ${labeledDivider('Posting Cadence')}`)
    parts.push(
      `    ${t.accent(String(data.postFrequency.postsPerWeek))} posts/week  Active: ${data.postFrequency.activeDays.join(', ') || 'n/a'}`,
    )
    if (data.postFrequency.peakHours.length > 0) {
      parts.push(
        `    Peak hours (UTC): ${data.postFrequency.peakHours.map((h) => `${h}:00`).join(', ')}`,
      )
    }
  }

  if (data.contentMix.length > 0) {
    parts.push('')
    parts.push(`  ${labeledDivider('Content Mix')}`)
    for (const c of data.contentMix.slice(0, 7)) {
      const pct = c.percentage / 100
      parts.push(
        `    ${c.category.padEnd(16)} ${percentBar(pct, 12, t.accent)} ${String(c.percentage).padStart(3)}%  ${compactNum(c.avgEngagement)} avg interactions`,
      )
    }
  }

  if (data.topPerformers.length > 0) {
    parts.push('')
    parts.push(`  ${labeledDivider('Top Performers')}`)
    for (const p of data.topPerformers.slice(0, 5)) {
      parts.push(`    ${t.accent(compactNum(p.engagement))} eng  ${t.muted(p.why)}`)
      parts.push(
        `      ${t.muted(p.content)}`,
      )
    }
  }

  const { tone, vocabulary, emojiUsage, avgLength } = data.voiceTraits
  const hasVoice = isReal(tone) || isReal(vocabulary) || isReal(emojiUsage) || (avgLength > 0)
  if (hasVoice) {
    parts.push('')
    parts.push(`  ${t.heading('Voice')}`)
    if (isReal(tone)) parts.push(`    Tone: ${tone}`)
    if (isReal(vocabulary)) parts.push(`    Vocabulary: ${vocabulary}`)
    if (isReal(emojiUsage)) parts.push(`    Emoji: ${emojiUsage}`)
    if (avgLength > 0) parts.push(`    Avg length: ${avgLength} chars`)
  }

  const algo = data.algorithmScore
  if (algo.grade !== 'N/A') {
    const gradeColor = algo.grade <= 'B' ? t.positive : algo.grade === 'C' ? t.warning : t.negative
    parts.push('')
    parts.push(`  ${labeledDivider(`Algorithm Health  ${gradeColor(algo.grade)}`)}`)
    parts.push(`    Reply rate       ${percentBar(algo.replyRate, 15, t.accent)} ${(algo.replyRate * 100).toFixed(0)}%  ${t.muted('13.5x likes')}`)
    parts.push(`    Author replies   ${percentBar(algo.authorReplyRate, 15, t.positive)} ${(algo.authorReplyRate * 100).toFixed(0)}%  ${t.muted('75x weight')}`)
    parts.push(`    Conversations    ${percentBar(algo.conversationRatio, 15, t.positive)} ${(algo.conversationRatio * 100).toFixed(0)}%  ${t.muted('150x a like')}`)
    if (algo.bookmarkToLikeRatio > 0) {
      parts.push(`    Bookmark/like    ${percentBar(algo.bookmarkToLikeRatio, 15)} ${(algo.bookmarkToLikeRatio * 100).toFixed(1)}%  ${t.muted('save-worthy')}`)
    }
  }

  if (data.sentiment !== 0) {
    parts.push('')
    parts.push(`  Sentiment: ${sentimentColor(data.sentiment)}`)
  }

  if (data.recommendations && data.recommendations.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Recommendations')}`)
    for (const r of data.recommendations) {
      parts.push(`    · ${r}`)
    }
  }

  const hasContent = data.postFrequency.postsPerWeek > 0 || data.contentMix.length > 0 || data.topPerformers.length > 0
  if (!hasContent) {
    parts.push('')
    parts.push(`  ${t.muted('Limited data — this account has few or no recent posts.')}`)
  }

  return parts.join('\n')
}

export function renderDraft(data: DraftSnapshot): string {
  const parts: string[] = []

  if (data.why) {
    parts.push(`  ${t.muted(data.why)}`)
    parts.push('')
  }

  parts.push(`  ${t.heading('Post')}`)
  parts.push(`  ${data.post}`)

  if (data.thread && data.thread.length > 0) {
    parts.push('')
    parts.push(`  ${labeledDivider('Thread')}`)
    for (let i = 0; i < data.thread.length; i++) {
      parts.push(`    ${t.accent(`${i + 1}/${data.thread.length}`)}  ${data.thread[i]}`)
    }
  }

  if (data.angles.length > 0) {
    parts.push('')
    parts.push(`  ${labeledDivider('Other angles you could take')}`)
    for (const a of data.angles) {
      parts.push(`    · ${a}`)
    }
  }

  if (data.hashtags.length > 0) {
    parts.push('')
    parts.push(`  ${t.muted(data.hashtags.join('  '))}`)
  }

  if (data.replyTo) {
    parts.push('')
    parts.push(`  ${t.muted(`replying to: ${data.replyTo}`)}`)
  }

  return parts.join('\n')
}

export function renderHooks(data: HooksSnapshot): string {
  const parts: string[] = []

  parts.push(`  ${data.opportunities.length} opportunities for "${data.topic}"`)

  if (data.opportunities.length === 0) {
    parts.push('')
    parts.push(`  ${t.muted('No reply opportunities found.')}`)
    return parts.join('\n')
  }

  for (const opp of data.opportunities) {
    parts.push('')
    const scoreColor = opp.opportunityScore >= 0.7 ? t.positive : opp.opportunityScore >= 0.4 ? t.warning : t.muted
    const eng = opp.engagement
    const competition = eng.likes > 0 ? (eng.replies / eng.likes * 100).toFixed(0) : '0'
    const compLabel = Number(competition) < 10 ? t.positive('low competition') : Number(competition) < 30 ? t.warning('moderate') : t.muted('crowded')

    parts.push(`  ${percentBar(opp.opportunityScore, 8, scoreColor)} @${opp.author}  ${compactNum(opp.authorFollowers)} followers  ${compLabel}`)
    parts.push(`  ${t.muted(`${eng.likes} likes · ${eng.replies} replies (${competition}% reply ratio)`)}`)
    parts.push(`    ${opp.content}`)
    parts.push(`    ${t.positive('→')} ${opp.suggestedAngle}`)
    if (opp.tweetUrl) {
      parts.push(`    ${t.muted(opp.tweetUrl)}`)
    }
  }

  return parts.join('\n')
}

export function renderReview(data: ReviewSnapshot): string {
  const parts: string[] = []

  parts.push(`  @${data.handle}  ${data.period.from.slice(0, 10)} → ${data.period.to.slice(0, 10)}`)
  parts.push(`  ${data.totalPosts} posts  ${compactNum(data.totalEngagement)} total engagement  ${compactNum(data.avgEngagementPerPost)} avg/post`)

  if (data.topPosts.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Top Performers')}`)
    for (const p of data.topPosts.slice(0, 5)) {
      parts.push(`    ${t.positive(compactNum(p.engagement) + ' interactions')}  ${t.muted(p.why)}`)
      parts.push(`      ${t.muted(p.content)}`)
    }
  }

  if (data.underperformers.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Underperformers')}`)
    for (const p of data.underperformers.slice(0, 3)) {
      parts.push(`    ${t.negative(compactNum(p.engagement) + ' interactions')}  ${t.muted(p.why)}`)
      parts.push(`      ${t.muted(p.content)}`)
    }
  }

  if (data.patterns.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Patterns')}`)
    for (const p of data.patterns) {
      parts.push(`    · ${p.pattern}  ${t.muted(p.impact)}`)
    }
  }

  if (data.recommendations.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Recommendations')}`)
    for (const r of data.recommendations) {
      parts.push(`    · ${r}`)
    }
  }

  return parts.join('\n')
}

export function renderTiming(data: TimingSnapshot): string {
  const parts: string[] = []

  const label = data.handle ? `@${data.handle}` : data.topic ?? 'unknown'
  parts.push(`  ${t.heading('Timing')} ${t.muted(`· ${label}`)}`)

  if (data.sampleSize > 0) {
    parts.push(`  ${t.muted(`Based on ${data.sampleSize} posts`)}`)
  }

  if (data.peakWindows.length > 0) {
    parts.push('')
    parts.push(`  ${labeledDivider('Peak Windows')}`)
    for (const w of data.peakWindows.slice(0, 10)) {
      const barColor = w.score >= 0.8 ? t.positive : w.score >= 0.5 ? t.accent : t.muted
      parts.push(`    ${w.day.padEnd(10)} ${String(w.hour).padStart(2)}:00  ${percentBar(w.score, 15, barColor)} ${(w.score * 100).toFixed(0)}%`)
    }
  }

  if (data.recommendations.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Recommendations')}`)
    for (const r of data.recommendations) {
      parts.push(`    · ${r}`)
    }
  }

  return parts.join('\n')
}

export interface AgentBriefRenderOptions {
  stepCount: number
  durationMs: number
  tweetCount: number
  accountCount: number
  cost: number
  approximateCost?: boolean
  tokenSummary?: string
  previousSentiment?: number
}

export function renderAgentBrief(brief: AgentBrief, opts: AgentBriefRenderOptions): string {
  const parts: string[] = []

  parts.push(box([`  ${brief.signalLine}  `]))
  parts.push('')

  const sentimentStr = sentimentColor(brief.sentiment)
  const bar = sentimentBar(brief.sentiment, 20)
  const prevStr =
    opts.previousSentiment !== undefined
      ? t.muted(` (was ${opts.previousSentiment >= 0 ? '+' : ''}${opts.previousSentiment})`)
      : ''
  parts.push(`  Sentiment  ${sentimentStr} avg  ${bar}${prevStr}`)

  if (brief.summary.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Key Findings')}`)
    for (const bullet of brief.summary) {
      parts.push(`    · ${bullet}`)
    }
  }

  if (brief.keyAccounts.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Top Voices')}`)
    for (const acct of brief.keyAccounts) {
      parts.push(
        `    @${acct.handle}  ${compactNum(acct.reach)} reach  ${sentimentColor(acct.sentiment)}  "${acct.stance}"`,
      )
    }
  }

  if (brief.contradictions.length > 0) {
    parts.push('')
    parts.push(`  ${t.warning('Contradictions')}`)
    for (const c of brief.contradictions) {
      parts.push(`    ${c}`)
    }
  }

  const confBar = confidenceBar(brief.confidence.overall, 20)
  const volumeLabel = brief.confidence.volume
  parts.push('')
  parts.push(`  Confidence  ${confBar}  ${brief.confidence.overall}  ${volumeLabel}`)
  parts.push(`  Sample: ${brief.sampleSize} tweets from ${opts.accountCount} authors`)

  if (brief.staleness !== null && brief.staleness > 3600_000) {
    const hours = Math.round(brief.staleness / 3600_000)
    parts.push(`  ${t.warning(`stale: newest tweet ${hours}h ago`)}`)
  }

  parts.push('')
  parts.push(`  ${divider()}`)
  const duration = (opts.durationMs / 1000).toFixed(1)
  parts.push(
    `  ${t.muted(`${opts.stepCount} steps · ${duration}s · ${opts.tweetCount} tweets · ${opts.accountCount} accounts${opts.tokenSummary ? ` · ${opts.tokenSummary}` : ''} · ${opts.approximateCost ? '~' : ''}$${opts.cost.toFixed(4)}`)}`,
  )

  return parts.join('\n')
}

export function renderAgentBriefMd(brief: AgentBrief, opts: AgentBriefRenderOptions): string {
  const parts: string[] = []

  parts.push(`## ${brief.signalLine}`)
  parts.push('')
  parts.push(`**Sentiment:** ${brief.sentiment}`)
  parts.push('')

  if (brief.summary.length > 0) {
    parts.push('### Key Findings')
    for (const bullet of brief.summary) {
      parts.push(`- ${bullet}`)
    }
    parts.push('')
  }

  if (brief.keyAccounts.length > 0) {
    parts.push('### Top Voices')
    parts.push('| Handle | Reach | Sentiment | Stance |')
    parts.push('|--------|-------|-----------|--------|')
    for (const acct of brief.keyAccounts) {
      parts.push(
        `| @${acct.handle} | ${compactNum(acct.reach)} | ${acct.sentiment} | ${acct.stance} |`,
      )
    }
    parts.push('')
  }

  if (brief.contradictions.length > 0) {
    parts.push('### Contradictions')
    for (const c of brief.contradictions) {
      parts.push(`- ${c}`)
    }
    parts.push('')
  }

  parts.push(`---`)
  parts.push(
    `*Confidence: ${brief.confidence.overall} (${brief.confidence.volume}) | ${opts.stepCount} steps | ${opts.tweetCount} tweets${opts.tokenSummary ? ` | ${opts.tokenSummary}` : ''} | ${opts.approximateCost ? '~' : ''}$${opts.cost.toFixed(4)}*`,
  )

  return parts.join('\n')
}
