import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Command } from 'commander'
import { registerExportCommand } from '../../../src/cli/commands/export.js'

const mockListTopics = vi.fn()
const mockLoadLatest = vi.fn()
const mockLoadAll = vi.fn()

vi.mock('../../../src/core/snapshots.js', () => ({
  SnapshotStore: class MockSnapshotStore {
    listTopics = mockListTopics
    loadLatest = mockLoadLatest
    loadAll = mockLoadAll
  },
}))

vi.mock('../../../src/infra/config.js', () => ({
  ConfigManager: {
    defaultDir: vi.fn(() => '/tmp/corvus-test'),
  },
}))

function makeScanSnapshot(topic: string, timestamp = Date.now()) {
  return {
    command: 'scan',
    topic,
    data: {
      metrics: { tweetCount: 10, totalEngagement: 500, uniqueAuthors: 8, engagementPerTweet: 50 },
      sentiment: { avg: 0.3, positive: 5, neutral: 3, negative: 2 },
      topAccounts: [{ handle: 'alice', postCount: 3, followers: 5000, avgSentiment: 0.5 }],
      narratives: [
        { theme: 'test', description: 'Test narrative', tweetCount: 10, avgSentiment: 0.3 },
      ],
      signals: ['Signal 1', 'Signal 2'],
    },
    raw: '{}',
    timestamp,
    cost: 0.001,
    tweets: [
      {
        id: '100',
        text: 'Hello world',
        authorId: 'user1',
        createdAt: '2026-03-10T12:00:00Z',
        metrics: { likes: 10, retweets: 5, replies: 2, impressions: 100 },
      },
      {
        id: '101',
        text: 'Test tweet, with commas',
        authorId: 'user2',
        createdAt: '2026-03-10T13:00:00Z',
        metrics: { likes: 20, retweets: 8, replies: 3, impressions: 200 },
      },
    ],
    scores: [
      { index: 0, sentiment: 0.5, narrative: 'positive' },
      { index: 1, sentiment: -0.2, narrative: 'cautious' },
    ],
  }
}

