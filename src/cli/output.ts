import chalk from 'chalk'
import { formatDiffLines } from '../core/differ.js'
import type { CommandResult, StructuredCommandResult } from '../core/types.js'
import type {
  Snapshot,
  ScanSnapshot,
  PulseSnapshot,
  TraceSnapshot,
  GatherSnapshot,
  ReadSnapshot,
  ScopeSnapshot,
} from '../core/schemas.js'

export type OutputFormat = 'table' | 'json' | 'csv' | 'md'

// ── Legacy prose output (used by `ask`) ──

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
  const cost = result.cached
    ? chalk.dim('(cached)')
    : chalk.dim(`cost: $${result.cost.toFixed(4)}`)

  return [
    '',
    `  ${chalk.bold(result.command)} ${chalk.dim('·')} ${result.query}`,
    `  ${chalk.dim('───────────────────────────────────────────')}`,
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

// ── Structured output (used by scan, pulse, trace, gather, read, scope) ──

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
        `  ${chalk.bold(result.command)} ${chalk.dim('·')} ${result.topic}`,
        `  ${chalk.dim('───────────────────────────────────────────')}`,
        '',
        renderSnapshot(result.data),
      ]

      const diffText = formatDiffLines(result.diff, result.timeSinceLast)
      if (diffText) {
        parts.push(chalk.dim(diffText))
      }

      parts.push('')
      parts.push(`  ${chalk.dim(`cost: $${result.cost.toFixed(4)}`)}`)
      parts.push('')
      return parts.join('\n')
    }
  }
}

// ── Helpers ──

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return n.toLocaleString()
}

function sentimentColor(val: number): string {
  const formatted = val >= 0 ? `+${val}` : String(val)
  return val >= 0 ? chalk.green(formatted) : chalk.red(formatted)
}

// ── Per-command renderers ──

export function renderScan(data: ScanSnapshot): string {
  const { metrics, sentiment, topAccounts, narratives, signals } = data
  const parts: string[] = []

  parts.push(
    `  Tweets: ${metrics.tweetCount.toLocaleString()}  Engagement: ${metrics.totalEngagement.toLocaleString()}  Authors: ${metrics.uniqueAuthors}  Avg: ${metrics.engagementPerTweet}/tweet`,
  )
  parts.push('')
  parts.push(
    `  Sentiment: ${sentiment.avg} avg  (${chalk.green(`+${sentiment.positive}`)} / ${chalk.dim(String(sentiment.neutral))} / ${chalk.red(`-${sentiment.negative}`)})`,
  )

  if (topAccounts.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Top Accounts')}`)
    for (const a of topAccounts.slice(0, 5)) {
      parts.push(
        `    @${a.handle}  ${a.postCount} posts  ${compactNum(a.followers)} followers  ${sentimentColor(a.avgSentiment)}`,
      )
    }
  }

  if (narratives.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Narratives')}`)
    for (const n of narratives.slice(0, 5)) {
      parts.push(`    ${n.theme}  ${n.tweetCount} tweets  ${sentimentColor(n.avgSentiment)}`)
      parts.push(`      ${chalk.dim(n.description)}`)
    }
  }

  if (signals.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Signals')}`)
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
    `  Sentiment: ${sentiment.avg} avg  (${chalk.green(`+${sentiment.positive}`)} / ${chalk.dim(String(sentiment.neutral))} / ${chalk.red(`-${sentiment.negative}`)})`,
  )

  if (bullSignals.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.green.bold('Bull Signals')}`)
    for (const s of bullSignals) {
      parts.push(`    ${chalk.green('▲')} ${s}`)
    }
  }

  if (bearSignals.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.red.bold('Bear Signals')}`)
    for (const s of bearSignals) {
      parts.push(`    ${chalk.red('▼')} ${s}`)
    }
  }

  if (keyVoices.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Key Voices')}`)
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
    parts.push(`  ${chalk.bold('Origin')}`)
    parts.push(`    @${origin.account}  ${origin.date}`)
    parts.push(
      `    ${chalk.dim(origin.content.length > 150 ? origin.content.slice(0, 150) + '...' : origin.content)}`,
    )
  }

  if (timeline.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Timeline')}`)
    for (const phase of timeline) {
      const amplifiers =
        phase.keyAmplifiers.length > 0
          ? ` — ${phase.keyAmplifiers.slice(0, 3).map((a) => `@${a}`).join(', ')}`
          : ''
      parts.push(
        `    ${phase.phase}  ${phase.tweetCount} tweets  ${chalk.dim(phase.timeframe)}${amplifiers}`,
      )
    }
  }

  if (mutations.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Mutations')}`)
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
    `  Sentiment: ${sentiment.avg} avg  (${chalk.green(`+${sentiment.positive}`)} / ${chalk.dim(String(sentiment.neutral))} / ${chalk.red(`-${sentiment.negative}`)})`,
  )

  if (topPosts.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Top Posts')}`)
    for (const p of topPosts.slice(0, 3)) {
      parts.push(`    @${p.author}  ${compactNum(p.engagement)} engagement`)
      parts.push(
        `      ${chalk.dim(p.text.length > 120 ? p.text.slice(0, 120) + '...' : p.text)}`,
      )
    }
  }

  if (narratives.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Narratives')}`)
    for (const n of narratives.slice(0, 5)) {
      parts.push(`    ${n.theme}  ${n.tweetCount} tweets  ${sentimentColor(n.avgSentiment)}`)
    }
  }

  if (webContext.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Web Context')}`)
    for (const c of webContext.slice(0, 3)) {
      parts.push(`    · ${c}`)
    }
  }

  if (outlook) {
    parts.push('')
    parts.push(`  ${chalk.bold('Outlook')}`)
    parts.push(`    ${outlook}`)
  }

  return parts.join('\n')
}

