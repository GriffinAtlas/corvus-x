import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderTrace } from '../output.js'
import { TRACE_MATCH_KEYS } from '../../core/schemas.js'
import { buildTraceSnapshot } from '../../core/builders/trace.js'
import type { TraceSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export { buildTraceSnapshot } from '../../core/builders/trace.js'

export function registerTraceCommand(program: Command): void {
  program
    .command('trace <narrative...>')
    .description('Map how a narrative spreads — origin, amplifiers, mutations')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --count <n>', 'max tweets to analyze', '50')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        narrativeParts: string[],
        options: { format: OutputFormat; count: string; cost?: boolean },
      ) => {
        const narrative = narrativeParts.join(' ')
        const maxResults = Math.min(parseInt(options.count, 10) || 50, 100)

        await runStructuredCommand<TraceSnapshot>({
          command: 'trace',
          topic: narrative,
          format: options.format,
          cost: options.cost,
          spinnerText: `trace · ${narrative}`,
          matchKeys: TRACE_MATCH_KEYS,
          renderSnapshot: renderTrace,
          buildSnapshot: (deps) => buildTraceSnapshot(deps, narrative, maxResults),
        })
      },
    )
}
