import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderTrace } from '../output.js'
import { computeBaseMetrics } from '../../core/metrics.js'
import { TRACE_MATCH_KEYS } from '../../core/schemas.js'
import { formatTweetsForAnalysis } from '../../core/x-adapter.js'
import type { GrokTraceResponse, TraceSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are an intelligence analyst tracing narrative spread. Analyze the tweets below and return ONLY a JSON object:
{
  "tweetAnalysis": [{ "index": 0, "sentiment": 0.5, "narrative": "theme" }],
  "originIndex": 0,
  "phases": [{ "name": "emergence", "tweetIndices": [0, 1], "timeframe": "Mar 8 morning" }],
  "mutations": [{ "original": "original framing", "variant": "evolved framing" }]
}
Rules:
- One entry per tweet in tweetAnalysis, referenced by index.
- originIndex: index of the earliest/originating tweet, or null if unclear.
- phases: group tweets by spread phase (emergence, amplification, mainstream, etc.).
- mutations: how the narrative evolved as it spread (0-5 entries).
- Return ONLY valid JSON.`

export function registerTraceCommand(program: Command): void {
  program
    .command('trace <narrative...>')
    .description('Trace the spread of a narrative on X')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --count <n>', 'max tweets to analyze', '50')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        narrativeParts: string[],
        options: { format: OutputFormat; count: string; cost?: boolean },
      ) => {
        const narrative = narrativeParts.join(' ')
        const maxResults = Math.min(parseInt(options.count, 10) || 50, 100)

        await runStructuredCommand<TraceSnapshot>({
          command: 'trace',
          topic: narrative,
          format: options.format,
          cost: options.cost,
          spinnerText: 'tracing narrative...',
          matchKeys: TRACE_MATCH_KEYS,
          renderSnapshot: renderTrace,
          buildSnapshot: async (deps) => {
            if (!deps.x) throw new Error('X API token required for trace. Run: corvus auth setup')

            const { tweets, users } = await deps.x.searchRecent(narrative, maxResults)
            if (tweets.length === 0) throw new Error(`No tweets found for "${narrative}"`)

            const userMap = new Map(users.map((u) => [u.id, u]))
            const tweetBlock = formatTweetsForAnalysis(tweets, users)
            const response = await deps.grok.query(
              `Trace how this narrative is spreading: "${narrative}"\n\nTweets:\n${tweetBlock}`,
              { systemPrompt: SYSTEM_PROMPT, maxTokens: 4096 },
            )

            const grok = JSON.parse(response.text) as GrokTraceResponse
            const metrics = computeBaseMetrics(tweets)

            let origin: TraceSnapshot['origin'] = null
            if (
              grok.originIndex !== null &&
              grok.originIndex >= 0 &&
              grok.originIndex < tweets.length
            ) {
              const t = tweets[grok.originIndex]
              const user = userMap.get(t.authorId)
              origin = {
                account: user?.username ?? t.authorId,
                date: t.createdAt,
                tweetId: t.id,
                content: t.text,
              }
            }

            const timeline = grok.phases.map((phase) => {
              const phaseTweets = phase.tweetIndices
                .filter((i) => i >= 0 && i < tweets.length)
                .map((i) => tweets[i])
              const amplifiers = phaseTweets
                .map((t) => userMap.get(t.authorId)?.username ?? t.authorId)
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, 5)
              return {
                phase: phase.name,
                tweetCount: phaseTweets.length,
                keyAmplifiers: amplifiers,
                timeframe: phase.timeframe,
              }
            })

            return {
              data: {
                metrics,
                origin,
                timeline,
                mutations: grok.mutations,
                reach: {
                  totalTweets: metrics.tweetCount,
                  totalEngagement: metrics.totalEngagement,
                  uniqueAuthors: metrics.uniqueAuthors,
                },
              },
              raw: response.text,
              cost: response.usage.costUsd,
            }
          },
        })
      },
    )
}
