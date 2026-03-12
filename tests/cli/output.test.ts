import { describe, it, expect } from 'vitest'
import {
  formatOutput,
  formatStructuredOutput,
  renderCitations,
  renderScan,
  renderPulse,
  renderTrace,
  renderRead,
  renderScope,
  renderAgentBrief,
  renderAgentBriefMd,
} from '../../src/cli/output.js'
import type { CommandResult, StructuredCommandResult } from '../../src/core/types.js'
import type {
  ScanSnapshot,
  PulseSnapshot,
  TraceSnapshot,
  ReadSnapshot,
  ScopeSnapshot,
  AgentBrief,
} from '../../src/core/schemas.js'

function makeResult(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    command: 'ask',
    query: 'test query',
    response: 'AI agents are trending on X today.',
    cost: 0.001,
    cached: false,
    timestamp: 1710000000000,
    ...overrides,
  }
}

describe('formatOutput', () => {
  describe('table', () => {
    it('includes response text', () => {
      expect(formatOutput(makeResult(), 'table')).toContain('AI agents are trending')
    })

    it('includes cost with 4 decimal places', () => {
      expect(formatOutput(makeResult(), 'table')).toContain('$0.0010')
    })

    it('shows (cached) instead of cost when cached', () => {
      const output = formatOutput(makeResult({ cached: true }), 'table')
      expect(output).toContain('(cached)')
      expect(output).not.toContain('$0.0010')
    })

    it('includes command name and query', () => {
      const output = formatOutput(makeResult(), 'table')
      expect(output).toContain('ask')
      expect(output).toContain('test query')
    })

    it('indents multi-line responses', () => {
      const output = formatOutput(makeResult({ response: 'line1\nline2\nline3' }), 'table')
      expect(output).toContain('  line1')
      expect(output).toContain('  line2')
      expect(output).toContain('  line3')
    })

    it('handles zero cost', () => {
      expect(formatOutput(makeResult({ cost: 0 }), 'table')).toContain('$0.0000')
    })
  })

  describe('json', () => {
    it('produces valid JSON', () => {
      expect(() => JSON.parse(formatOutput(makeResult(), 'json'))).not.toThrow()
    })

    it('contains all CommandResult fields', () => {
      const parsed = JSON.parse(formatOutput(makeResult(), 'json'))
      expect(parsed.command).toBe('ask')
      expect(parsed.query).toBe('test query')
      expect(parsed.response).toBe('AI agents are trending on X today.')
      expect(parsed.cost).toBe(0.001)
      expect(parsed.cached).toBe(false)
      expect(parsed.timestamp).toBe(1710000000000)
    })

    it('preserves boolean cached field', () => {
      const parsed = JSON.parse(formatOutput(makeResult({ cached: true }), 'json'))
      expect(parsed.cached).toBe(true)
    })

    it('preserves numeric types', () => {
      const parsed = JSON.parse(formatOutput(makeResult({ cost: 0 }), 'json'))
      expect(parsed.cost).toBe(0)
      expect(typeof parsed.cost).toBe('number')
      expect(typeof parsed.timestamp).toBe('number')
    })

    it('handles special characters in response', () => {
      const parsed = JSON.parse(
        formatOutput(makeResult({ response: 'said "hello" and \'goodbye\'' }), 'json'),
      )
      expect(parsed.response).toBe('said "hello" and \'goodbye\'')
    })

    it('handles newlines in response', () => {
      const parsed = JSON.parse(formatOutput(makeResult({ response: 'line1\nline2' }), 'json'))
      expect(parsed.response).toBe('line1\nline2')
    })
  })

  describe('csv', () => {
    it('has header row and data row', () => {
      const lines = formatOutput(makeResult(), 'csv').split('\n')
      expect(lines).toHaveLength(2)
      expect(lines[0]).toBe('command,query,response,cost,cached,timestamp')
    })

    it('escapes double quotes in query', () => {
      const output = formatOutput(makeResult({ query: 'what does "AI" mean?' }), 'csv')
      expect(output).toContain('"what does ""AI"" mean?"')
    })

    it('escapes double quotes in response', () => {
      const output = formatOutput(makeResult({ response: 'They said "yes"' }), 'csv')
      expect(output).toContain('"They said ""yes"""')
    })

    it('wraps query and response in quotes', () => {
      const dataRow = formatOutput(makeResult(), 'csv').split('\n')[1]
      expect(dataRow).toContain('"test query"')
      expect(dataRow).toContain('"AI agents are trending on X today."')
    })

    it('handles newlines in response', () => {
      const output = formatOutput(makeResult({ response: 'line1\nline2' }), 'csv')
      expect(output).toContain('"line1\nline2"')
    })

    it('includes all fields in correct order', () => {
      const dataRow = formatOutput(makeResult(), 'csv').split('\n')[1]
      expect(dataRow).toMatch(/^"ask",/)
      expect(dataRow).toContain('0.001')
      expect(dataRow).toContain('false')
      expect(dataRow).toContain('1710000000000')
    })
  })

  describe('markdown', () => {
    it('includes command as heading', () => {
      expect(formatOutput(makeResult(), 'md')).toContain('## ask')
    })

    it('includes query in bold', () => {
      expect(formatOutput(makeResult(), 'md')).toContain('**Query:** test query')
    })

    it('includes response text', () => {
      expect(formatOutput(makeResult(), 'md')).toContain('AI agents are trending on X today.')
    })

    it('shows "live" for non-cached result', () => {
      expect(formatOutput(makeResult({ cached: false }), 'md')).toContain('live')
    })

    it('shows "cached" for cached result', () => {
      const output = formatOutput(makeResult({ cached: true }), 'md')
      expect(output).toContain('cached')
      expect(output).not.toContain('live')
    })

    it('includes cost with 4 decimal places', () => {
      expect(formatOutput(makeResult({ cost: 0.00123 }), 'md')).toContain('$0.0012')
    })

    it('includes horizontal rule', () => {
      expect(formatOutput(makeResult(), 'md')).toContain('---')
    })

    it('preserves multi-line response', () => {
      expect(formatOutput(makeResult({ response: 'line1\nline2' }), 'md')).toContain('line1\nline2')
    })
  })

  it('falls back to table for unknown format', () => {
    const tableOutput = formatOutput(makeResult(), 'table')
    expect(formatOutput(makeResult(), 'anything' as 'table')).toBe(tableOutput)
  })

  it('handles empty response', () => {
    const result = makeResult({ response: '' })
    expect(() => formatOutput(result, 'table')).not.toThrow()
    expect(() => formatOutput(result, 'json')).not.toThrow()
    expect(() => formatOutput(result, 'csv')).not.toThrow()
    expect(() => formatOutput(result, 'md')).not.toThrow()
  })

  it('handles very small cost', () => {
    expect(formatOutput(makeResult({ cost: 0.00001 }), 'table')).toContain('$0.0000')
  })

  it('handles unicode in response', () => {
    const parsed = JSON.parse(
      formatOutput(makeResult({ response: 'Trending: 🔥 AI agents' }), 'json'),
    )
    expect(parsed.response).toBe('Trending: 🔥 AI agents')
  })
})

