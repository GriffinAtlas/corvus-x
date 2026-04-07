import { Command } from 'commander'
import { t } from '../theme.js'
import { runStructuredCommand } from '../run-command.js'
import { renderReview } from '../output.js'
import { REVIEW_MATCH_KEYS } from '../../core/schemas.js'
import { buildReviewSnapshot } from '../../core/builders/review.js'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import type { ReviewSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export function registerReviewCommand(program: Command): void {
  program
    .command('review')
    .description('Review what worked in your recent posts')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-d, --days <n>', 'analysis window in days', '7')
    .option('--cost', 'show estimated cost before executing')
    .addHelpText('after', `
Examples:
  $ corvus review
  $ corvus review -d 30 -f md`)
    .action(
      async (options: { format: OutputFormat; days: string; cost?: boolean }) => {
        const auth = new AuthManager(ConfigManager.defaultDir())
        const handle = auth.getXHandle()
        if (!handle) {
          console.log(t.error('\n  No X handle configured. Run: corvus auth setup\n'))
          process.exit(1)
        }

        const days = Math.min(parseInt(options.days, 10) || 7, 90)

        await runStructuredCommand<ReviewSnapshot>({
          command: 'review',
          topic: `@${handle}`,
          format: options.format,
          cost: options.cost,
          spinnerText: `review · @${handle} · last ${days}d`,
          matchKeys: REVIEW_MATCH_KEYS,
          renderSnapshot: renderReview,
          buildSnapshot: (deps) => buildReviewSnapshot(deps, handle, days),
        })
      },
    )
}
