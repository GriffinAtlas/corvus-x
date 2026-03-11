import { Command } from 'commander'
import { t } from '../theme.js'
import { runStructuredCommand } from '../run-command.js'
import { renderRead } from '../output.js'
import { buildReadSnapshot, extractTweetId } from '../../core/builders/read.js'
import type { ReadSnapshot, MatchKeys } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export { buildReadSnapshot, extractTweetId } from '../../core/builders/read.js'

const READ_MATCH_KEYS: MatchKeys = {}

export function registerReadCommand(program: Command): void {
  program
    .command('read <tweet-id-or-url>')
    .description('Analyze a specific tweet')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (input: string, options: { format: OutputFormat; cost?: boolean }) => {
      const tweetId = extractTweetId(input)
      if (!tweetId) {
        console.log(
          t.error(
            `\n  Invalid tweet ID or URL: ${input}\n  Use a numeric ID or a URL like https://x.com/user/status/123456\n`,
          ),
        )
        process.exit(1)
      }

      await runStructuredCommand<ReadSnapshot>({
        command: 'read',
        topic: `tweet:${tweetId}`,
        format: options.format,
        cost: options.cost,
        spinnerText: `read · ${tweetId}`,
        matchKeys: READ_MATCH_KEYS,
        renderSnapshot: renderRead,
        buildSnapshot: (deps) => buildReadSnapshot(deps, tweetId),
      })
    })
}