describe('renderCitations', () => {
  it('renders numbered source list', () => {
    const citations = [
      { type: 'url_citation', url: 'https://x.com/user/status/123', title: 'A tweet' },
      { type: 'url_citation', url: 'https://example.com/article' },
    ]
    const result = renderCitations(citations)
    expect(result).toContain('[1]')
    expect(result).toContain('x.com/user/status/123')
    expect(result).toContain('[2]')
    expect(result).toContain('example.com/article')
  })

  it('returns empty string for no citations', () => {
    expect(renderCitations([])).toBe('')
  })

  it('strips https:// prefix from URLs', () => {
    const result = renderCitations([
      { type: 'url_citation', url: 'https://x.com/foo/status/1' },
    ])
    expect(result).toContain('x.com/foo/status/1')
    expect(result).not.toContain('https://')
  })

  it('strips http:// prefix from URLs', () => {
    const result = renderCitations([
      { type: 'url_citation', url: 'http://example.com/article' },
    ])
    expect(result).toContain('example.com/article')
    expect(result).not.toContain('http://')
  })

  it('includes Sources heading', () => {
    const result = renderCitations([
      { type: 'url_citation', url: 'https://example.com' },
    ])
    expect(result).toContain('Sources')
  })
})

describe('renderScan', () => {
  const scan: ScanSnapshot = {
    metrics: { tweetCount: 42, totalEngagement: 5000, uniqueAuthors: 15, engagementPerTweet: 119 },
    sentiment: { avg: 0.3, positive: 20, neutral: 15, negative: 7 },
    topAccounts: [{ handle: 'alice', postCount: 5, followers: 10000, avgSentiment: 0.6 }],
    narratives: [{ theme: 'AI boom', description: 'AI sector growth', tweetCount: 30, avgSentiment: 0.4 }],
    signals: ['Strong bullish momentum'],
  }

  it('includes tweet count and engagement metrics', () => {
    const output = renderScan(scan)
    expect(output).toContain('42')
    expect(output).toContain('5,000')
  })

  it('includes top accounts', () => {
    const output = renderScan(scan)
    expect(output).toContain('@alice')
    expect(output).toContain('5 posts')
  })

  it('includes narratives', () => {
    const output = renderScan(scan)
    expect(output).toContain('AI boom')
    expect(output).toContain('AI sector growth')
  })

  it('includes signals', () => {
    const output = renderScan(scan)
    expect(output).toContain('Strong bullish momentum')
  })

  it('handles empty optional arrays', () => {
    const empty: ScanSnapshot = {
      metrics: { tweetCount: 0, totalEngagement: 0, uniqueAuthors: 0, engagementPerTweet: 0 },
      sentiment: { avg: 0, positive: 0, neutral: 0, negative: 0 },
      topAccounts: [],
      narratives: [],
      signals: [],
    }
    expect(() => renderScan(empty)).not.toThrow()
    const output = renderScan(empty)
    expect(output).not.toContain('Top Accounts')
    expect(output).not.toContain('Narratives')
    expect(output).not.toContain('Signals')
  })
})

