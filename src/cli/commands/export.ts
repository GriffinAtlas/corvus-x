import { Command } from 'commander'
import { t } from '../theme.js'
import { ConfigManager } from '../../infra/config.js'
import { SnapshotStore } from '../../core/snapshots.js'
import type { StoredSnapshot, Snapshot } from '../../core/schemas.js'

type ExportFormat = 'json' | 'csv' | 'jsonl'

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

function snapshotToCsvRow(snap: StoredSnapshot): string {
  const data = snap.data
  const rawSentiment = 'sentiment' in data ? data.sentiment : 0
  const sentiment = typeof rawSentiment === 'number' ? rawSentiment : (rawSentiment as { avg: number }).avg
  const tweetCount = 'metrics' in data ? (data.metrics as { tweetCount: number }).tweetCount : 0
  const engagement =
    'metrics' in data ? (data.metrics as { totalEngagement: number }).totalEngagement : 0
  const uniqueAuthors =
    'metrics' in data ? (data.metrics as { uniqueAuthors: number }).uniqueAuthors : 0
  const signals = 'signals' in data ? (data.signals as string[]).join('; ') : ''

  return [
    new Date(snap.timestamp).toISOString(),
    escapeCsv(snap.command),
    escapeCsv(snap.topic),
    sentiment.toFixed(3),
    String(tweetCount),
    String(engagement),
    String(uniqueAuthors),
    escapeCsv(signals),
    snap.cost.toFixed(6),
  ].join(',')
}


function exportJson(snapshots: StoredSnapshot[], includeTweets: boolean): void {
  const output = snapshots.map((snap) => {
    const base: Record<string, unknown> = {
      command: snap.command,
      topic: snap.topic,
      timestamp: snap.timestamp,
      cost: snap.cost,
      data: snap.data,
    }
    if (includeTweets && snap.tweets?.length) {
      base.tweets = snap.tweets
      base.scores = snap.scores
    }
    return base
  })

  process.stdout.write(JSON.stringify(snapshots.length === 1 ? output[0] : output, null, 2) + '\n')
}

function exportJsonl(snapshots: StoredSnapshot[], includeTweets: boolean): void {
  for (const snap of snapshots) {
    if (includeTweets && snap.tweets?.length) {
      const scoreMap = new Map((snap.scores ?? []).map((s) => [s.index, s]))
      for (let i = 0; i < snap.tweets.length; i++) {
        const tweet = snap.tweets[i]
        const score = scoreMap.get(i)
        const line = {
          type: 'tweet',
          command: snap.command,
          topic: snap.topic,
          snapshotTimestamp: snap.timestamp,
          tweet,
          score,
        }
        process.stdout.write(JSON.stringify(line) + '\n')
      }
    } else {
      const line = {
        type: 'snapshot',
        command: snap.command,
        topic: snap.topic,
        timestamp: snap.timestamp,
        cost: snap.cost,
        data: snap.data,
      }
      process.stdout.write(JSON.stringify(line) + '\n')
    }
  }
}

function exportCsv(snapshots: StoredSnapshot[], includeTweets: boolean): void {
  if (includeTweets) {
    process.stdout.write(
      'timestamp,tweet_id,author_id,text,likes,retweets,replies,impressions,sentiment,narrative\n',
    )
    for (const snap of snapshots) {
      const tweets = snap.tweets ?? []
      const scoreMap = new Map((snap.scores ?? []).map((s) => [s.index, s]))
      for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i]
        const score = scoreMap.get(i)
        process.stdout.write(
          [
            new Date(snap.timestamp).toISOString(),
            tweet.id,
            tweet.authorId,
            escapeCsv(tweet.text),
            String(tweet.metrics.likes),
            String(tweet.metrics.retweets),
            String(tweet.metrics.replies),
            String(tweet.metrics.impressions),
            (score?.sentiment ?? 0).toFixed(3),
            escapeCsv(score?.narrative ?? ''),
          ].join(',') + '\n',
        )
      }
    }
  } else {
    process.stdout.write(
      'timestamp,command,topic,sentiment_avg,tweet_count,engagement,unique_authors,signals,cost\n',
    )
    for (const snap of snapshots) {
      process.stdout.write(snapshotToCsvRow(snap) + '\n')
    }
  }
}

function printList(store: SnapshotStore): void {
  const topics = store.listTopics()
  if (topics.length === 0) {
    console.log(t.muted('\n  No snapshots stored.\n'))
    return
  }

  console.log(t.heading('\n  Stored snapshots:\n'))
  for (const entry of topics) {
    const age = Date.now() - entry.latest
    const ageStr =
      age < 3600_000
        ? `${Math.round(age / 60_000)}m ago`
        : age < 86400_000
          ? `${Math.round(age / 3600_000)}h ago`
          : `${Math.round(age / 86400_000)}d ago`
    console.log(
      t.muted(`  ${entry.command.padEnd(8)} ${entry.topic.padEnd(30)} ${String(entry.count).padStart(3)} snapshots  ${ageStr}`),
    )
  }
  console.log()
}

export function registerExportCommand(program: Command): void {
  program
    .command('export [command] [topic...]')
    .description('Export snapshot data as JSON, CSV, or JSONL')
    .option('-f, --format <type>', 'output format: json, csv, jsonl', 'json')
    .option('--all', 'export all snapshots (not just latest)')
    .option('--tweets', 'include raw tweets in export')
    .option('--list', 'list available snapshots')
    .addHelpText('after', `
Examples:
  $ corvus export --list
  $ corvus export scan "AI regulation" -f csv
  $ corvus export pulse bitcoin --all --tweets -f jsonl`)
    .action(
      async (
        command: string | undefined,
        topicParts: string[],
        options: {
          format: ExportFormat
          all?: boolean
          tweets?: boolean
          list?: boolean
        },
      ) => {
        const store = new SnapshotStore(ConfigManager.defaultDir())

        if (options.list) {
          printList(store)
          return
        }

        if (!command) {
          console.log(
            t.error(
              '\n  Usage: corvus export <command> <topic> [--format json|csv|jsonl] [--all] [--tweets]\n  Use --list to see available snapshots.\n',
            ),
          )
          process.exit(1)
        }

        const topic = topicParts.join(' ')
        if (!topic) {
          console.log(t.error('\n  Topic is required. Use --list to see available snapshots.\n'))
          process.exit(1)
        }

        let snapshots: StoredSnapshot<Snapshot>[]
        if (options.all) {
          snapshots = store.loadAll(command, topic)
        } else {
          const latest = store.loadLatest(command, topic)
          snapshots = latest ? [latest] : []
        }

        if (snapshots.length === 0) {
          console.log(t.error(`\n  No snapshots found for ${command} "${topic}".\n`))
          process.exit(1)
        }

        switch (options.format) {
          case 'json':
            exportJson(snapshots, !!options.tweets)
            break
          case 'csv':
            exportCsv(snapshots, !!options.tweets)
            break
          case 'jsonl':
            exportJsonl(snapshots, !!options.tweets)
            break
        }
      },
    )
}
