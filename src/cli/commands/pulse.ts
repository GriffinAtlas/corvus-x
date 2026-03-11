import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderPulse } from '../output.js'
import { PULSE_MATCH_KEYS } from '../../core/schemas.js'
import { buildPulseSnapshot } from '../../core/builders/pulse.js'
import type { PulseSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export { buildPulseSnapshot } from '../../core/builders/pulse.js'

export function registerPulseCommand(program: Command): void {
  program
    .command('pulse <topic...>')
    .description('Get the pulse — sentiment, bull/bear signals, key voices')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --count <n>', 'max tweets to analyze', '50')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        topicParts: string[],
        options: { format: OutputFormat; count: string; cost?: boolean },
      ) => {
        const topic = topicParts.join(' ')
        const maxResults = Math.min(parseInt(options.count, 10) || 50, 100)

        await runStructuredCommand<PulseSnapshot>({
          command: 'pulse',
          topic,
          format: options.format,
          cost: options.cost,
          spinnerText: `pulse · ${topic}`,
          matchKeys: PULSE_MATCH_KEYS,
          renderSnapshot: renderPulse,
          buildSnapshot: (deps) => buildPulseSnapshot(deps, topic, maxResults),
        })
      },
    )
}
