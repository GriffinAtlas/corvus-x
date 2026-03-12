import { t, divider, sentimentBar, confidenceBar, box } from './theme.js'
import { formatDiffLines } from '../core/differ.js'
import type { CommandResult, StructuredCommandResult, GrokCitation } from '../core/types.js'
import type {
  Snapshot,
  ScanSnapshot,
  PulseSnapshot,
  TraceSnapshot,
  GatherSnapshot,
  ReadSnapshot,
  ScopeSnapshot,
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

function formatTable(result: CommandResult): string {
  const cost = result.cached ? t.muted('(cached)') : t.muted(`cost: $${result.cost.toFixed(4)}`)

  return [
    '',
    `  ${t.heading(result.command)} ${t.muted('·')} ${result.query}`,
    `  ${divider()}`,
    '',
    `  ${result.response.split('\n').join('\n  ')}`,
    '',
    `  ${cost}`,
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
        '',
        `  ${t.heading(result.command)} ${t.muted('·')} ${result.topic}`,
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
      parts.push(`  ${t.muted(`cost: $${result.cost.toFixed(4)}`)}`)
      parts.push('')
      return parts.join('\n')
    }
  }
}

export function renderCitations(citations: GrokCitation[]): string {
  if (citations.length === 0) return ''
  const lines = ['', `  ${t.heading('Sources')}`]
  for (let i = 0; i < citations.length; i++) {
    const c = citations[i]
    const display = c.url.replace(/^https?:\/\//, '')
    lines.push(`    [${i + 1}] ${display}`)
  }
  return lines.join('\n')
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
  const { metrics, sentiment, topAccounts, narratives, signals } = data
  const parts: string[] = []

  parts.push(
    `  Tweets: ${metrics.tweetCount.toLocaleString()}  Engagement: ${metrics.totalEngagement.toLocaleString()}  Authors: ${metrics.uniqueAuthors}  Avg: ${metrics.engagementPerTweet}/tweet`,
  )
  parts.push('')
  parts.push(
    `  Sentiment: ${sentiment.avg} avg  (${t.positive(`+${sentiment.positive}`)} / ${t.muted(String(sentiment.neutral))} / ${t.negative(`-${sentiment.negative}`)})`,
  )

  if (topAccounts.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Top Accounts')}`)
    for (const a of topAccounts.slice(0, 5)) {
      parts.push(
        `    @${a.handle}  ${a.postCount} posts  ${compactNum(a.followers)} followers  ${sentimentColor(a.avgSentiment)}`,
      )
    }
  }

  if (narratives.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Narratives')}`)
    for (const n of narratives.slice(0, 5)) {
      parts.push(`    ${n.theme}  ${n.tweetCount} tweets  ${sentimentColor(n.avgSentiment)}`)
      parts.push(`      ${t.muted(n.description)}`)
    }
  }

  if (signals.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Signals')}`)
    for (const s of signals) {
      parts.push(`    · ${s}`)
    }
  }

  return parts.join('\n')
}

export function renderPulse(data: PulseSnapshot): string {
  const { metrics, sentiment, bullSignals, bearSignals, keyVoices } = data
  const parts: string[] = []

  parts.push(
    `  Tweets: ${metrics.tweetCount.toLocaleString()}  Engagement: ${metrics.totalEngagement.toLocaleString()}  Authors: ${metrics.uniqueAuthors}`,
  )
  parts.push('')
  parts.push(
    `  Sentiment: ${sentiment.avg} avg  (${t.positive(`+${sentiment.positive}`)} / ${t.muted(String(sentiment.neutral))} / ${t.negative(`-${sentiment.negative}`)})`,
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

export function renderGather(data: GatherSnapshot): string {
  const { metrics, sentiment, topPosts, narratives, webContext, outlook } = data
  const parts: string[] = []

  parts.push(
    `  Tweets: ${metrics.tweetCount.toLocaleString()}  Engagement: ${metrics.totalEngagement.toLocaleString()}  Authors: ${metrics.uniqueAuthors}`,
  )
  parts.push('')
  parts.push(
    `  Sentiment: ${sentiment.avg} avg  (${t.positive(`+${sentiment.positive}`)} / ${t.muted(String(sentiment.neutral))} / ${t.negative(`-${sentiment.negative}`)})`,
  )

  if (topPosts.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Top Posts')}`)
    for (const p of topPosts.slice(0, 3)) {
      parts.push(`    @${p.author}  ${compactNum(p.engagement)} engagement`)
      parts.push(`      ${t.muted(p.text.length > 120 ? p.text.slice(0, 120) + '...' : p.text)}`)
    }
  }

  if (narratives.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Narratives')}`)
    for (const n of narratives.slice(0, 5)) {
      parts.push(`    ${n.theme}  ${n.tweetCount} tweets  ${sentimentColor(n.avgSentiment)}`)
    }
  }

  if (webContext.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Web Context')}`)
    for (const c of webContext.slice(0, 3)) {
      parts.push(`    · ${c}`)
    }
  }

  if (outlook) {
    parts.push('')
    parts.push(`  ${t.heading('Outlook')}`)
    parts.push(`    ${outlook}`)
  }

  return parts.join('\n')
}

export function renderRead(data: ReadSnapshot): string {
  const { tweet, analysis, significance, signals } = data
  const parts: string[] = []

  const eng = tweet.engagement
  parts.push(`  @${tweet.author}  ${t.muted(tweet.postedAt)}`)
  parts.push(
    `  ${t.muted(`${eng.likes} likes · ${eng.retweets} RTs · ${eng.replies} replies · ${compactNum(eng.impressions)} views`)}`,
  )
  parts.push('')
  parts.push(`  ${tweet.text}`)
  parts.push('')

  const sigColor =
    significance === 'high' ? t.negative : significance === 'medium' ? t.warning : t.muted
  parts.push(`  Significance: ${sigColor(significance)}`)

  parts.push('')
  parts.push(`  ${t.heading('Analysis')}`)
  parts.push(`    ${analysis}`)

  if (signals.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Signals')}`)
    for (const s of signals) {
      parts.push(`    · ${s}`)
    }
  }

  return parts.join('\n')
}

export function renderScope(data: ScopeSnapshot): string {
  const {
    account,
    recentActivity,
    contentPatterns,
    recentFocus,
    networkPosition,
    influence,
    signalValue,
  } = data
  const parts: string[] = []

  parts.push(
    `  @${account.handle}  ${compactNum(account.followers)} followers  ${compactNum(account.following)} following  ${compactNum(account.tweetCount)} tweets`,
  )

  parts.push('')
  parts.push(`  ${t.heading('Recent Activity')}`)
  parts.push(
    `    ${recentActivity.postsAnalyzed} posts analyzed  ${compactNum(recentActivity.avgEngagement)} avg engagement`,
  )
  if (recentActivity.topTweet) {
    const tt = recentActivity.topTweet
    parts.push(
      `    Top: ${t.muted(tt.text.length > 100 ? tt.text.slice(0, 100) + '...' : tt.text)}  ${compactNum(tt.engagement)} eng`,
    )
  }

  if (contentPatterns.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Content Patterns')}`)
    for (const p of contentPatterns) {
      parts.push(`    · ${p}`)
    }
  }

  if (recentFocus.length > 0) {
    parts.push('')
    parts.push(`  ${t.heading('Recent Focus')}`)
    for (const f of recentFocus) {
      parts.push(`    · ${f}`)
    }
  }

  parts.push('')
  parts.push(`  Network: ${networkPosition}`)
  const influenceColor =
    influence === 'high' ? t.positive : influence === 'medium' ? t.warning : t.muted
  const signalColor =
    signalValue === 'high' ? t.positive : signalValue === 'medium' ? t.warning : t.muted
  parts.push(`  Influence: ${influenceColor(influence)}  Signal Value: ${signalColor(signalValue)}`)

  return parts.join('\n')
}

export interface AgentBriefRenderOptions {
  stepCount: number
  durationMs: number
  tweetCount: number
  accountCount: number
  cost: number
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
    `  ${t.muted(`${opts.stepCount} steps · ${duration}s · ${opts.tweetCount} tweets · ${opts.accountCount} accounts · $${opts.cost.toFixed(4)}`)}`,
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
    `*Confidence: ${brief.confidence.overall} (${brief.confidence.volume}) | ${opts.stepCount} steps | ${opts.tweetCount} tweets | $${opts.cost.toFixed(4)}*`,
  )

  return parts.join('\n')
}
