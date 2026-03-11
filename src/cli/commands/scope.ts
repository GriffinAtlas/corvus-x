import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderScope } from '../output.js'
import type { GrokScopeResponse, ScopeSnapshot, MatchKeys } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are an intelligence analyst profiling a social media account. Return ONLY a JSON object:
{
  "contentPatterns": ["pattern 1"],
  "recentFocus": ["focus area 1"],
  "networkPosition": "description of their network role",
  "influence": "high",
  "signalValue": "high"
}
Rules:
- contentPatterns: 3-5 patterns in their content.
- recentFocus: 2-4 topics they're focused on recently.
- networkPosition: one sentence about their network role.
- influence: "high", "medium", or "low".
- signalValue: how useful for intelligence — "high", "medium", or "low".
- Return ONLY valid JSON.`

const SCOPE_MATCH_KEYS: MatchKeys = {}

export function registerScopeCommand(program: Command): void {
  program
    .command('scope <username>')
    .description('Profile analysis of an X account')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --tweets <count>', 'number of recent tweets to analyze', '10')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        username: string,
        options: { format: OutputFormat; tweets: string; cost?: boolean },
      ) => {
        const handle = username.replace(/^@/, '')
        const tweetCount = Math.min(parseInt(options.tweets, 10) || 10, 100)

        await runStructuredCommand<ScopeSnapshot>({
          command: 'scope',
          topic: `@${handle}`,
          format: options.format,
          cost: options.cost,
          spinnerText: `scoping @${handle}...`,
          matchKeys: SCOPE_MATCH_KEYS,
          renderSnapshot: renderScope,
          buildSnapshot: async (deps) => {
            if (!deps.x) throw new Error('X API token required for scope. Run: corvus auth setup')

            const user = await deps.x.getUser(handle)
            const tweets = await deps.x.getUserTweets(user.id, tweetCount)

            const profileContext = [
              `Username: @${user.username}`,
              `Name: ${user.name}`,
              `Bio: ${user.description}`,
              `Followers: ${user.followersCount}`,
              `Following: ${user.followingCount}`,
              `Tweets: ${user.tweetCount}`,
              `Verified: ${user.verified}`,
              '',
              `Recent tweets (${tweets.length}):`,
              ...tweets.map(
                (t, i) =>
                  `${i + 1}. [${t.createdAt}] ${t.text} (${t.metrics.likes} likes, ${t.metrics.retweets} RTs)`,
              ),
            ].join('\n')

            const response = await deps.grok.query(
              `Analyze this X profile:\n\n${profileContext}`,
              { systemPrompt: SYSTEM_PROMPT, maxTokens: 3072 },
            )

            const grok = JSON.parse(response.text) as GrokScopeResponse

            const totalEng = tweets.reduce(
              (sum, t) => sum + t.metrics.likes + t.metrics.retweets + t.metrics.replies,
              0,
            )
            const avgEngagement = tweets.length > 0 ? Math.round(totalEng / tweets.length) : 0

            let topTweet: ScopeSnapshot['recentActivity']['topTweet'] = null
            if (tweets.length > 0) {
              const best = tweets.reduce((a, b) => {
                const aEng = a.metrics.likes + a.metrics.retweets + a.metrics.replies
                const bEng = b.metrics.likes + b.metrics.retweets + b.metrics.replies
                return bEng > aEng ? b : a
              })
              const bestEng =
                best.metrics.likes + best.metrics.retweets + best.metrics.replies
              topTweet = {
                id: best.id,
                text: best.text.length > 200 ? best.text.slice(0, 200) + '...' : best.text,
                engagement: bestEng,
              }
            }

            return {
              data: {
                account: {
                  handle: user.username,
                  followers: user.followersCount,
                  following: user.followingCount,
                  tweetCount: user.tweetCount,
                },
                recentActivity: {
                  avgEngagement,
                  postsAnalyzed: tweets.length,
                  topTweet,
                },
                contentPatterns: grok.contentPatterns,
                recentFocus: grok.recentFocus,
                networkPosition: grok.networkPosition,
                influence: grok.influence,
                signalValue: grok.signalValue,
              },
              raw: response.text,
              cost: response.usage.costUsd,
            }
          },
        })
      },
    )
}
