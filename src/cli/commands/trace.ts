import { Command } from 'commander'
import { runCommand } from '../run-command.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst tracing narrative spread on X (Twitter).
Trace how the given idea or narrative is spreading. Report:
- Origin: who started this narrative or where did it emerge?
- Amplification: which accounts are boosting it? Are they organic or coordinated?
- Mutation: how is the narrative evolving as it spreads? Key variants?
- Reach: estimated penetration across different communities
- Timeline: when did it start, key inflection points
Be direct. No emoji. No markdown headers. Use plain text with line breaks.`

export function registerTraceCommand(program: Command): void {
  program
    .command('trace <narrative...>')
    .description('Trace the spread of a narrative on X')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (narrativeParts: string[], options: { format: OutputFormat; cost?: boolean }) => {
      const narrative = narrativeParts.join(' ')
      await runCommand({
        command: 'trace',
        query: narrative,
        format: options.format,
        cost: options.cost,
        spinnerText: 'tracing narrative...',
        execute: (deps) =>
          deps.grok.query(`Trace the spread of this narrative on X: ${narrative}`, {
            systemPrompt: SYSTEM_PROMPT,
            enableXSearch: true,
            enableWebSearch: true,
            maxTokens: 4096,
          }),
      })
    })
}
