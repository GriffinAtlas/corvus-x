import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderPulse } from '../output.js'
import { computeBaseMetrics, computeSentiment, computeKeyVoices } from '../../core/metrics.js'
import { PULSE_MATCH_KEYS } from '../../core/schemas.js'
import { formatTweetsForAnalysis } from '../../core/x-adapter.js'
import { parseGrokJson } from '../../core/grok-adapter.js'
import type { GrokPulseResponse, PulseSnapshot } from '../../core/schemas.js'
import type { BuildResult } from '../../core/types.js'
import type { CommandDeps } from '../run-command.js'
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

export async function buildPulseSnapshot(
  deps: CommandDeps,
  topic: string,
  maxResults: number,
  pages = 1,
): Promise<BuildResult<PulseSnapshot>> {
  if (!deps.x) throw new Error('X API token required for pulse. Run: corvus auth setup')

  const { tweets, users } = await deps.x.searchRecent(topic, maxResults, pages)
  if (tweets.length === 0) throw new Error(`No tweets found for "${topic}"`)

  const tweetBlock = formatTweetsForAnalysis(tweets, users)
  const response = await deps.grok.query(
    `Read the pulse on "${topic}" from these ${tweets.length} tweets:\n\n${tweetBlock}`,
    { systemPrompt: SYSTEM_PROMPT, maxTokens: 3072 },
  )

  const grok = parseGrokJson<GrokPulseResponse>(response.text)
  const metrics = computeBaseMetrics(tweets)
  const sentiment = computeSentiment(grok.tweetAnalysis)
  const keyVoices = computeKeyVoices(tweets, grok.tweetAnalysis, users)

  const newestTweetAt =
    tweets.reduce((max, t) => {
      const ts = new Date(t.createdAt).getTime()
      return Number.isFinite(ts) && ts > max ? ts : max
    }, 0) || null

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
    tweets,
    scores: grok.tweetAnalysis,
    newestTweetAt,
  }
}

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
          spinnerText: `pulse · ${topic}`,
          matchKeys: PULSE_MATCH_KEYS,
          renderSnapshot: renderPulse,
          buildSnapshot: (deps) => buildPulseSnapshot(deps, topic, maxResults),
        })
      },
    )
}
