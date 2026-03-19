import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderDraft } from '../output.js'
import { buildDraftSnapshot } from '../../core/builders/draft.js'
import type { DraftSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export function registerDraftCommand(program: Command): void {
  program
    .command('draft <topic...>')
    .description('Draft a post or thread in your voice — grounded in current discourse')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--thread', 'generate a multi-post thread')
    .option('--reply-to <url>', 'draft a reply to this tweet/thread')
    .option('--no-context', 'skip search, draft from topic only')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        topicParts: string[],
        options: { format: OutputFormat; thread?: boolean; replyTo?: string; context?: boolean; cost?: boolean },
      ) => {
        const topic = topicParts.join(' ')

        await runStructuredCommand<DraftSnapshot>({
          command: 'draft',
          topic,
          format: options.format,
          cost: options.cost,
          spinnerText: `draft · ${topic}`,
          matchKeys: {},
          renderSnapshot: renderDraft,
          buildSnapshot: (deps) => buildDraftSnapshot(deps, topic, {
            thread: options.thread,
            replyTo: options.replyTo,
            noContext: options.context === false,
          }),
        })
      },
    )
}
