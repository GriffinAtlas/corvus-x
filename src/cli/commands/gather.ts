import { Command } from 'commander'
import { runCommand } from '../run-command.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst compiling a comprehensive intelligence brief from X (Twitter) and web sources.
Gather all available intelligence on the given topic. Produce a thorough brief:
- Executive summary: the single most important thing to know right now
- X discourse: dominant narratives, key voices, engagement patterns, sentiment
- Web context: relevant news, developments, or events driving the conversation
- Network analysis: which communities are engaged? Any coordinated activity?
- Source assessment: which sources are most credible? Any notable bias or agenda?
- Forward look: what's likely to happen next? What to watch for?
Be thorough but direct. No emoji. No markdown headers. Use plain text with clear section breaks.`

export function registerGatherCommand(program: Command): void {
  program
    .command('gather <topic...>')
    .description('Comprehensive intelligence gathering on a topic')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (topicParts: string[], options: { format: OutputFormat; cost?: boolean }) => {
      const topic = topicParts.join(' ')
      await runCommand({
        command: 'gather',
        query: topic,
        format: options.format,
        cost: options.cost,
        spinnerText: 'gathering intelligence...',
        execute: (deps) =>
          deps.grok.query(`Compile a comprehensive intelligence brief on: ${topic}`, {
            systemPrompt: SYSTEM_PROMPT,
            enableXSearch: true,
            enableWebSearch: true,
            maxTokens: 6144,
          }),
      })
    })
}
