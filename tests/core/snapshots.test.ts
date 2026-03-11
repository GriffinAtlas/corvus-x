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
})
