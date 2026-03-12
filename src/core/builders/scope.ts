import { parseGrokJson } from '../grok-adapter.js'
import type { GrokScopeResponse, ScopeSnapshot } from '../schemas.js'
import type { GrokOnlyScopeResponse } from './grok-only.js'
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

const GROK_ONLY_PROMPT = `You are an intelligence analyst profiling a social media account. Search X for this user's recent posts and profile information. Return ONLY a JSON object:
{
  "account": {
    "handle": "username",
    "followers": 5000,
    "following": 200,
    "tweetCount": 500
  },
  "recentActivity": {
    "avgEngagement": 50,
    "postsAnalyzed": 10,
    "topTweet": { "id": "123", "text": "top post text", "engagement": 500 }
  },
  "contentPatterns": ["pattern 1"],
  "recentFocus": ["focus area 1"],
  "networkPosition": "description of their network role",
  "influence": "high",
  "signalValue": "high"
}
Rules:
- Search X for this user's recent posts and profile.
- account: profile stats (best effort estimates if exact numbers unavailable).
- recentActivity: engagement summary from recent posts.
- topTweet: their highest-engagement recent post, or null if unavailable.
- contentPatterns: 3-5 patterns in their content.
- recentFocus: 2-4 topics they're focused on recently.
- networkPosition: one sentence about their network role.
- influence: "high", "medium", or "low".
- signalValue: "high", "medium", or "low".
- Return ONLY valid JSON.`

export async function buildScopeSnapshot(
  deps: CorvusDeps,
  handle: string,
  tweetCount: number,
): Promise<BuildResult<ScopeSnapshot>> {
  if (deps.x) {
    return buildScopeFromXApi(deps, handle, tweetCount)
  }
  return buildScopeFromGrok(deps, handle)
}

async function buildScopeFromXApi(
  deps: CorvusDeps,
  handle: string,
  tweetCount: number,
): Promise<BuildResult<ScopeSnapshot>> {
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
    citations: [],
  }
}

async function buildScopeFromGrok(
  deps: CorvusDeps,
  handle: string,
): Promise<BuildResult<ScopeSnapshot>> {
  const response = await deps.grok.query(
    `Profile this X account: @${handle}`,
    {
      systemPrompt: GROK_ONLY_PROMPT,
      enableXSearch: true,
      xSearchHandles: [handle],
      maxTokens: 3072,
    },
  )

  const grok = parseGrokJson<GrokOnlyScopeResponse>(response.text)

  return {
    data: {
      account: grok.account ?? {
        handle,
        followers: 0,
        following: 0,
        tweetCount: 0,
      },
      recentActivity: grok.recentActivity ?? {
        avgEngagement: 0,
        postsAnalyzed: 0,
        topTweet: null,
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
    citations: [],
  }
}
