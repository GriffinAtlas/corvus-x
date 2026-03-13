import { describe, it, expect, afterEach, vi } from 'vitest'
import { SnapshotStore } from '../../src/core/snapshots.js'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

describe('SnapshotStore', () => {
  let tmpDir: string
  let store: SnapshotStore

  function freshStore() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-snap-'))
    store = new SnapshotStore(tmpDir)
    return store
  }

  afterEach(() => {
    vi.restoreAllMocks()
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('does not create snapshots subdirectory until save is called', () => {
    freshStore()
    const snapshotsDir = path.join(tmpDir, 'snapshots')
    expect(fs.existsSync(snapshotsDir)).toBe(false)
  })

  it('creates snapshots subdirectory on first save', () => {
    freshStore()
    store.save('scan', 'test', { mock: true } as any, 'raw', 0.001)
    const snapshotsDir = path.join(tmpDir, 'snapshots')
    expect(fs.existsSync(snapshotsDir)).toBe(true)
  })

  it('save returns a StoredSnapshot with correct fields', () => {
    freshStore()
    const result = store.save('scan', 'bitcoin', { mock: true } as any, 'raw output', 0.005)
    expect(result).toHaveProperty('command', 'scan')
    expect(result).toHaveProperty('topic', 'bitcoin')
    expect(result).toHaveProperty('data')
    expect(result).toHaveProperty('cost', 0.005)
    expect(result).toHaveProperty('timestamp')
  })

  it('loadLatest returns null when no snapshots exist', () => {
    freshStore()
    const result = store.loadLatest('scan', 'nonexistent')
    expect(result).toBeNull()
  })

  it('loadLatest returns the most recently saved snapshot', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1000000)
    store.save('scan', 'eth', { version: 1 } as any, 'raw1', 0.001)
    nowSpy.mockReturnValue(2000000)
    store.save('scan', 'eth', { version: 2 } as any, 'raw2', 0.002)
    const latest = store.loadLatest('scan', 'eth')
    expect(latest).not.toBeNull()
    expect(latest!.data).toEqual({ version: 2 })
  })

  it('loadAll returns all snapshots for a command+topic', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1000000)
    store.save('pulse', 'ai', { n: 1 } as any, 'r1', 0.001)
    nowSpy.mockReturnValue(2000000)
    store.save('pulse', 'ai', { n: 2 } as any, 'r2', 0.002)
    nowSpy.mockReturnValue(3000000)
    store.save('pulse', 'ai', { n: 3 } as any, 'r3', 0.003)
    const all = store.loadAll('pulse', 'ai')
    expect(all.length).toBe(3)
  })

  it('loadAll returns empty array when no snapshots exist', () => {
    freshStore()
    const all = store.loadAll('ask', 'nothing')
    expect(all).toEqual([])
  })

  it('isolates snapshots by command and topic', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1000000)
    store.save('scan', 'btc', { x: 1 } as any, 'r', 0.001)
    nowSpy.mockReturnValue(2000000)
    store.save('pulse', 'btc', { x: 2 } as any, 'r', 0.001)
    nowSpy.mockReturnValue(3000000)
    store.save('scan', 'eth', { x: 3 } as any, 'r', 0.001)

    expect(store.loadAll('scan', 'btc').length).toBe(1)
    expect(store.loadAll('pulse', 'btc').length).toBe(1)
    expect(store.loadAll('scan', 'eth').length).toBe(1)
    expect(store.loadAll('pulse', 'eth').length).toBe(0)
  })

  it('uses sha256-based directory naming with lowercase topic', () => {
    freshStore()
    store.save('scan', 'Bitcoin', { ok: true } as any, 'raw', 0.001)
    const hash = crypto.createHash('sha256').update('bitcoin').digest('hex').slice(0, 12)
    const expectedDir = path.join(tmpDir, 'snapshots', `scan-${hash}`)
    expect(fs.existsSync(expectedDir)).toBe(true)
  })

  it('listTopics returns saved topic info', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1000000)
    store.save('scan', 'bitcoin', { a: 1 } as any, 'r', 0.001)
    nowSpy.mockReturnValue(2000000)
    store.save('pulse', 'ethereum', { a: 2 } as any, 'r', 0.002)
    const topics = store.listTopics()
    expect(topics.length).toBe(2)
  })

  it('auto-prunes to 50 snapshots per command+topic', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    const ts = 1700000000000
    for (let i = 0; i < 55; i++) {
      nowSpy.mockReturnValue(ts + i * 1000)
      store.save('scan', 'prune-test', { i } as any, 'raw', 0.001)
    }
    const all = store.loadAll('scan', 'prune-test')
    expect(all.length).toBe(50)
  })

  it('treats topics case-insensitively (Bitcoin === bitcoin)', () => {
    freshStore()
    store.save('scan', 'Bitcoin', { price: 50000 } as any, 'raw', 0.001)
    const loaded = store.loadLatest('scan', 'bitcoin')
    expect(loaded).not.toBeNull()
    expect(loaded!.data).toEqual({ price: 50000 })
  })

  it('handles special characters in topic', () => {
    freshStore()
    store.save('scan', 'topic with spaces & symbols!', { ok: true } as any, 'raw', 0.001)
    const loaded = store.loadLatest('scan', 'topic with spaces & symbols!')
    expect(loaded).not.toBeNull()
    expect(loaded!.data).toEqual({ ok: true })
  })

  it('prune keeps exactly 50 when saving the 51st', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    const ts = 1700000000000
    for (let i = 0; i < 51; i++) {
      nowSpy.mockReturnValue(ts + i * 1000)
      store.save('scan', 'prune-exact', { i } as any, 'raw', 0.001)
    }
    const all = store.loadAll('scan', 'prune-exact')
    expect(all.length).toBe(50)
  })

  it('loadLatest returns the correct data shape', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1700000000000)
    store.save('pulse', 'shape-test', { sentiment: 0.8 } as any, 'raw output', 0.005)
    const loaded = store.loadLatest('pulse', 'shape-test')
    expect(loaded).not.toBeNull()
    expect(loaded!.timestamp).toBe(1700000000000)
    expect(loaded!.cost).toBe(0.005)
    expect(loaded!.command).toBe('pulse')
    expect(loaded!.topic).toBe('shape-test')
    expect(loaded!.data).toEqual({ sentiment: 0.8 })
  })

  it('save persists tweets and scores when provided', () => {
    freshStore()
    const tweets = [
      {
        id: '1',
        text: 'hello',
        authorId: 'a1',
        createdAt: '2026-03-10T00:00:00Z',
        metrics: { likes: 1, retweets: 0, replies: 0, impressions: 10 },
      },
    ]
    const scores = [{ index: 0, sentiment: 0.5, narrative: 'test' }]
    store.save('scan', 'tweets-test', { ok: true } as any, 'raw', 0.001, tweets, scores)
    const loaded = store.loadLatest('scan', 'tweets-test')
    expect(loaded!.tweets).toHaveLength(1)
    expect(loaded!.tweets![0].id).toBe('1')
    expect(loaded!.scores).toHaveLength(1)
    expect(loaded!.scores![0].sentiment).toBe(0.5)
  })

  it('save omits tweets and scores when empty', () => {
    freshStore()
    store.save('scan', 'no-tweets', { ok: true } as any, 'raw', 0.001, [], [])
    const loaded = store.loadLatest('scan', 'no-tweets')
    expect(loaded!.tweets).toBeUndefined()
    expect(loaded!.scores).toBeUndefined()
  })

  it('save omits tweets and scores when undefined', () => {
    freshStore()
    store.save('scan', 'undef-tweets', { ok: true } as any, 'raw', 0.001)
    const loaded = store.loadLatest('scan', 'undef-tweets')
    expect(loaded!.tweets).toBeUndefined()
    expect(loaded!.scores).toBeUndefined()
  })

  it('loadLatest returns null when snapshot file is corrupted', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(9999999)
    store.save('scan', 'corrupt', { ok: true } as any, 'raw', 0.001)

    const hash = crypto.createHash('sha256').update('corrupt').digest('hex').slice(0, 12)
    const snapshotFile = path.join(tmpDir, 'snapshots', `scan-${hash}`, '9999999.json')
    fs.writeFileSync(snapshotFile, '{{not valid json!!!}')

    expect(store.loadLatest('scan', 'corrupt')).toBeNull()
  })

  it('loadLatest falls back to earlier snapshot when latest is corrupted', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1000000)
    store.save('scan', 'fallback', { version: 1 } as any, 'raw', 0.001)
    nowSpy.mockReturnValue(2000000)
    store.save('scan', 'fallback', { version: 2 } as any, 'raw', 0.001)

    // Corrupt the latest file
    const hash = crypto.createHash('sha256').update('fallback').digest('hex').slice(0, 12)
    const corruptFile = path.join(tmpDir, 'snapshots', `scan-${hash}`, '2000000.json')
    fs.writeFileSync(corruptFile, 'garbage')

    const loaded = store.loadLatest('scan', 'fallback')
    expect(loaded).not.toBeNull()
    expect(loaded!.data).toEqual({ version: 1 })
  })

  it('loadAll skips corrupted snapshot files', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1000000)
    store.save('scan', 'mixed', { n: 1 } as any, 'r1', 0.001)
    nowSpy.mockReturnValue(2000000)
    store.save('scan', 'mixed', { n: 2 } as any, 'r2', 0.001)
    nowSpy.mockReturnValue(3000000)
    store.save('scan', 'mixed', { n: 3 } as any, 'r3', 0.001)

    // Corrupt the middle file
    const hash = crypto.createHash('sha256').update('mixed').digest('hex').slice(0, 12)
    const corruptFile = path.join(tmpDir, 'snapshots', `scan-${hash}`, '2000000.json')
    fs.writeFileSync(corruptFile, '{{{bad}}}')

    const all = store.loadAll('scan', 'mixed')
    expect(all.length).toBe(2)
    expect(all[0].data).toEqual({ n: 1 })
    expect(all[1].data).toEqual({ n: 3 })
  })

  it('listTopics skips directories where all snapshots are corrupted', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1000000)
    store.save('scan', 'good-topic', { ok: true } as any, 'raw', 0.001)
    nowSpy.mockReturnValue(2000000)
    store.save('pulse', 'bad-topic', { ok: true } as any, 'raw', 0.001)

    // Corrupt the only pulse snapshot
    const hash = crypto.createHash('sha256').update('bad-topic').digest('hex').slice(0, 12)
    const corruptFile = path.join(tmpDir, 'snapshots', `pulse-${hash}`, '2000000.json')
    fs.writeFileSync(corruptFile, 'not json')

    const topics = store.listTopics()
    expect(topics.length).toBe(1)
    expect(topics[0].command).toBe('scan')
  })

  it('listTopics falls back to earlier snapshot when latest is corrupted', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1000000)
    store.save('scan', 'partial-corrupt', { v: 1 } as any, 'raw', 0.001)
    nowSpy.mockReturnValue(2000000)
    store.save('scan', 'partial-corrupt', { v: 2 } as any, 'raw', 0.001)

    // Corrupt the latest
    const hash = crypto.createHash('sha256').update('partial-corrupt').digest('hex').slice(0, 12)
    const corruptFile = path.join(tmpDir, 'snapshots', `scan-${hash}`, '2000000.json')
    fs.writeFileSync(corruptFile, 'garbage')

    const topics = store.listTopics()
    expect(topics.length).toBe(1)
    expect(topics[0].command).toBe('scan')
    expect(topics[0].latest).toBe(1000000)
  })

  it('listTopics skips empty subdirectories', () => {
    freshStore()
    // Create the snapshots dir with an empty command subdirectory
    const snapshotsDir = path.join(tmpDir, 'snapshots')
    fs.mkdirSync(path.join(snapshotsDir, 'scan-empty'), { recursive: true })

    const topics = store.listTopics()
    expect(topics).toEqual([])
  })

  it('listTopics skips non-directory files in snapshots dir', () => {
    freshStore()
    // Save one real snapshot so snapshots dir exists
    store.save('scan', 'real-topic', { ok: true } as any, 'raw', 0.001)

    // Place a regular file (not a directory) in the snapshots dir
    fs.writeFileSync(path.join(tmpDir, 'snapshots', 'stray-file.txt'), 'not a dir')

    const topics = store.listTopics()
    // Should only include the real topic, not the stray file
    expect(topics.length).toBe(1)
    expect(topics[0].command).toBe('scan')
  })

  it('loadAll returns snapshots in chronological order', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')

    // Save in non-chronological order: 3000, 1000, 2000
    nowSpy.mockReturnValue(3000)
    store.save('scan', 'order-test', { n: 3 } as any, 'r3', 0.001)
    nowSpy.mockReturnValue(1000)
    store.save('scan', 'order-test', { n: 1 } as any, 'r1', 0.001)
    nowSpy.mockReturnValue(2000)
    store.save('scan', 'order-test', { n: 2 } as any, 'r2', 0.001)

    const all = store.loadAll('scan', 'order-test')
    expect(all.length).toBe(3)
    // listFiles sorts lexicographically: "1000.json" < "2000.json" < "3000.json"
    expect(all[0].timestamp).toBe(1000)
    expect(all[1].timestamp).toBe(2000)
    expect(all[2].timestamp).toBe(3000)
  })

  it('save with empty topic string', () => {
    freshStore()
    // sha256('') is a valid hash — should not throw
    store.save('scan', '', { empty: true } as any, 'raw', 0.001)
    const loaded = store.loadLatest('scan', '')
    expect(loaded).not.toBeNull()
    expect(loaded!.data).toEqual({ empty: true })
    expect(loaded!.topic).toBe('')
  })

  it('concurrent-ish saves to same topic both persist', () => {
    freshStore()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(5000000)
    store.save('scan', 'rapid', { n: 1 } as any, 'r1', 0.001)
    nowSpy.mockReturnValue(5000001)
    store.save('scan', 'rapid', { n: 2 } as any, 'r2', 0.002)

    const all = store.loadAll('scan', 'rapid')
    expect(all.length).toBe(2)
    expect(all[0].data).toEqual({ n: 1 })
    expect(all[1].data).toEqual({ n: 2 })
    const latest = store.loadLatest('scan', 'rapid')
    expect(latest).not.toBeNull()
    expect(latest!.data).toEqual({ n: 2 })
  })
})
