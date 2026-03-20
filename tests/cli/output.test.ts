import { describe, it, expect } from 'vitest'
import {
  formatOutput,
  formatStructuredOutput,
  renderCitations,
  renderScan,
  renderPulse,
  renderTrace,
  renderProfile,
  renderHooks,
  renderTiming,
  renderAgentBrief,
  renderAgentBriefMd,
} from '../../src/cli/output.js'
import type { CommandResult, StructuredCommandResult } from '../../src/core/types.js'
import type {
  ScanSnapshot,
  PulseSnapshot,
  TraceSnapshot,
  ProfileSnapshot,
  HooksSnapshot,
  TimingSnapshot,
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
    takeaway: 'AI discourse is heating up with strong bullish momentum',
    actions: ['Reply to @alice thread on AI growth'],
    metrics: { tweetCount: 42, totalEngagement: 5000, uniqueAuthors: 15, engagementPerTweet: 119 },
    sentiment: { avg: 0.3, positive: 20, neutral: 15, negative: 7 },
    topAccounts: [{ handle: 'alice', postCount: 5, followers: 10000, avgSentiment: 0.6 }],
    narratives: [{ theme: 'AI boom', description: 'AI sector growth', tweetCount: 30, avgSentiment: 0.4 }],
    signals: ['Strong bullish momentum'],
  }

  it('renders takeaway at the top', () => {
    const output = renderScan(scan)
    expect(output).toContain('AI discourse is heating up')
  })

  it('renders action items', () => {
    const output = renderScan(scan)
    expect(output).toContain('Reply to @alice')
  })

  it('includes tweet count in details', () => {
    const output = renderScan(scan)
    expect(output).toContain('42 tweets')
  })

  it('includes top accounts', () => {
    const output = renderScan(scan)
    expect(output).toContain('@alice')
    expect(output).toContain('10K followers')
  })

  it('includes narratives with bars', () => {
    const output = renderScan(scan)
    expect(output).toContain('AI boom')
    expect(output).toContain('30 tweets')
  })

  it('includes signals', () => {
    const output = renderScan(scan)
    expect(output).toContain('Strong bullish momentum')
  })

  it('handles empty optional arrays', () => {
    const empty: ScanSnapshot = {
      takeaway: '',
      actions: [],
      metrics: { tweetCount: 0, totalEngagement: 0, uniqueAuthors: 0, engagementPerTweet: 0 },
      sentiment: { avg: 0, positive: 0, neutral: 0, negative: 0 },
      topAccounts: [],
      narratives: [],
      signals: [],
    }
    expect(() => renderScan(empty)).not.toThrow()
  })
})

