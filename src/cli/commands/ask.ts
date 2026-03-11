import { Command } from 'commander'
import { runCommand } from '../run-command.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are Corvus, a sharp and direct intelligence analyst for X (Twitter).
When answering questions about X discourse, be concise and informative.
Lead with the key insight. Include specific accounts and tweets when relevant.
Add brief editorial context when useful ("worth watching", "contrarian signal").
Do not use emoji. Do not use headers or markdown formatting.`

function validateDateRange(from?: string, to?: string): void {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/
  if (from) {
    if (!isoDate.test(from)) throw new Error(`Invalid --from date: ${from} (expected YYYY-MM-DD)`)
    if (new Date(from) > new Date()) throw new Error(`--from date is in the future: ${from}`)
  }
  if (to) {
    if (!isoDate.test(to)) throw new Error(`Invalid --to date: ${to} (expected YYYY-MM-DD)`)
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
    .description('Ask a natural language question about X')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .option('--from <date>', 'filter x_search from date (YYYY-MM-DD)')
    .option('--to <date>', 'filter x_search to date (YYYY-MM-DD)')
    .option('--handle <name...>', 'filter x_search to specific handles (max 10)')
    .action(
      async (
        questionParts: string[],
        options: {
          format: OutputFormat
          cost?: boolean
          from?: string
          to?: string
          handle?: string[]
        },
      ) => {
        validateDateRange(options.from, options.to)
        const handles = normalizeHandles(options.handle)
        const question = questionParts.join(' ')
        await runCommand({
          command: 'ask',
          query: question,
          format: options.format,
          cost: options.cost,
          spinnerText: 'scanning X...',
          execute: (deps) =>
            deps.grok.query(question, {
              systemPrompt: SYSTEM_PROMPT,
              enableXSearch: true,
              xSearchFromDate: options.from,
              xSearchToDate: options.to,
              xSearchHandles: handles,
            }),
        })
      },
    )
}