export function renderRead(data: ReadSnapshot): string {
  const { tweet, analysis, significance, signals } = data
  const parts: string[] = []

  const eng = tweet.engagement
  parts.push(`  @${tweet.author}  ${chalk.dim(tweet.postedAt)}`)
  parts.push(
    `  ${chalk.dim(`${eng.likes} likes · ${eng.retweets} RTs · ${eng.replies} replies · ${compactNum(eng.impressions)} views`)}`,
  )
  parts.push('')
  parts.push(`  ${tweet.text}`)
  parts.push('')

  const sigColor =
    significance === 'high' ? chalk.red : significance === 'medium' ? chalk.yellow : chalk.dim
  parts.push(`  Significance: ${sigColor(significance)}`)

  parts.push('')
  parts.push(`  ${chalk.bold('Analysis')}`)
  parts.push(`    ${analysis}`)

  if (signals.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Signals')}`)
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
  parts.push(`  ${chalk.bold('Recent Activity')}`)
  parts.push(
    `    ${recentActivity.postsAnalyzed} posts analyzed  ${compactNum(recentActivity.avgEngagement)} avg engagement`,
  )
  if (recentActivity.topTweet) {
    const tt = recentActivity.topTweet
    parts.push(
      `    Top: ${chalk.dim(tt.text.length > 100 ? tt.text.slice(0, 100) + '...' : tt.text)}  ${compactNum(tt.engagement)} eng`,
    )
  }

  if (contentPatterns.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Content Patterns')}`)
    for (const p of contentPatterns) {
      parts.push(`    · ${p}`)
    }
  }

  if (recentFocus.length > 0) {
    parts.push('')
    parts.push(`  ${chalk.bold('Recent Focus')}`)
    for (const f of recentFocus) {
      parts.push(`    · ${f}`)
    }
  }

  parts.push('')
  parts.push(`  Network: ${networkPosition}`)
  const influenceColor =
    influence === 'high' ? chalk.green : influence === 'medium' ? chalk.yellow : chalk.dim
  const signalColor =
    signalValue === 'high' ? chalk.green : signalValue === 'medium' ? chalk.yellow : chalk.dim
  parts.push(`  Influence: ${influenceColor(influence)}  Signal Value: ${signalColor(signalValue)}`)

  return parts.join('\n')
}
