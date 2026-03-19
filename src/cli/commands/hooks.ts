import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderHooks } from '../output.js'
import { HOOKS_MATCH_KEYS } from '../../core/schemas.js'
import { buildHooksSnapshot } from '../../core/builders/hooks.js'
import type { HooksSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export function registerHooksCommand(program: Command): void {
  program
    .command('hooks <topic...>')
    .description('Find conversations to reply to — high-signal engagement opportunities')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --count <n>', 'max tweets to search', '50')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        topicParts: string[],
        options: { format: OutputFormat; count: string; cost?: boolean },
      ) => {
        const topic = topicParts.join(' ')
        const maxResults = Math.min(parseInt(options.count, 10) || 50, 100)

        await runStructuredCommand<HooksSnapshot>({
          command: 'hooks',
          topic,
          format: options.format,
          cost: options.cost,
          spinnerText: `hooks · ${topic}`,
          matchKeys: HOOKS_MATCH_KEYS,
          renderSnapshot: renderHooks,
          buildSnapshot: (deps) => buildHooksSnapshot(deps, topic, maxResults),
        })
      },
    )
}
