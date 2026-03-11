import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderPulse } from '../output.js'
import { computeBaseMetrics, computeSentiment, computeKeyVoices } from '../../core/metrics.js'
import { PULSE_MATCH_KEYS } from '../../core/schemas.js'
import { formatTweetsForAnalysis } from '../../core/x-adapter.js'
import type { GrokPulseResponse, PulseSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are an intelligence analyst reading market/social pulse. Analyze the tweets below and return ONLY a JSON object:
{
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "bullSignals": ["positive signal"],
  "bearSignals": ["negative signal"]
}
Rules:
- One entry per tweet in tweetAnalysis, referenced by index.
- sentiment: -1.0 to 1.0.
- narrative: assign each tweet to a theme.
- bullSignals: 2-5 reasons for optimism found in the discourse.
- bearSignals: 2-5 reasons for concern found in the discourse.
- Return ONLY valid JSON.`

export function registerPulseCommand(program: Command): void {
  program
    .command('pulse <topic...>')
    .description('Get the pulse — sentiment, bull/bear signals, key voices')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --count <n>', 'max tweets to analyze', '50')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        topicParts: string[],
        options: { format: OutputFormat; count: string; cost?: boolean },
      ) => {
        const topic = topicParts.join(' ')
        const maxResults = Math.min(parseInt(options.count, 10) || 50, 100)

        await runStructuredCommand<PulseSnapshot>({
          command: 'pulse',
          topic,
          format: options.format,
          cost: options.cost,
          spinnerText: 'reading pulse...',
          matchKeys: PULSE_MATCH_KEYS,
          renderSnapshot: renderPulse,
          buildSnapshot: async (deps) => {
            if (!deps.x) throw new Error('X API token required for pulse. Run: corvus auth setup')

            const { tweets, users } = await deps.x.searchRecent(topic, maxResults)
            if (tweets.length === 0) throw new Error(`No tweets found for "${topic}"`)

            const tweetBlock = formatTweetsForAnalysis(tweets, users)
            const response = await deps.grok.query(
              `Read the pulse on "${topic}" from these ${tweets.length} tweets:\n\n${tweetBlock}`,
              { systemPrompt: SYSTEM_PROMPT, maxTokens: 3072 },
            )

            const grok = JSON.parse(response.text) as GrokPulseResponse
            const metrics = computeBaseMetrics(tweets)
            const sentiment = computeSentiment(grok.tweetAnalysis)
            const keyVoices = computeKeyVoices(tweets, grok.tweetAnalysis, users)

            return {
              data: {
                metrics,
                sentiment,
                bullSignals: grok.bullSignals,
                bearSignals: grok.bearSignals,
                keyVoices,
              },
              raw: response.text,
              cost: response.usage.costUsd,
            }
          },
        })
      },
    )
}
