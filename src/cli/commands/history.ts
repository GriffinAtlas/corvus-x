import { Command } from 'commander'
import chalk from 'chalk'
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
          chalk.dim('\n  No snapshots stored yet. Run a command like `corvus scan bitcoin` first.\n'),
        )
        return
      }

      console.log('')
      console.log(`  ${chalk.bold('Snapshot History')}`)
      console.log(`  ${chalk.dim('───────────────────────────────────────────')}`)
      console.log('')

      for (const t of topics) {
        const age = Date.now() - t.latest
        const ageStr =
          age < 3_600_000
            ? `${Math.floor(age / 60_000)}m ago`
            : age < 86_400_000
              ? `${Math.floor(age / 3_600_000)}h ago`
              : `${Math.floor(age / 86_400_000)}d ago`

        console.log(`  ${chalk.bold(t.command)} ${chalk.dim('·')} ${t.topic}`)
        console.log(`    ${t.count} snapshots  latest: ${chalk.dim(ageStr)}`)
        console.log('')
      }
    })
}
