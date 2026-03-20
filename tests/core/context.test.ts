import { describe, it, expect } from 'vitest'
import { buildContextSummary } from '../../src/core/context.js'
import type { ContextEntry } from '../../src/tui/hooks/use-session.js'
import type { ScanSnapshot, PulseSnapshot, HooksSnapshot, TraceSnapshot, ProfileSnapshot, ReviewSnapshot, TimingSnapshot } from '../../src/core/schemas.js'

const scanSnapshot: ScanSnapshot = {
  takeaway: 'AI agent discourse is heating up',
  actions: ['Post about agent architectures', 'Reply to @techdev thread', 'Track sentiment shift'],
  metrics: { tweetCount: 45, totalEngagement: 12000, uniqueAuthors: 30, engagementPerTweet: 267 },
  sentiment: { avg: 0.42, positive: 20, neutral: 15, negative: 10 },
  topAccounts: [{ handle: 'techdev', postCount: 5, followers: 8000, avgSentiment: 0.6 }],
  narratives: [{ theme: 'agent frameworks', description: 'Discussion of agent SDKs', tweetCount: 15, avgSentiment: 0.5 }],
  signals: ['rising interest in multi-agent systems', 'TypeScript agent SDKs trending'],
}

const pulseSnapshot: PulseSnapshot = {
  takeaway: 'Bullish momentum on AI agents',
  actions: ['Monitor for reversal'],
  metrics: { tweetCount: 30, totalEngagement: 8000, uniqueAuthors: 20, engagementPerTweet: 267 },
  sentiment: { avg: 0.65, positive: 22, neutral: 5, negative: 3 },
  bullSignals: ['Venture funding announcements', 'Developer interest spiking'],
  bearSignals: ['Hype cycle concerns'],
  keyVoices: [{ handle: 'aidev', sentiment: 0.8, reach: 5000 }],
}

const hooksSnapshot: HooksSnapshot = {
  topic: 'AI agents',
  opportunities: [
    {
      tweetUrl: 'https://x.com/dev1/status/123',
      author: 'dev1',
      authorFollowers: 5000,
      content: 'Building my first AI agent with TypeScript',
      engagement: { likes: 45, retweets: 10, replies: 2 },
      suggestedAngle: 'Share your agent architecture experience',
      opportunityScore: 0.9,
    },
    {
      tweetUrl: 'https://x.com/dev2/status/456',
      author: 'dev2',
      authorFollowers: 3000,
      content: 'What framework should I use for agents?',
      engagement: { likes: 30, retweets: 5, replies: 1 },
      suggestedAngle: 'Recommend Corvus and explain why CLI-first matters',
      opportunityScore: 0.85,
    },
  ],
  fetchedAt: new Date().toISOString(),
}

const traceSnapshot: TraceSnapshot = {
  metrics: { tweetCount: 25, totalEngagement: 5000, uniqueAuthors: 15, engagementPerTweet: 200 },
  origin: { account: 'founder', date: '2025-01-15', tweetId: '123', content: 'original claim' },
  timeline: [
    { phase: 'emergence', tweetCount: 5, keyAmplifiers: ['@early'], timeframe: 'Jan 15-16' },
  ],
  mutations: [{ original: 'AI will replace devs', variant: 'AI will augment devs' }],
  reach: { totalTweets: 25, totalEngagement: 5000, uniqueAuthors: 15 },
}

const profileSnapshot: ProfileSnapshot = {
  handle: 'roggriff',
  displayName: 'Roger Griffin',
  followers: 500,
  following: 200,
  postFrequency: { postsPerWeek: 3, activeDays: ['Mon', 'Wed', 'Fri'], peakHours: [9, 14, 20] },
  contentMix: [{ category: 'tech', percentage: 60, avgEngagement: 50 }],
  topPerformers: [],
  voiceTraits: { tone: 'direct', vocabulary: 'technical', emojiUsage: 'minimal', avgLength: 150 },
  algorithmScore: { replyRate: 0.3, authorReplyRate: 0.1, conversationRatio: 0.2, bookmarkToLikeRatio: 0.05, grade: 'B' },
  recommendations: ['Reply more to boost reply rate', 'Start conversations'],
  sentiment: 0.4,
  fetchedAt: new Date().toISOString(),
}

