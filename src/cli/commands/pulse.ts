import { Command } from 'commander'
import { runCommand } from '../run-command.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst reading the pulse of X (Twitter).
For the given topic, report the current pulse:
- Sentiment: overall mood — bullish, bearish, neutral, mixed. What's the prevailing tone?
- Volume: is this topic generating significant conversation or is it quiet?
- Momentum: is interest rising, falling, or stable? Any inflection points?
- Key signals: notable tweets, threads, or accounts shaping the conversation right now
- Contrarian signals: any notable dissent or counter-narratives worth tracking?
Be direct. No emoji. No markdown headers. Use plain text with line breaks.`

export function registerPulseCommand(program: Command): void {
  program
    .command('pulse <topic...>')
    .description('Get the pulse on a topic — sentiment, momentum, key signals')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (topicParts: string[], options: { format: OutputFormat; cost?: boolean }) => {
      const topic = topicParts.join(' ')
      await runCommand({
        command: 'pulse',
        query: topic,
        format: options.format,
        cost: options.cost,
        spinnerText: 'reading pulse...',
        execute: (deps) =>
          deps.grok.query(`What's the current pulse on X for: ${topic}`, {
            systemPrompt: SYSTEM_PROMPT,
            enableXSearch: true,
            enableWebSearch: true,
            maxTokens: 3072,
          }),
      })
    })
}
