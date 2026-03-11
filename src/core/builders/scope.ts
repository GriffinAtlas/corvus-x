import { parseGrokJson } from '../grok-adapter.js'
import type { GrokScopeResponse, ScopeSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

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

export async function buildScopeSnapshot(
  deps: CorvusDeps,
  handle: string,
  tweetCount: number,
): Promise<BuildResult<ScopeSnapshot>> {
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

  const response = await deps.grok.query(`Analyze this X profile:\n\n${profileContext}`, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 3072,
  })

  const grok = parseGrokJson<GrokScopeResponse>(response.text)

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
    const bestEng = best.metrics.likes + best.metrics.retweets + best.metrics.replies
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
    tweets: [],
    scores: [],
    newestTweetAt: null,
  }
}