describe('renderPulse', () => {
  const pulse: PulseSnapshot = {
    metrics: { tweetCount: 30, totalEngagement: 3000, uniqueAuthors: 10, engagementPerTweet: 100 },
    sentiment: { avg: -0.2, positive: 8, neutral: 12, negative: 10 },
    bullSignals: ['ETF inflows rising'],
    bearSignals: ['Whale selling detected'],
    keyVoices: [{ handle: 'bob', sentiment: -0.3, reach: 50000 }],
  }

  it('includes bull and bear signals', () => {
    const output = renderPulse(pulse)
    expect(output).toContain('ETF inflows rising')
    expect(output).toContain('Whale selling detected')
  })

  it('includes key voices', () => {
    const output = renderPulse(pulse)
    expect(output).toContain('@bob')
    expect(output).toContain('50K')
  })

  it('handles empty signals and voices', () => {
    const empty: PulseSnapshot = {
      ...pulse,
      bullSignals: [],
      bearSignals: [],
      keyVoices: [],
    }
    const output = renderPulse(empty)
    expect(output).not.toContain('Bull Signals')
    expect(output).not.toContain('Bear Signals')
    expect(output).not.toContain('Key Voices')
  })
})

describe('renderTrace', () => {
  const trace: TraceSnapshot = {
    metrics: { tweetCount: 20, totalEngagement: 2000, uniqueAuthors: 8, engagementPerTweet: 100 },
    origin: { account: 'origin_user', date: '2026-03-01', tweetId: '111', content: 'First claim' },
    timeline: [{ phase: 'Phase 1', tweetCount: 5, keyAmplifiers: ['amp1', 'amp2'], timeframe: 'Mar 1-2' }],
    mutations: [{ original: 'original claim', variant: 'mutated claim' }],
    reach: { totalTweets: 20, totalEngagement: 2000, uniqueAuthors: 8 },
  }

  it('includes origin info', () => {
    const output = renderTrace(trace)
    expect(output).toContain('@origin_user')
    expect(output).toContain('First claim')
  })

  it('includes timeline with amplifiers', () => {
    const output = renderTrace(trace)
    expect(output).toContain('Phase 1')
    expect(output).toContain('@amp1')
  })

  it('includes mutations', () => {
    const output = renderTrace(trace)
    expect(output).toContain('original claim')
    expect(output).toContain('mutated claim')
  })

  it('handles null origin', () => {
    const noOrigin: TraceSnapshot = { ...trace, origin: null as any }
    expect(() => renderTrace(noOrigin)).not.toThrow()
  })

  it('handles empty timeline and mutations', () => {
    const empty: TraceSnapshot = { ...trace, timeline: [], mutations: [] }
    const output = renderTrace(empty)
    expect(output).not.toContain('Timeline')
    expect(output).not.toContain('Mutations')
  })
})

