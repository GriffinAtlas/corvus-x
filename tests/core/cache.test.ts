import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { QueryCache } from '../../src/core/cache.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('QueryCache', () => {
  let tmpDir: string
  let cache: QueryCache

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-cache-'))
    cache = new QueryCache(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null for uncached query', () => {
    expect(cache.get('ask', 'test')).toBeNull()
  })

  it('stores and retrieves a cached entry', () => {
    cache.set('ask', 'what is AI?', 'AI is...', 0.001)
    const entry = cache.get('ask', 'what is AI?')
    expect(entry).not.toBeNull()
    expect(entry!.response).toBe('AI is...')
    expect(entry!.command).toBe('ask')
    expect(entry!.query).toBe('what is AI?')
    expect(entry!.costUsd).toBe(0.001)
  })

  it('same command+query returns same cache entry', () => {
    cache.set('ask', 'test', 'response1', 0.001)
    cache.set('ask', 'test', 'response2', 0.002)
    const entry = cache.get('ask', 'test')
    expect(entry!.response).toBe('response2')
  })

  it('different commands produce different cache keys', () => {
    cache.set('ask', 'test', 'ask-response', 0.001)
    cache.set('scan', 'test', 'scan-response', 0.002)
    expect(cache.get('ask', 'test')!.response).toBe('ask-response')
    expect(cache.get('scan', 'test')!.response).toBe('scan-response')
  })

  it('expires entries after TTL', () => {
    cache.set('ask', 'test', 'response', 0.001, 1) // 1ms TTL
    // Wait for expiry
    const start = Date.now()
    while (Date.now() - start < 5) { /* spin */ }
    expect(cache.get('ask', 'test')).toBeNull()
  })

  it('expired entry file is deleted on get', () => {
    cache.set('ask', 'test', 'response', 0.001, 1)
    const start = Date.now()
    while (Date.now() - start < 5) { /* spin */ }
    cache.get('ask', 'test')
    const files = fs.readdirSync(path.join(tmpDir, 'cache'))
    expect(files).toHaveLength(0)
  })

  it('clear removes all cache files', () => {
    cache.set('ask', 'q1', 'r1', 0.001)
    cache.set('ask', 'q2', 'r2', 0.001)
    cache.set('ask', 'q3', 'r3', 0.001)
    const removed = cache.clear()
    expect(removed).toBe(3)
    expect(cache.get('ask', 'q1')).toBeNull()
    expect(cache.get('ask', 'q2')).toBeNull()
  })

  it('clear returns 0 when cache dir does not exist', () => {
    expect(cache.clear()).toBe(0)
  })

  it('evictExpired removes only expired entries', () => {
    cache.set('ask', 'short', 'r1', 0.001, 1) // expires instantly
    cache.set('ask', 'long', 'r2', 0.001, 60000) // 1 minute TTL
    const start = Date.now()
    while (Date.now() - start < 5) { /* spin */ }
    const evicted = cache.evictExpired()
    expect(evicted).toBe(1)
    expect(cache.get('ask', 'short')).toBeNull()
    expect(cache.get('ask', 'long')).not.toBeNull()
  })

  it('records cost in ledger', () => {
    cache.set('ask', 'q1', 'r1', 0.005)
    cache.set('ask', 'q2', 'r2', 0.003)
    const ledger = cache.getLedger()
    expect(ledger.totalUsd).toBeCloseTo(0.008, 6)
    expect(ledger.queryCount).toBe(2)
    expect(ledger.entries).toHaveLength(2)
  })

  it('ledger entries contain query and timestamp', () => {
    cache.set('ask', 'AI trends', 'response', 0.001)
    const ledger = cache.getLedger()
    expect(ledger.entries[0].query).toBe('AI trends')
    expect(ledger.entries[0].costUsd).toBe(0.001)
    expect(typeof ledger.entries[0].timestamp).toBe('number')
  })

  it('returns empty ledger when no file exists', () => {
    const ledger = cache.getLedger()
    expect(ledger.totalUsd).toBe(0)
    expect(ledger.queryCount).toBe(0)
    expect(ledger.entries).toEqual([])
  })

  it('creates cache directory on first set', () => {
    const nested = path.join(tmpDir, 'deep', 'nested')
    const deepCache = new QueryCache(nested)
    deepCache.set('ask', 'test', 'response', 0.001)
    expect(fs.existsSync(path.join(nested, 'cache'))).toBe(true)
  })

  it('writes valid JSON files to disk', () => {
    cache.set('ask', 'test', 'response', 0.001)
    const files = fs.readdirSync(path.join(tmpDir, 'cache'))
    expect(files).toHaveLength(1)
    const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, 'cache', files[0]), 'utf-8'))
    expect(parsed.response).toBe('response')
    expect(parsed.command).toBe('ask')
  })
})