describe('renderPulse', () => {
  const pulse: PulseSnapshot = {
    takeaway: 'Sentiment is contested — bulls and bears are evenly matched',
    actions: ['Post a balanced analysis to stand out from the noise'],
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

describe('renderProfile', () => {
  const profile: ProfileSnapshot = {
    handle: 'RogGriff',
    displayName: 'Roger Griffin',
    followers: 5200,
    following: 340,
    postFrequency: { postsPerWeek: 7, activeDays: ['Monday', 'Wednesday', 'Friday'], peakHours: [9, 14, 20] },
    contentMix: [
      { category: 'TypeScript', percentage: 40, avgEngagement: 120 },
      { category: 'AI Agents', percentage: 35, avgEngagement: 200 },
    ],
    topPerformers: [
      { url: 'https://x.com/RogGriff/status/1', content: 'Thread about building CLI agents', engagement: 500, why: 'Threads get 3x engagement' },
    ],
    voiceTraits: { tone: 'casual technical', vocabulary: 'developer jargon', emojiUsage: 'minimal', avgLength: 180 },
    algorithmScore: { replyRate: 0.42, authorReplyRate: 0.71, conversationRatio: 0.31, bookmarkToLikeRatio: 0.12, grade: 'A' },
    recommendations: ['Post more threads', 'Engage in morning hours'],
    sentiment: 0.35,
    fetchedAt: '2026-03-19T12:00:00Z',
  }

  it('renders handle and follower count', () => {
    const output = renderProfile(profile)
    expect(output).toContain('@RogGriff')
    expect(output).toContain('5K followers')
    expect(output).toContain('340 following')
  })

  it('renders display name when different from handle', () => {
    const output = renderProfile(profile)
    expect(output).toContain('Roger Griffin')
  })

  it('omits display name when same as handle', () => {
    const sameNameProfile = { ...profile, displayName: 'RogGriff' }
    const output = renderProfile(sameNameProfile)
    // handle line has @RogGriff, but display name line should not duplicate it
    const lines = output.split('\n')
    const displayNameLines = lines.filter((l: string) => l.trim() === 'RogGriff')
    expect(displayNameLines).toHaveLength(0)
  })

  it('renders posting cadence', () => {
    const output = renderProfile(profile)
    expect(output).toContain('7 posts/week')
    expect(output).toContain('Monday, Wednesday, Friday')
    expect(output).toContain('9:00')
    expect(output).toContain('14:00')
  })

  it('renders content mix categories', () => {
    const output = renderProfile(profile)
    expect(output).toContain('TypeScript')
    expect(output).toContain('40%')
    expect(output).toContain('AI Agents')
    expect(output).toContain('35%')
  })

  it('renders top performers with truncation', () => {
    const longContent = 'A'.repeat(150)
    const longProfile = {
      ...profile,
      topPerformers: [{ url: '', content: longContent, engagement: 100, why: 'reason' }],
    }
    const output = renderProfile(longProfile)
    expect(output).toContain('A'.repeat(120) + '...')
    expect(output).not.toContain('A'.repeat(121))
  })

  it('renders voice traits', () => {
    const output = renderProfile(profile)
    expect(output).toContain('casual technical')
    expect(output).toContain('developer jargon')
    expect(output).toContain('minimal')
    expect(output).toContain('180 chars')
  })

  it('renders sentiment with color formatting', () => {
    const output = renderProfile(profile)
    // sentimentColor formats positive values with +
    expect(output).toContain('Sentiment')
  })

  it('renders recommendations when present', () => {
    const output = renderProfile(profile)
    expect(output).toContain('Recommendations')
    expect(output).toContain('Post more threads')
    expect(output).toContain('Engage in morning hours')
  })

  it('omits recommendations section when undefined', () => {
    const noRecs = { ...profile, recommendations: undefined }
    const output = renderProfile(noRecs)
    expect(output).not.toContain('Recommendations')
  })

  it('omits recommendations section when empty array', () => {
    const emptyRecs = { ...profile, recommendations: [] }
    const output = renderProfile(emptyRecs)
    expect(output).not.toContain('Recommendations')
  })

  it('handles all empty arrays gracefully', () => {
    const minimal: ProfileSnapshot = {
      handle: 'empty',
      displayName: 'empty',
      followers: 0,
      following: 0,
      postFrequency: { postsPerWeek: 0, activeDays: [], peakHours: [] },
      contentMix: [],
      topPerformers: [],
      voiceTraits: { tone: '', vocabulary: '', emojiUsage: '', avgLength: 0 },
      algorithmScore: { replyRate: 0, authorReplyRate: 0, conversationRatio: 0, bookmarkToLikeRatio: 0, grade: 'N/A' },
      sentiment: 0,
      fetchedAt: '2026-03-19T00:00:00Z',
    }
    const output = renderProfile(minimal)
    expect(output).toContain('@empty')
    expect(output).toContain('0 followers')
    expect(output).not.toContain('Content Mix')
    expect(output).not.toContain('Top Performers')
    expect(output).not.toContain('Voice')
  })

  it('renders negative sentiment correctly', () => {
    const negProfile = { ...profile, sentiment: -0.42 }
    const output = renderProfile(negProfile)
    expect(output).toContain('Sentiment')
  })

  it('omits peak hours line when peakHours is empty', () => {
    const noPeaks = { ...profile, postFrequency: { ...profile.postFrequency, peakHours: [] } }
    const output = renderProfile(noPeaks)
    expect(output).not.toContain('Peak hours')
  })

  it('renders algorithm health section with grade', () => {
    const output = renderProfile(profile)
    expect(output).toContain('Algorithm Health')
    expect(output).toContain('A')
  })

  it('renders algorithm metrics with percentages', () => {
    const output = renderProfile(profile)
    expect(output).toContain('Reply rate')
    expect(output).toContain('42%')
    expect(output).toContain('Author replies')
    expect(output).toContain('71%')
    expect(output).toContain('Conversations')
    expect(output).toContain('31%')
    expect(output).toContain('Bookmark/like')
    expect(output).toContain('12.0%')
  })

  it('renders algorithm weight annotations', () => {
    const output = renderProfile(profile)
    expect(output).toContain('27x likes')
    expect(output).toContain('75x weight')
    expect(output).toContain('150x a like')
    expect(output).toContain('20x likes')
  })

  it('omits algorithm section when grade is N/A', () => {
    const noAlgo = { ...profile, algorithmScore: { ...profile.algorithmScore, grade: 'N/A' } }
    const output = renderProfile(noAlgo)
    expect(output).not.toContain('Algorithm Health')
  })

  it('omits bookmark/like row when ratio is 0', () => {
    const noBm = { ...profile, algorithmScore: { ...profile.algorithmScore, bookmarkToLikeRatio: 0 } }
    const output = renderProfile(noBm)
    expect(output).not.toContain('Bookmark/like')
  })
})

describe('renderHooks', () => {
  const hooks: HooksSnapshot = {
    topic: 'TypeScript CLI',
    opportunities: [
      {
        tweetUrl: 'https://x.com/alice/status/1',
        author: 'alice',
        authorFollowers: 5000,
        content: 'Hot take on TypeScript tooling',
        engagement: { likes: 50, retweets: 10, replies: 3 },
        suggestedAngle: 'Share your CLI agent experience',
        opportunityScore: 0.9,
      },
      {
        tweetUrl: 'https://x.com/bob/status/2',
        author: 'bob',
        authorFollowers: 12000,
        content: 'AI agents are changing everything',
        engagement: { likes: 200, retweets: 40, replies: 15 },
        suggestedAngle: 'Mention your agent pipeline',
        opportunityScore: 0.75,
      },
    ],
    fetchedAt: '2026-03-19T12:00:00Z',
  }

  it('renders opportunity count and topic', () => {
    const output = renderHooks(hooks)
    expect(output).toContain('2 opportunities')
    expect(output).toContain('TypeScript CLI')
  })

  it('renders author and follower count', () => {
    const output = renderHooks(hooks)
    expect(output).toContain('@alice')
    expect(output).toContain('5K followers')
    expect(output).toContain('@bob')
    expect(output).toContain('12K followers')
  })

  it('renders engagement metrics', () => {
    const output = renderHooks(hooks)
    expect(output).toContain('50 likes')
    expect(output).toContain('200 likes')
  })

  it('renders suggested angle', () => {
    const output = renderHooks(hooks)
    expect(output).toContain('Share your CLI agent experience')
    expect(output).toContain('Mention your agent pipeline')
  })

  it('renders opportunity score as percentage', () => {
    const output = renderHooks(hooks)
    expect(output).toContain('90%')
    expect(output).toContain('75%')
  })

  it('renders tweet URLs', () => {
    const output = renderHooks(hooks)
    expect(output).toContain('https://x.com/alice/status/1')
  })

  it('truncates long content at 140 chars', () => {
    const longHooks: HooksSnapshot = {
      ...hooks,
      opportunities: [{
        ...hooks.opportunities[0],
        content: 'A'.repeat(160),
      }],
    }
    const output = renderHooks(longHooks)
    expect(output).toContain('A'.repeat(140) + '...')
  })

  it('handles empty opportunities', () => {
    const empty: HooksSnapshot = { topic: 'nothing', opportunities: [], fetchedAt: '2026-03-19T00:00:00Z' }
    const output = renderHooks(empty)
    expect(output).toContain('0 opportunities')
    expect(output).toContain('No reply opportunities found')
  })
})

describe('renderTiming', () => {
  const timing: TimingSnapshot = {
    handle: 'alice',
    peakWindows: [
      { day: 'Monday', hour: 9, score: 0.95 },
      { day: 'Wednesday', hour: 14, score: 0.6 },
      { day: 'Friday', hour: 20, score: 0.3 },
    ],
    recommendations: ['Post at 9am UTC on Mondays', 'Avoid weekends'],
    sampleSize: 50,
    fetchedAt: '2026-03-20T00:00:00Z',
  }

  it('renders handle in label', () => {
    const output = renderTiming(timing)
    expect(output).toContain('@alice')
  })

  it('renders topic when handle is absent', () => {
    const topicTiming: TimingSnapshot = { ...timing, handle: undefined, topic: 'AI agents' }
    const output = renderTiming(topicTiming)
    expect(output).toContain('AI agents')
  })

  it('renders peak windows with day and hour', () => {
    const output = renderTiming(timing)
    expect(output).toContain('Monday')
    expect(output).toContain('9')
    expect(output).toContain('Wednesday')
    expect(output).toContain('14')
  })

  it('renders score percentages', () => {
    const output = renderTiming(timing)
    expect(output).toContain('95%')
    expect(output).toContain('60%')
    expect(output).toContain('30%')
  })

  it('renders recommendations', () => {
    const output = renderTiming(timing)
    expect(output).toContain('Post at 9am UTC on Mondays')
    expect(output).toContain('Avoid weekends')
  })

  it('renders sample size when > 0', () => {
    const output = renderTiming(timing)
    expect(output).toContain('50 posts')
  })

  it('handles empty peakWindows', () => {
    const empty: TimingSnapshot = { ...timing, peakWindows: [] }
    const output = renderTiming(empty)
    expect(output).not.toContain('Peak Windows')
  })

  it('handles empty recommendations', () => {
    const noRecs: TimingSnapshot = { ...timing, recommendations: [] }
    const output = renderTiming(noRecs)
    expect(output).not.toContain('Recommendations')
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
        takeaway: 'test takeaway',
        actions: [],
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
