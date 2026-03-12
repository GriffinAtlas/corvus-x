import { SnapshotStore } from './snapshots.js'
import { diffSnapshots } from './differ.js'
import type { BuildResult, GrokCitation } from './types.js'
import type { Snapshot, MatchKeys } from './schemas.js'
import type { DiffLine } from './differ.js'

export interface StructuredQueryOptions<T extends Snapshot> {
  command: string
  topic: string
  matchKeys: MatchKeys
  buildSnapshot: () => Promise<BuildResult<T>>
  baseDir: string
}

export interface StructuredQueryResult<T extends Snapshot> {
  data: T
  cost: number
  timestamp: number
  diff: DiffLine[]
  timeSinceLast: number
  raw: string
  citations: GrokCitation[]
}

export async function executeStructuredQuery<T extends Snapshot>(
  opts: StructuredQueryOptions<T>,
): Promise<StructuredQueryResult<T>> {
  const store = new SnapshotStore(opts.baseDir)
  const previous = store.loadLatest<T>(opts.command, opts.topic)
  const built = await opts.buildSnapshot()

  const stored = store.save(
    opts.command,
    opts.topic,
    built.data,
    built.raw,
    built.cost,
    built.tweets,
    built.scores,
  )

  let diff: DiffLine[] = []
  let timeSinceLast = 0
  if (previous) {
    diff = diffSnapshots(previous.data, stored.data, opts.matchKeys)
    timeSinceLast = stored.timestamp - previous.timestamp
  }

  return {
    data: stored.data,
    cost: built.cost,
    timestamp: stored.timestamp,
    diff,
    timeSinceLast,
    raw: built.raw,
    citations: built.citations,
  }
}
