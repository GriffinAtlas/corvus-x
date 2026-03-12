import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderScope } from '../output.js'
import { buildScopeSnapshot } from '../../core/builders/scope.js'
import type { ScopeSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export { buildScopeSnapshot } from '../../core/builders/scope.js'

export function registerScopeCommand(program: Command): void {
  program
    .command('scope <username>')
    .description('Profile an account — influence, patterns, signal value')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --tweets <count>', 'number of recent tweets to analyze', '10')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        username: string,
        options: { format: OutputFormat; tweets: string; cost?: boolean },
      ) => {
        const handle = username.replace(/^@/, '')
        const tweetCount = Math.min(parseInt(options.tweets, 10) || 10, 100)

        await runStructuredCommand<ScopeSnapshot>({
          command: 'scope',
          topic: `@${handle}`,
          format: options.format,
          cost: options.cost,
          spinnerText: `scope · @${handle}`,
          matchKeys: {},
          renderSnapshot: renderScope,
          buildSnapshot: (deps) => buildScopeSnapshot(deps, handle, tweetCount),
        })
      },
    )
}
