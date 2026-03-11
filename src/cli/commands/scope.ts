import { Command } from 'commander'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import type { OutputFormat } from '../output.js'
import type { CommandResult } from '../../core/types.js'

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
    .action(async (username: string, options: { format: OutputFormat; tweets: string }) => {
      const handle = username.replace(/^@/, '')
      const auth = new AuthManager(ConfigManager.defaultDir())

      const grokKey = auth.getGrokKey()
      if (!grokKey) {
        const chalk = (await import('chalk')).default
        console.log(chalk.red('\n  No Grok API key found. Run: corvus auth setup\n'))
        process.exit(1)
      }

      const xToken = auth.getXToken()
      if (!xToken) {
        const chalk = (await import('chalk')).default
        console.log(chalk.red('\n  X API token required for scope. Run: corvus auth setup\n'))
        process.exit(1)
      }

      const [{ default: ora }, { GrokAdapter }, { XAdapter }, { formatOutput }] = await Promise.all([
        import('ora'),
        import('../../core/grok-adapter.js'),
        import('../../core/x-adapter.js'),
        import('../output.js'),
      ])

      const spinner = ora({ text: `scoping @${handle}...`, indent: 2 }).start()

      try {
        const x = new XAdapter(xToken)
        const user = await x.getUser(handle)
        const tweetCount = Math.min(parseInt(options.tweets, 10) || 10, 100)
        const tweets = await x.getUserTweets(user.id, tweetCount)

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

        const grok = new GrokAdapter(grokKey)
        const response = await grok.query(`Analyze this X profile:\n\n${profileContext}`, {
          systemPrompt: SYSTEM_PROMPT,
          enableXSearch: true,
          maxTokens: 3072,
        })

        spinner.stop()

        const result: CommandResult = {
          command: 'scope',
          query: `@${handle}`,
          response: response.text,
          cost: response.usage.costUsd,
          cached: false,
          timestamp: Date.now(),
        }

        console.log(formatOutput(result, options.format))
      } catch (err) {
        spinner.stop()
        const chalk = (await import('chalk')).default
        const msg = err instanceof Error ? err.message : String(err)
        console.log(chalk.red(`\n  Error: ${msg}\n`))
        process.exit(1)
      }
    })
}
