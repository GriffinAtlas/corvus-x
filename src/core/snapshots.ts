import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { Snapshot, StoredSnapshot, GrokTweetScore } from './schemas.js'
import type { Tweet } from './x-adapter.js'

const MAX_SNAPSHOTS_PER_TOPIC = 50

export class SnapshotStore {
  private baseDir: string

  constructor(baseDir: string) {
    this.baseDir = path.join(baseDir, 'snapshots')
  }

  save<T extends Snapshot>(
    command: string,
    topic: string,
    data: T,
    raw: string,
    cost: number,
    tweets?: Tweet[],
    scores?: GrokTweetScore[],
  ): StoredSnapshot<T> {
    const dir = this.topicDir(command, topic)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })

    const snapshot: StoredSnapshot<T> = {
      command,
      topic,
      data,
      raw: raw.length > 65536 ? raw.slice(0, 65536) : raw,
      timestamp: Date.now(),
      cost,
      ...(tweets?.length ? { tweets } : {}),
      ...(scores?.length ? { scores } : {}),
    }

    fs.writeFileSync(path.join(dir, `${snapshot.timestamp}.json`), JSON.stringify(snapshot), {
      mode: 0o600,
    })

    this.prune(dir)
    return snapshot
  }

  loadLatest<T extends Snapshot>(command: string, topic: string): StoredSnapshot<T> | null {
    const dir = this.topicDir(command, topic)
    const files = this.listFiles(dir)
    if (files.length === 0) return null
    for (let i = files.length - 1; i >= 0; i--) {
      const parsed = this.readSnapshot<T>(path.join(dir, files[i]))
      if (parsed) return parsed
    }
    return null
  }

  loadAll<T extends Snapshot>(command: string, topic: string): StoredSnapshot<T>[] {
    const dir = this.topicDir(command, topic)
    const files = this.listFiles(dir)
    const results: StoredSnapshot<T>[] = []
    for (const file of files) {
      const parsed = this.readSnapshot<T>(path.join(dir, file))
      if (parsed) results.push(parsed)
    }
    return results
  }

  listTopics(): { command: string; topic: string; dir: string; count: number; latest: number }[] {
    if (!fs.existsSync(this.baseDir)) return []
    const results: {
      command: string
      topic: string
      dir: string
      count: number
      latest: number
    }[] = []
    for (const entry of fs.readdirSync(this.baseDir)) {
      const fullPath = path.join(this.baseDir, entry)
      let stat: fs.Stats
      try { stat = fs.statSync(fullPath) } catch { continue }
      if (!stat.isDirectory()) continue
      const files = this.listFiles(fullPath)
      if (files.length === 0) continue
      let latestSnapshot: StoredSnapshot | null = null
      for (let i = files.length - 1; i >= 0; i--) {
        latestSnapshot = this.readSnapshot(path.join(fullPath, files[i]))
        if (latestSnapshot) break
      }
      if (!latestSnapshot) continue
      results.push({
        command: latestSnapshot.command,
        topic: latestSnapshot.topic,
        dir: entry,
        count: files.length,
        latest: latestSnapshot.timestamp,
      })
    }
    return results.sort((a, b) => b.latest - a.latest)
  }

  private readSnapshot<T extends Snapshot>(filePath: string): StoredSnapshot<T> | null {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return null
    }
  }

  private topicDir(command: string, topic: string): string {
    const hash = crypto.createHash('sha256').update(topic.toLowerCase()).digest('hex').slice(0, 12)
    return path.join(this.baseDir, `${command}-${hash}`)
  }

  private listFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
  }

  private prune(dir: string): void {
    const files = this.listFiles(dir)
    if (files.length <= MAX_SNAPSHOTS_PER_TOPIC) return
    const toRemove = files.slice(0, files.length - MAX_SNAPSHOTS_PER_TOPIC)
    for (const file of toRemove) {
      try {
        fs.unlinkSync(path.join(dir, file))
      } catch {
        /* already gone */
      }
    }
  }
}