const reviewSnapshot: ReviewSnapshot = {
  handle: 'roggriff',
  period: { from: '2025-01-01', to: '2025-01-07' },
  totalPosts: 10,
  totalEngagement: 500,
  avgEngagementPerPost: 50,
  topPosts: [],
  underperformers: [],
  patterns: [{ pattern: 'Short posts get less engagement', impact: 'negative' }],
  recommendations: ['Write longer posts with hooks', 'Post during peak hours'],
  fetchedAt: new Date().toISOString(),
}

const timingSnapshot: TimingSnapshot = {
  handle: 'roggriff',
  topic: 'AI agents',
  peakWindows: [
    { day: 'Tuesday', hour: 9, score: 0.95 },
    { day: 'Wednesday', hour: 14, score: 0.88 },
    { day: 'Friday', hour: 20, score: 0.82 },
  ],
  recommendations: ['Post on Tuesday mornings for max reach'],
  sampleSize: 50,
  fetchedAt: new Date().toISOString(),
}

function entry(command: string, snapshot: any): ContextEntry {
  return { command, topic: 'AI agents', snapshot, timestamp: Date.now() }
}

describe('buildContextSummary', () => {
  it('returns empty string for empty entries', () => {
    expect(buildContextSummary([])).toBe('')
  })

  it('summarizes scan context', () => {
    const result = buildContextSummary([entry('scan', scanSnapshot)])
    expect(result).toContain('[scan]')
    expect(result).toContain('AI agent discourse is heating up')
    expect(result).toContain('0.42')
  })

  it('summarizes pulse context', () => {
    const result = buildContextSummary([entry('pulse', pulseSnapshot)])
    expect(result).toContain('[pulse]')
    expect(result).toContain('Bullish momentum')
    expect(result).toContain('0.65')
  })

  it('summarizes hooks context', () => {
    const result = buildContextSummary([entry('hooks', hooksSnapshot)])
    expect(result).toContain('[hooks]')
    expect(result).toContain('@dev1')
    expect(result).toContain('45 likes')
  })

  it('summarizes trace context', () => {
    const result = buildContextSummary([entry('trace', traceSnapshot)])
    expect(result).toContain('[trace]')
    expect(result).toContain('@founder')
    expect(result).toContain('1 mutations')
  })

  it('summarizes profile context', () => {
    const result = buildContextSummary([entry('profile', profileSnapshot)])
    expect(result).toContain('[profile]')
    expect(result).toContain('@roggriff')
    expect(result).toContain('grade: B')
  })

  it('summarizes review context', () => {
    const result = buildContextSummary([entry('review', reviewSnapshot)])
    expect(result).toContain('[review]')
    expect(result).toContain('10 posts reviewed')
  })

  it('summarizes timing context', () => {
    const result = buildContextSummary([entry('timing', timingSnapshot)])
    expect(result).toContain('[timing]')
    expect(result).toContain('Tuesday')
  })

  it('combines multiple entries', () => {
    const result = buildContextSummary([
      entry('scan', scanSnapshot),
      entry('hooks', hooksSnapshot),
    ])
    expect(result).toContain('[scan]')
    expect(result).toContain('[hooks]')
    expect(result).toContain('Prior context from this session')
  })

  it('caps output at 2000 characters', () => {
    const entries = Array.from({ length: 20 }, () => entry('scan', scanSnapshot))
    const result = buildContextSummary(entries)
    expect(result.length).toBeLessThanOrEqual(2000)
    expect(result).toMatch(/\.\.\.$/m)
  })
})
