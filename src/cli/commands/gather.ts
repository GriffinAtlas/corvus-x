import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderGather } from '../output.js'
import { GATHER_MATCH_KEYS } from '../../core/schemas.js'
import { buildGatherSnapshot } from '../../core/builders/gather.js'
import type { GatherSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export { buildGatherSnapshot } from '../../core/builders/gather.js'

export function registerGatherCommand(program: Command): void {
  program
    .command('gather <topic...>')
    .description('Deep intelligence — X discourse + web context + outlook')
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

        await runStructuredCommand<GatherSnapshot>({
          command: 'gather',
          topic,
          format: options.format,
          cost: options.cost,
          spinnerText: `gather · ${topic}`,
          matchKeys: GATHER_MATCH_KEYS,
          renderSnapshot: renderGather,
          buildSnapshot: (deps) => buildGatherSnapshot(deps, topic, maxResults),
        })
      },
    )
}