describe('renderRead', () => {
  const read: ReadSnapshot = {
    tweet: {
      id: '12345',
      author: 'testuser',
      text: 'Important tweet content',
      engagement: { likes: 100, retweets: 20, replies: 5, impressions: 5000 },
      postedAt: '2026-03-10T12:00:00Z',
    },
    analysis: 'This tweet signals market shift',
    significance: 'high',
    signals: ['Potential reversal'],
  }

  it('includes tweet author and text', () => {
    const output = renderRead(read)
    expect(output).toContain('@testuser')
    expect(output).toContain('Important tweet content')
  })

  it('includes engagement metrics', () => {
    const output = renderRead(read)
    expect(output).toContain('100 likes')
    expect(output).toContain('20 RTs')
  })

  it('includes analysis and significance', () => {
    const output = renderRead(read)
    expect(output).toContain('This tweet signals market shift')
    expect(output).toContain('high')
  })

  it('includes signals', () => {
    const output = renderRead(read)
    expect(output).toContain('Potential reversal')
  })
})

describe('renderScope', () => {
  const scope: ScopeSnapshot = {
    account: { handle: 'testuser', followers: 50000, following: 500, tweetCount: 3000 },
    recentActivity: {
      avgEngagement: 150,
      postsAnalyzed: 20,
      topTweet: { id: '555', text: 'Best tweet ever', engagement: 500 },
    },
    contentPatterns: ['AI', 'crypto'],
    recentFocus: ['LLMs', 'DeFi'],
    networkPosition: 'Tech influencer',
    influence: 'high',
    signalValue: 'medium',
  }

  it('includes account info', () => {
    const output = renderScope(scope)
    expect(output).toContain('@testuser')
    expect(output).toContain('50K followers')
  })

  it('includes recent activity', () => {
    const output = renderScope(scope)
    expect(output).toContain('20 posts analyzed')
    expect(output).toContain('Best tweet ever')
  })

  it('includes content patterns and focus', () => {
    const output = renderScope(scope)
    expect(output).toContain('AI')
    expect(output).toContain('LLMs')
  })

  it('handles null topTweet', () => {
    const noTop: ScopeSnapshot = {
      ...scope,
      recentActivity: { ...scope.recentActivity, topTweet: null },
    }
    expect(() => renderScope(noTop)).not.toThrow()
  })

  it('handles empty content patterns and focus', () => {
    const empty: ScopeSnapshot = {
      ...scope,
      contentPatterns: [],
      recentFocus: [],
    }
    const output = renderScope(empty)
    expect(output).not.toContain('Content Patterns')
    expect(output).not.toContain('Recent Focus')
  })
})

describe('renderAgentBrief', () => {
  const brief: AgentBrief = {
    signalLine: 'Bitcoin is cautiously bullish',
    sentiment: 0.3,
    summary: ['Finding 1', 'Finding 2'],
    contradictions: ['Contradiction A'],
    keyAccounts: [{ handle: 'alice', reach: 5000, sentiment: 0.5, stance: 'Bullish' }],
    evidence: [{ source: 'scan', key: 'Sentiment', detail: 'Net positive' }],
    confidence: { overall: 0.7, volume: 'moderate' as const, consistency: 0.1, diversity: 0.8 },
    sampleSize: 50,
    staleness: null,
    citations: [],
  }
  const opts = { stepCount: 3, durationMs: 5000, tweetCount: 50, accountCount: 15, cost: 0.01 }

  it('includes signal line', () => {
    const output = renderAgentBrief(brief, opts)
    expect(output).toContain('Bitcoin is cautiously bullish')
  })

  it('includes key findings', () => {
    const output = renderAgentBrief(brief, opts)
    expect(output).toContain('Finding 1')
    expect(output).toContain('Finding 2')
  })

  it('includes contradictions', () => {
    const output = renderAgentBrief(brief, opts)
    expect(output).toContain('Contradiction A')
  })

  it('includes key accounts with stance', () => {
    const output = renderAgentBrief(brief, opts)
    expect(output).toContain('@alice')
    expect(output).toContain('Bullish')
  })

  it('includes footer with stats', () => {
    const output = renderAgentBrief(brief, opts)
    expect(output).toContain('3 steps')
    expect(output).toContain('5.0s')
    expect(output).toContain('$0.0100')
  })

  it('shows staleness warning when > 1 hour', () => {
    const staleBrief = { ...brief, staleness: 7200_000 } // 2 hours
    const output = renderAgentBrief(staleBrief, opts)
    expect(output).toContain('stale')
    expect(output).toContain('2h ago')
  })

  it('does not show staleness warning when null', () => {
    const output = renderAgentBrief(brief, opts)
    expect(output).not.toContain('stale')
  })

  it('shows previous sentiment comparison when provided', () => {
    const output = renderAgentBrief(brief, { ...opts, previousSentiment: -0.2 })
    expect(output).toContain('was -0.2')
  })

  it('handles empty summary, contradictions, accounts', () => {
    const emptyBrief: AgentBrief = {
      ...brief,
      summary: [],
      contradictions: [],
      keyAccounts: [],
    }
    const output = renderAgentBrief(emptyBrief, opts)
    expect(output).not.toContain('Key Findings')
    expect(output).not.toContain('Top Voices')
    expect(output).not.toContain('Contradictions')
  })
})

