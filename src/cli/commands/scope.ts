import { Command } from 'commander'
import { runCommand } from '../run-command.js'
import type { OutputFormat } from '../output.js'

const SYSTEM_PROMPT = `You are Corvus, an intelligence analyst profiling X (Twitter) accounts.
You've been given raw profile and tweet data. Build a profile:
- Who is this person? What are they known for?
- Influence assessment: reach, engagement quality, network position
- Content patterns: what topics do they cover, what's their angle?
- Recent activity: what have they been focused on lately?
- Signal value: how useful is this account for intelligence gathering?
Be direct. No emoji. No markdown headers. Use plain text with line breaks.`

export function registerScopeCommand(program: Command): void {
  program
    .command('scope <username>')
    .description('Profile analysis of an X account')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --tweets <count>', 'number of recent tweets to analyze', '10')
    .option('--cost', 'show estimated cost before executing')
    .action(async (username: string, options: { format: OutputFormat; tweets: string; cost?: boolean }) => {
      const handle = username.replace(/^@/, '')
      const tweetCount = Math.min(parseInt(options.tweets, 10) || 10, 100)

      await runCommand({
        command: 'scope',
        query: `@${handle}`,
        format: options.format,
        cost: options.cost,
        spinnerText: `scoping @${handle}...`,
        requiresXToken: true,
        execute: async (deps) => {
          const user = await deps.x!.getUser(handle)
          const tweets = await deps.x!.getUserTweets(user.id, tweetCount)

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
            ...tweets.map((t, i) =>
              `${i + 1}. [${t.createdAt}] ${t.text} (${t.metrics.likes} likes, ${t.metrics.retweets} RTs)`
            ),
          ].join('\n')

          return deps.grok.query(`Analyze this X profile:\n\n${profileContext}`, {
            systemPrompt: SYSTEM_PROMPT,
            enableXSearch: true,
            maxTokens: 3072,
          })
        },
      })
    })
}
