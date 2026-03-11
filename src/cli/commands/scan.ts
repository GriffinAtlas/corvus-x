import { Command } from 'commander'
import { runCommand } from '../run-command.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst scanning X (Twitter) discourse.
Scan the conversation around the given topic. Report:
- Key voices and accounts driving the discussion
- Dominant narratives and counter-narratives
- Notable tweets with high engagement
- Emerging consensus or disagreement
Be direct. No emoji. No markdown headers. Use plain text with line breaks.`

export function registerScanCommand(program: Command): void {
  program
    .command('scan <topic...>')
    .description('Scan X discourse on a topic')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (topicParts: string[], options: { format: OutputFormat; cost?: boolean }) => {
      const topic = topicParts.join(' ')
      await runCommand({
        command: 'scan',
        query: topic,
        format: options.format,
        cost: options.cost,
        spinnerText: 'scanning X...',
        execute: (deps) =>
          deps.grok.query(`Scan X discourse on: ${topic}`, {
            systemPrompt: SYSTEM_PROMPT,
            enableXSearch: true,
            maxTokens: 3072,
          }),
      })
    })
}
