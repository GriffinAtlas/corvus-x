import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export interface CacheEntry {
  key: string
  command: string
  query: string
  response: string
  costUsd: number
  createdAt: number
  ttlMs: number
}

export interface CostLedger {
  totalUsd: number
  queryCount: number
  entries: { timestamp: number; costUsd: number; query: string }[]
}

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

export class QueryCache {
  private cacheDir: string
  private ledgerPath: string

  constructor(baseDir: string) {
    this.cacheDir = path.join(baseDir, 'cache')
    this.ledgerPath = path.join(baseDir, 'cost-ledger.json')
  }

  get(command: string, query: string): CacheEntry | null {
    const key = this.hashKey(command, query)
    const filePath = path.join(this.cacheDir, `${key}.json`)

    let raw: string
    try {
      raw = fs.readFileSync(filePath, 'utf-8')
    } catch {
      return null
    }

    let entry: CacheEntry
    try {
      entry = JSON.parse(raw)
    } catch {
      fs.unlinkSync(filePath)
      return null
    }
    if (!Number.isFinite(entry.createdAt) || !Number.isFinite(entry.ttlMs)) {
      fs.unlinkSync(filePath)
      return null
    }
    if (Date.now() > entry.createdAt + entry.ttlMs) {
      fs.unlinkSync(filePath)
      return null
    }

    return entry
  }

  set(command: string, query: string, response: string, costUsd: number, ttlMs = DEFAULT_TTL_MS): void {
    const key = this.hashKey(command, query)
    fs.mkdirSync(this.cacheDir, { recursive: true })

    const entry: CacheEntry = {
      key,
      command,
      query,
      response,
      costUsd,
      createdAt: Date.now(),
      ttlMs,
    }

    fs.writeFileSync(path.join(this.cacheDir, `${key}.json`), JSON.stringify(entry, null, 2), { mode: 0o600 })
    this.recordCost(costUsd, query)
  }

  clear(): number {
    let count = 0
    let files: string[]
    try {
      files = fs.readdirSync(this.cacheDir)
    } catch {
      return 0
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        fs.unlinkSync(path.join(this.cacheDir, file))
        count++
      } catch {
        // skip files that can't be deleted
      }
    }
    return count
  }

  evictExpired(): number {
    let count = 0
    let files: string[]
    try {
      files = fs.readdirSync(this.cacheDir)
    } catch {
      return 0
    }
    const now = Date.now()
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = fs.readFileSync(path.join(this.cacheDir, file), 'utf-8')
        const entry: CacheEntry = JSON.parse(raw)
        if (!Number.isFinite(entry.createdAt) || !Number.isFinite(entry.ttlMs) || now > entry.createdAt + entry.ttlMs) {
          fs.unlinkSync(path.join(this.cacheDir, file))
          count++
        }
      } catch {
        // skip corrupted or locked files
      }
    }
    return count
  }

  getLedger(): CostLedger {
    try {
      return JSON.parse(fs.readFileSync(this.ledgerPath, 'utf-8'))
    } catch {
      return { totalUsd: 0, queryCount: 0, entries: [] }
    }
  }

  private recordCost(costUsd: number, query: string): void {
    const ledger = this.getLedger()
    ledger.totalUsd += costUsd
    ledger.queryCount++
    ledger.entries.push({ timestamp: Date.now(), costUsd, query })

    // keep last 1000 entries
    if (ledger.entries.length > 1000) {
      ledger.entries = ledger.entries.slice(-1000)
    }

    fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true })
    fs.writeFileSync(this.ledgerPath, JSON.stringify(ledger, null, 2), { mode: 0o600 })
  }

  private hashKey(command: string, query: string): string {
    return crypto.createHash('sha256').update(`${command}:${query}`).digest('hex').slice(0, 16)
  }
}
