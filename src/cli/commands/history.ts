import { Command } from 'commander'
import { t, divider } from '../theme.js'
import { ConfigManager } from '../../infra/config.js'
import { SnapshotStore } from '../../core/snapshots.js'

export function registerHistoryCommand(program: Command): void {
  program
    .command('history')
    .description('View stored snapshot history')
    .action(() => {
      const store = new SnapshotStore(ConfigManager.defaultDir())
      const topics = store.listTopics()

      if (topics.length === 0) {
        console.log(
          t.muted('\n  No snapshots stored yet. Run a command like `corvus scan bitcoin` first.\n'),
        )
        return
      }

      console.log('')
      console.log(`  ${t.heading('Snapshot History')}`)
      console.log(`  ${divider()}`)
      console.log('')

      for (const entry of topics) {
        const age = Date.now() - entry.latest
        const ageStr =
          age < 3_600_000
            ? `${Math.floor(age / 60_000)}m ago`
            : age < 86_400_000
              ? `${Math.floor(age / 3_600_000)}h ago`
              : `${Math.floor(age / 86_400_000)}d ago`

        console.log(`  ${t.heading(entry.command)} ${t.muted('·')} ${entry.topic}`)
        console.log(`    ${entry.count} snapshots  latest: ${t.muted(ageStr)}`)
        console.log('')
      }
    })
}