describe('registerExportCommand', () => {
  let program: Command
  let stdoutData: string[]

  beforeEach(() => {
    vi.restoreAllMocks()
    mockListTopics.mockReset()
    mockLoadLatest.mockReset()
    mockLoadAll.mockReset()
    program = new Command()
    program.exitOverride()
    registerExportCommand(program)
    stdoutData = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutData.push(String(chunk))
      return true
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })
  })

  it('registers export command', () => {
    const cmd = program.commands.find((c) => c.name() === 'export')
    expect(cmd).toBeDefined()
  })

  it('--list shows stored snapshots', async () => {
    mockListTopics.mockReturnValue([
      { command: 'scan', topic: 'bitcoin', dir: 'scan-abc', count: 5, latest: Date.now() - 60000 },
    ])
    await program.parseAsync(['node', 'corvus', 'export', '--list'])
    expect(mockListTopics).toHaveBeenCalled()
  })

  it('--list shows empty message when no snapshots', async () => {
    mockListTopics.mockReturnValue([])
    await program.parseAsync(['node', 'corvus', 'export', '--list'])
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No snapshots'))
  })

  it('exports latest snapshot as JSON by default', async () => {
    const snap = makeScanSnapshot('bitcoin')
    mockLoadLatest.mockReturnValue(snap)
    await program.parseAsync(['node', 'corvus', 'export', 'scan', 'bitcoin'])
    const output = stdoutData.join('')
    const parsed = JSON.parse(output)
    expect(parsed.command).toBe('scan')
    expect(parsed.topic).toBe('bitcoin')
    expect(parsed.data).toBeDefined()
  })

  it('JSON export excludes tweets by default', async () => {
    const snap = makeScanSnapshot('bitcoin')
    mockLoadLatest.mockReturnValue(snap)
    await program.parseAsync(['node', 'corvus', 'export', 'scan', 'bitcoin'])
    const output = stdoutData.join('')
    const parsed = JSON.parse(output)
    expect(parsed.tweets).toBeUndefined()
  })

  it('JSON export includes tweets with --tweets flag', async () => {
    const snap = makeScanSnapshot('bitcoin')
    mockLoadLatest.mockReturnValue(snap)
    await program.parseAsync(['node', 'corvus', 'export', 'scan', 'bitcoin', '--tweets'])
    const output = stdoutData.join('')
    const parsed = JSON.parse(output)
    expect(parsed.tweets).toHaveLength(2)
    expect(parsed.scores).toHaveLength(2)
  })

  it('exports all snapshots as JSON array with --all', async () => {
    const snaps = [makeScanSnapshot('bitcoin', 1000), makeScanSnapshot('bitcoin', 2000)]
    mockLoadAll.mockReturnValue(snaps)
    await program.parseAsync(['node', 'corvus', 'export', 'scan', 'bitcoin', '--all'])
    const output = stdoutData.join('')
    const parsed = JSON.parse(output)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
  })

  it('exports CSV with summary rows', async () => {
    const snap = makeScanSnapshot('bitcoin')
    mockLoadLatest.mockReturnValue(snap)
    await program.parseAsync([
      'node',
      'corvus',
      'export',
      'scan',
      'bitcoin',
      '-f',
      'csv',
    ])
    const output = stdoutData.join('')
    const lines = output.trim().split('\n')
    expect(lines[0]).toBe(
      'timestamp,command,topic,sentiment_avg,tweet_count,engagement,unique_authors,signals,cost',
    )
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('scan')
    expect(lines[1]).toContain('bitcoin')
  })

  it('exports CSV with tweet rows using --tweets', async () => {
    const snap = makeScanSnapshot('bitcoin')
    mockLoadLatest.mockReturnValue(snap)
    await program.parseAsync([
      'node',
      'corvus',
      'export',
      'scan',
      'bitcoin',
      '-f',
      'csv',
      '--tweets',
    ])
    const output = stdoutData.join('')
    const lines = output.trim().split('\n')
    expect(lines[0]).toContain('tweet_id')
    expect(lines).toHaveLength(3) // header + 2 tweets
    expect(lines[1]).toContain('100')
  })

  it('CSV properly escapes commas in text', async () => {
    const snap = makeScanSnapshot('bitcoin')
    mockLoadLatest.mockReturnValue(snap)
    await program.parseAsync([
      'node',
      'corvus',
      'export',
      'scan',
      'bitcoin',
      '-f',
      'csv',
      '--tweets',
    ])
    const output = stdoutData.join('')
    // "Test tweet, with commas" should be quoted
    expect(output).toContain('"Test tweet, with commas"')
  })

  it('exports JSONL with one line per snapshot', async () => {
    const snap = makeScanSnapshot('bitcoin')
    mockLoadLatest.mockReturnValue(snap)
    await program.parseAsync([
      'node',
      'corvus',
      'export',
      'scan',
      'bitcoin',
      '-f',
      'jsonl',
    ])
    const output = stdoutData.join('')
    const lines = output.trim().split('\n')
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0])
    expect(parsed.type).toBe('snapshot')
    expect(parsed.command).toBe('scan')
  })

  it('exports JSONL with one line per tweet when --tweets', async () => {
    const snap = makeScanSnapshot('bitcoin')
    mockLoadLatest.mockReturnValue(snap)
    await program.parseAsync([
      'node',
      'corvus',
      'export',
      'scan',
      'bitcoin',
      '-f',
      'jsonl',
      '--tweets',
    ])
    const output = stdoutData.join('')
    const lines = output.trim().split('\n')
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0])
    expect(first.type).toBe('tweet')
    expect(first.tweet.id).toBe('100')
    expect(first.score.sentiment).toBe(0.5)
  })

  it('exits with error when no snapshots found', async () => {
    mockLoadLatest.mockReturnValue(null)
    try {
      await program.parseAsync(['node', 'corvus', 'export', 'scan', 'bitcoin'])
    } catch {
      /* process.exit */
    }
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No snapshots found'))
  })

  it('exits with error when no topic provided', async () => {
    try {
      await program.parseAsync(['node', 'corvus', 'export', 'scan'])
    } catch {
      /* process.exit */
    }
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Topic is required'))
  })

  it('handles snapshots without tweets gracefully in CSV --tweets mode', async () => {
    const snap = makeScanSnapshot('bitcoin')
    delete (snap as Record<string, unknown>).tweets
    delete (snap as Record<string, unknown>).scores
    mockLoadLatest.mockReturnValue(snap)
    await program.parseAsync([
      'node',
      'corvus',
      'export',
      'scan',
      'bitcoin',
      '-f',
      'csv',
      '--tweets',
    ])
    const output = stdoutData.join('')
    const lines = output.trim().split('\n')
    expect(lines).toHaveLength(1) // header only, no tweets
  })
})
