import { describe, it, expect } from 'vitest'
import type {
  SentimentBreakdown,
  AccountEntry,
  StoredSnapshot,
  AgentBrief,
  ScanSnapshot,
} from '../../src/core/schemas.js'


describe('SentimentBreakdown.rawAvg', () => {
  it('accepts rawAvg as optional', () => {
    const s: SentimentBreakdown = { avg: 0.5, positive: 3, neutral: 2, negative: 1 }
    expect(s.rawAvg).toBeUndefined()
  })

  it('accepts rawAvg when provided', () => {
    const s: SentimentBreakdown = { avg: 0.5, rawAvg: 0.4, positive: 3, neutral: 2, negative: 1 }
    expect(s.rawAvg).toBe(0.4)
  })
})

describe('AccountEntry.engagementScore', () => {
  it('accepts engagementScore as optional', () => {
    const a: AccountEntry = { handle: 'alice', postCount: 5, followers: 1000, avgSentiment: 0.3 }
    expect(a.engagementScore).toBeUndefined()
  })

  it('accepts engagementScore when provided', () => {
    const a: AccountEntry = {
      handle: 'alice',
      postCount: 5,
      followers: 1000,
      avgSentiment: 0.3,
      engagementScore: 4500,
    }
    expect(a.engagementScore).toBe(4500)
  })
})

describe('StoredSnapshot.citations', () => {
  it('accepts citations as optional', () => {
    const s: StoredSnapshot<ScanSnapshot> = {
      command: 'scan',
      topic: 'test',
      data: {} as ScanSnapshot,
      raw: '',
      timestamp: 1,
      cost: 0,
    }
    expect(s.citations).toBeUndefined()
  })
})

describe('AgentBrief.citations', () => {
  it('has citations array', () => {
    const b: AgentBrief = {
      signalLine: 'test',
      sentiment: 0,
      summary: [],
      contradictions: [],
      keyAccounts: [],
      evidence: [],
      confidence: { overall: 0, volume: 'low', consistency: 0, diversity: 0 },
      sampleSize: 0,
      staleness: null,
      citations: [{ type: 'url_citation', url: 'https://x.com' }],
    }
    expect(b.citations).toHaveLength(1)
  })
})
