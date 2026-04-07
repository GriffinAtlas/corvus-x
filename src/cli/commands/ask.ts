import { Command } from 'commander'
import { runCommand } from '../run-command.js'
import { t } from '../theme.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are a sharp and direct intelligence analyst for X (Twitter).
Be concise and informative. Lead with the key insight.
Include specific accounts and tweets when relevant.
Add brief editorial context when useful ("worth watching", "contrarian signal").
Filter out spam, scam promotions, memecoin shills, and bot activity — focus on genuine discourse.
Do not use emoji. Do not use headers or markdown formatting.`

export function isValidCalendarDate(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

export function validateDateRange(from?: string, to?: string): void {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/
  if (from) {
    if (!isoDate.test(from)) throw new Error(`Invalid --from date: ${from} (expected YYYY-MM-DD)`)
    if (!isValidCalendarDate(from)) throw new Error(`Invalid calendar date: ${from}`)
    if (new Date(from) > new Date()) throw new Error(`--from date is in the future: ${from}`)
  }
  if (to) {
    if (!isoDate.test(to)) throw new Error(`Invalid --to date: ${to} (expected YYYY-MM-DD)`)
    if (!isValidCalendarDate(to)) throw new Error(`Invalid calendar date: ${to}`)
    if (new Date(to) > new Date()) throw new Error(`--to date is in the future: ${to}`)
  }
  if (from && to && new Date(to) < new Date(from)) {
    throw new Error(`--to (${to}) is before --from (${from})`)
  }
}

function normalizeHandles(handles?: string[]): string[] | undefined {
  if (!handles?.length) return undefined
  if (handles.length > 10) throw new Error('Maximum 10 handles allowed (xAI limit)')
  return handles.map((h) => h.replace(/^@/, ''))
}

export function registerAskCommand(program: Command): void {
  program
    .command('ask <question...>')
    .description('Quick prose answer via Grok x_search')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .option('--from <date>', 'filter x_search from date (YYYY-MM-DD)')
    .option('--to <date>', 'filter x_search to date (YYYY-MM-DD)')
    .option('--handle <name...>', 'filter x_search to specific handles (max 10)')
    .option('--exclude-handle <name...>', 'exclude specific handles from x_search (max 10)')
    .addHelpText('after', `
Examples:
  $ corvus ask "what's trending in AI today?"
  $ corvus ask "what did @elonmusk say about X?" --handle elonmusk
  $ corvus ask "major crypto news" --from 2025-03-01 --to 2025-03-15`)
    .action(
      async (
        questionParts: string[],
        options: {
          format: OutputFormat
          cost?: boolean
          from?: string
          to?: string
          handle?: string[]
          excludeHandle?: string[]
        },
      ) => {
        try {
          validateDateRange(options.from, options.to)
        } catch (err) {
          console.log(t.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`))
          process.exit(1)
        }
        let handles: string[] | undefined
        let excludeHandles: string[] | undefined
        try {
          handles = normalizeHandles(options.handle)
          excludeHandles = normalizeHandles(options.excludeHandle)
        } catch (err) {
          console.log(t.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`))
          process.exit(1)
        }
        if (handles && excludeHandles) {
          console.log(
            t.error('\n  Cannot use both --handle and --exclude-handle. Pick one.\n'),
          )
          process.exit(1)
        }
        const question = questionParts.join(' ')
        const queryOpts = {
          systemPrompt: SYSTEM_PROMPT,
          enableXSearch: true,
          xSearchFromDate: options.from,
          xSearchToDate: options.to,
          xSearchHandles: handles,
          xSearchExcludeHandles: excludeHandles,
        }
        await runCommand({
          command: 'ask',
          query: question,
          format: options.format,
          cost: options.cost,
          spinnerText: 'scanning X...',
          execute: (deps) => deps.grok.query(question, queryOpts),
          executeStream: (deps, onChunk) => deps.grok.queryStream(question, queryOpts, onChunk),
        })
      },
    )
}
