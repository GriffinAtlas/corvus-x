import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderScan } from '../output.js'
import {
  computeBaseMetrics,
  computeSentiment,
  computeTopAccounts,
  computeNarratives,
} from '../../core/metrics.js'
import { SCAN_MATCH_KEYS } from '../../core/schemas.js'
import { formatTweetsForAnalysis } from '../../core/x-adapter.js'
import type { GrokScanResponse, ScanSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are an intelligence analyst. Analyze the tweets below and return ONLY a JSON object:
{
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "narratives": [{ "theme": "name", "description": "brief description" }],
  "signals": ["notable observation"]
}
Rules:
- One entry per tweet in tweetAnalysis, referenced by index.
- sentiment: -1.0 (very negative) to 1.0 (very positive).
- narrative: assign each tweet to one of 2-5 themes you identify.
- signals: 3-5 key observations about the discourse.
- Return ONLY valid JSON.`

export function registerScanCommand(program: Command): void {
  program
    .command('scan <topic...>')
    .description('Scan X discourse on a topic')
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

        await runStructuredCommand<ScanSnapshot>({
          command: 'scan',
          topic,
          format: options.format,
          cost: options.cost,
          spinnerText: 'scanning X...',
          matchKeys: SCAN_MATCH_KEYS,
          renderSnapshot: renderScan,
          buildSnapshot: async (deps) => {
            if (!deps.x) throw new Error('X API token required for scan. Run: corvus auth setup')

            const { tweets, users } = await deps.x.searchRecent(topic, maxResults)
            if (tweets.length === 0) throw new Error(`No tweets found for "${topic}"`)

            const tweetBlock = formatTweetsForAnalysis(tweets, users)
            const response = await deps.grok.query(
              `Analyze these ${tweets.length} tweets about "${topic}":\n\n${tweetBlock}`,
              { systemPrompt: SYSTEM_PROMPT, maxTokens: 3072 },
            )

            const grok = JSON.parse(response.text) as GrokScanResponse
            const metrics = computeBaseMetrics(tweets)
            const sentiment = computeSentiment(grok.tweetAnalysis)
            const topAccounts = computeTopAccounts(tweets, grok.tweetAnalysis, users)
            const narratives = computeNarratives(grok.tweetAnalysis, grok.narratives)

            return {
              data: { metrics, sentiment, topAccounts, narratives, signals: grok.signals },
              raw: response.text,
              cost: response.usage.costUsd,
            }
          },
        })
      },
    )
}
