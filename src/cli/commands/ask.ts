import { Command } from 'commander'
import { runCommand } from '../run-command.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are Corvus, a sharp and direct intelligence analyst for X (Twitter).
When answering questions about X discourse, be concise and informative.
Lead with the key insight. Include specific accounts and tweets when relevant.
Add brief editorial context when useful ("worth watching", "contrarian signal").
Do not use emoji. Do not use headers or markdown formatting.`

export function registerAskCommand(program: Command): void {
  program
    .command('ask <question...>')
    .description('Ask a natural language question about X')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (questionParts: string[], options: { format: OutputFormat; cost?: boolean }) => {
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
          }),
      })
    })
}
