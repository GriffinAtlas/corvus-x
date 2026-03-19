import { Command } from 'commander'
import { t } from '../theme.js'
import { runStructuredCommand } from '../run-command.js'
import { renderTiming } from '../output.js'
import { TIMING_MATCH_KEYS } from '../../core/schemas.js'
import { buildTimingSnapshot } from '../../core/builders/timing.js'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import type { TimingSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export function registerTimingCommand(program: Command): void {
  program
    .command('timing [topic...]')
    .description('Best times to post — based on your audience or a topic\'s activity')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-d, --days <n>', 'lookback window for self-analysis', '30')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        topicParts: string[],
        options: { format: OutputFormat; days: string; cost?: boolean },
      ) => {
        const topic = topicParts.length > 0 ? topicParts.join(' ') : undefined
        const days = Math.min(parseInt(options.days, 10) || 30, 90)

        const auth = new AuthManager(ConfigManager.defaultDir())
        const handle = auth.getXHandle()

        if (!topic && !handle) {
          console.log(t.error('\n  No X handle configured. Run: corvus auth setup\n  Or provide a topic: corvus timing <topic>\n'))
          process.exit(1)
        }

        const label = topic ? `timing · ${topic}` : `timing · @${handle}`

        await runStructuredCommand<TimingSnapshot>({
          command: 'timing',
          topic: topic ?? `@${handle}`,
          format: options.format,
          cost: options.cost,
          spinnerText: label,
          matchKeys: TIMING_MATCH_KEYS,
          renderSnapshot: renderTiming,
          buildSnapshot: (deps) => buildTimingSnapshot(deps, {
            handle: topic ? undefined : handle!,
            topic,
            days,
          }),
        })
      },
    )
}
