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
    fs.mkdirSync(dir, { recursive: true })

    const snapshot: StoredSnapshot<T> = {
      command,
      topic,
      data,
      raw,
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
    const latest = files[files.length - 1]
    return JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf-8'))
  }

  loadAll<T extends Snapshot>(command: string, topic: string): StoredSnapshot<T>[] {
    const dir = this.topicDir(command, topic)
    const files = this.listFiles(dir)
    return files.map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')))
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
      if (!fs.statSync(fullPath).isDirectory()) continue
      const files = this.listFiles(fullPath)
      if (files.length === 0) continue
      const latestFile = files[files.length - 1]
      const latestSnapshot: StoredSnapshot = JSON.parse(
        fs.readFileSync(path.join(fullPath, latestFile), 'utf-8'),
      )
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
