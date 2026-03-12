import { describe, it, expect, vi } from 'vitest'
import { executeStructuredQuery } from '../../src/core/orchestrator.js'
import type { BuildResult } from '../../src/core/types.js'
import type { ScanSnapshot } from '../../src/core/schemas.js'

const scanData: ScanSnapshot = {
  metrics: { tweetCount: 10, totalEngagement: 500, uniqueAuthors: 8, engagementPerTweet: 50 },
  sentiment: { avg: 0.3, positive: 5, neutral: 3, negative: 2 },
  topAccounts: [{ handle: 'alice', postCount: 3, followers: 5000, avgSentiment: 0.5 }],
  narratives: [{ theme: 'test', description: 'Narrative', tweetCount: 10, avgSentiment: 0.3 }],
  signals: ['Signal 1'],
}

const buildResult: BuildResult<ScanSnapshot> = {
  data: scanData,
  raw: '{}',
  cost: 0.003,
  tweets: [],
  scores: [],
  newestTweetAt: null,
}

vi.mock('../../src/core/snapshots.js', () => {
  class MockStore {
    loadLatest() { return null }
    save(_cmd: string, _topic: string, data: any, raw: string, cost: number, _tweets?: any[], _scores?: any[]) {
      return { command: _cmd, topic: _topic, data, raw, cost, timestamp: 1000 }
    }
  }
  return { SnapshotStore: MockStore }
})

describe('executeStructuredQuery', () => {
  it('returns snapshot data and cost', async () => {
    const result = await executeStructuredQuery({
      command: 'scan',
      topic: 'bitcoin',
      matchKeys: {},
      buildSnapshot: async () => buildResult,
      baseDir: '/tmp/.corvus',
    })

    expect(result.data).toEqual(scanData)
    expect(result.cost).toBe(0.003)
    expect(result.timestamp).toBe(1000)
  })

  it('returns empty diff when no previous snapshot', async () => {
    const result = await executeStructuredQuery({
      command: 'scan',
      topic: 'bitcoin',
      matchKeys: {},
      buildSnapshot: async () => buildResult,
      baseDir: '/tmp/.corvus',
    })

    expect(result.diff).toEqual([])
    expect(result.timeSinceLast).toBe(0)
  })

  it('propagates builder errors', async () => {
    await expect(
      executeStructuredQuery({
        command: 'scan',
        topic: 'bitcoin',
        matchKeys: {},
        buildSnapshot: async () => { throw new Error('Grok API down') },
        baseDir: '/tmp/.corvus',
      }),
    ).rejects.toThrow('Grok API down')
  })
})
