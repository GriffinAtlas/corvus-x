import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderGather } from '../output.js'
import {
  computeBaseMetrics,
  computeSentiment,
  computeTopPosts,
  computeNarratives,
} from '../../core/metrics.js'
import { GATHER_MATCH_KEYS } from '../../core/schemas.js'
import { formatTweetsForAnalysis } from '../../core/x-adapter.js'
import { parseGrokJson } from '../../core/grok-adapter.js'
import type { GrokGatherResponse, GatherSnapshot } from '../../core/schemas.js'
import type { BuildResult } from '../../core/types.js'
import type { CommandDeps } from '../run-command.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are an intelligence analyst compiling a comprehensive brief. Analyze the tweets below and return ONLY a JSON object:
{
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "narratives": [{ "theme": "name", "description": "brief description" }],
  "signals": ["notable observation"],
  "webContext": ["relevant context from web"],
  "outlook": "forward-looking assessment"
}
Rules:
- One entry per tweet in tweetAnalysis, referenced by index.
- narratives: 3-7 themes with descriptions.
- signals: 3-5 key observations.
- webContext: 2-4 items of relevant web context (news, events, developments).
- outlook: 1-2 sentence forward-looking assessment.
- Return ONLY valid JSON.`

export async function buildGatherSnapshot(
  deps: CommandDeps,
  topic: string,
  maxResults: number,
  pages = 1,
): Promise<BuildResult<GatherSnapshot>> {
  if (!deps.x) throw new Error('X API token required for gather. Run: corvus auth setup')

  const { tweets, users } = await deps.x.searchRecent(topic, maxResults, pages)
  if (tweets.length === 0) throw new Error(`No tweets found for "${topic}"`)

  const tweetBlock = formatTweetsForAnalysis(tweets, users)
  const response = await deps.grok.query(
    `Compile intelligence brief on "${topic}" from these ${tweets.length} tweets:\n\n${tweetBlock}`,
    { systemPrompt: SYSTEM_PROMPT, enableWebSearch: true, maxTokens: 6144 },
  )

  const grok = parseGrokJson<GrokGatherResponse>(response.text)
  const metrics = computeBaseMetrics(tweets)
  const sentiment = computeSentiment(grok.tweetAnalysis)
  const topPosts = computeTopPosts(tweets, users)
  const narratives = computeNarratives(grok.tweetAnalysis, grok.narratives)

  const newestTweetAt =
    tweets.reduce((max, t) => {
      const ts = new Date(t.createdAt).getTime()
      return Number.isFinite(ts) && ts > max ? ts : max
    }, 0) || null

  return {
    data: {
      metrics,
      sentiment,
      topPosts,
      narratives,
      webContext: grok.webContext,
      outlook: grok.outlook,
    },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets,
    scores: grok.tweetAnalysis,
    newestTweetAt,
  }
}

export function registerGatherCommand(program: Command): void {
  program
    .command('gather <topic...>')
    .description('Comprehensive intelligence gathering on a topic')
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

        await runStructuredCommand<GatherSnapshot>({
          command: 'gather',
          topic,
          format: options.format,
          cost: options.cost,
          spinnerText: `gather · ${topic}`,
          matchKeys: GATHER_MATCH_KEYS,
          renderSnapshot: renderGather,
          buildSnapshot: (deps) => buildGatherSnapshot(deps, topic, maxResults),
        })
      },
    )
}
