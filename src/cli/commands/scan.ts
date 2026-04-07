import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderScan } from '../output.js'
import { SCAN_MATCH_KEYS } from '../../core/schemas.js'
import { buildScanSnapshot } from '../../core/builders/scan.js'
import type { ScanSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export { buildScanSnapshot } from '../../core/builders/scan.js'

export function registerScanCommand(program: Command): void {
  program
    .command('scan <topic...>')
    .description('Snapshot a topic: narratives, top voices, engagement')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --count <n>', 'max tweets to analyze', '50')
    .option('--cost', 'show estimated cost before executing')
    .addHelpText('after', `
Examples:
  $ corvus scan AI regulation
  $ corvus scan "open source LLMs" -n 100 -f json`)
    .action(
      async (
        topicParts: string[],
        options: { format: OutputFormat; count: string; cost?: boolean },
      ) => {
        const topic = topicParts.join(' ')
        const maxResults = Math.min(parseInt(options.count, 10) || 50, 100)

        await runStructuredCommand<ScanSnapshot>({
          command: 'scan',
          topic,
          format: options.format,
          cost: options.cost,
          spinnerText: `scan · ${topic}`,
          matchKeys: SCAN_MATCH_KEYS,
          renderSnapshot: renderScan,
          buildSnapshot: (deps) => buildScanSnapshot(deps, topic, maxResults),
        })
      },
    )
}