describe('renderAgentBriefMd', () => {
  const brief: AgentBrief = {
    signalLine: 'Bitcoin is cautiously bullish',
    sentiment: 0.3,
    summary: ['Finding 1'],
    contradictions: ['Issue A'],
    keyAccounts: [{ handle: 'alice', reach: 5000, sentiment: 0.5, stance: 'Bullish' }],
    evidence: [],
    confidence: { overall: 0.7, volume: 'moderate' as const, consistency: 0.1, diversity: 0.8 },
    sampleSize: 50,
    staleness: null,
    citations: [],
  }
  const opts = { stepCount: 3, durationMs: 5000, tweetCount: 50, accountCount: 15, cost: 0.01 }

  it('renders markdown heading with signal line', () => {
    const output = renderAgentBriefMd(brief, opts)
    expect(output).toContain('## Bitcoin is cautiously bullish')
  })

  it('renders markdown table for key accounts', () => {
    const output = renderAgentBriefMd(brief, opts)
    expect(output).toContain('| @alice | 5K | 0.5 | Bullish |')
  })

  it('renders contradictions as list items', () => {
    const output = renderAgentBriefMd(brief, opts)
    expect(output).toContain('- Issue A')
  })

  it('includes confidence footer', () => {
    const output = renderAgentBriefMd(brief, opts)
    expect(output).toContain('Confidence: 0.7')
    expect(output).toContain('moderate')
  })
})

describe('formatStructuredOutput', () => {
  function makeStructuredResult(overrides: Partial<StructuredCommandResult<ScanSnapshot>> = {}): StructuredCommandResult<ScanSnapshot> {
    return {
      command: 'scan',
      topic: 'bitcoin',
      data: {
        metrics: { tweetCount: 10, totalEngagement: 500, uniqueAuthors: 5, engagementPerTweet: 50 },
        sentiment: { avg: 0.3, positive: 5, neutral: 3, negative: 2 },
        topAccounts: [],
        narratives: [],
        signals: [],
      },
      cost: 0.003,
      timestamp: 1710000000000,
      diff: [],
      timeSinceLast: 0,
      citations: [],
      ...overrides,
    }
  }

  it('json format includes command, topic, data, cost, timestamp', () => {
    const output = formatStructuredOutput(makeStructuredResult(), 'json', renderScan)
    const parsed = JSON.parse(output)
    expect(parsed.command).toBe('scan')
    expect(parsed.topic).toBe('bitcoin')
    expect(parsed.data.metrics.tweetCount).toBe(10)
    expect(parsed.cost).toBe(0.003)
  })

  it('csv format includes header and data row', () => {
    const output = formatStructuredOutput(makeStructuredResult(), 'csv', renderScan)
    const lines = output.split('\n')
    expect(lines[0]).toBe('command,topic,data,cost,timestamp')
    expect(lines[1]).toContain('"scan"')
    expect(lines[1]).toContain('"bitcoin"')
  })

  it('md format includes heading and cost', () => {
    const output = formatStructuredOutput(makeStructuredResult(), 'md', renderScan)
    expect(output).toContain('## scan')
    expect(output).toContain('**Topic:** bitcoin')
    expect(output).toContain('$0.0030')
  })

  it('table format includes command, topic, and rendered snapshot', () => {
    const output = formatStructuredOutput(makeStructuredResult(), 'table', renderScan)
    expect(output).toContain('scan')
    expect(output).toContain('bitcoin')
    expect(output).toContain('$0.0030')
  })

  it('table format includes citations when present', () => {
    const result = makeStructuredResult({
      citations: [
        { type: 'url_citation', url: 'https://x.com/user/status/123', title: 'A tweet' },
      ],
    })
    const output = formatStructuredOutput(result, 'table', renderScan)
    expect(output).toContain('Sources')
    expect(output).toContain('x.com/user/status/123')
  })

  it('table format omits citations when empty', () => {
    const output = formatStructuredOutput(makeStructuredResult(), 'table', renderScan)
    expect(output).not.toContain('Sources')
  })
})
