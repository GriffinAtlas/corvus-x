import { parseGrokJson } from '../grok-adapter.js'
import type { HooksSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are a social media engagement strategist. Given tweets about a topic, identify the best conversations to reply to right now. Return ONLY a JSON object:
{
  "opportunities": [{
    "tweetUrl": "https://x.com/user/status/123",
    "author": "username",
    "authorFollowers": 5000,
    "content": "tweet text",
    "engagement": { "likes": 50, "retweets": 10, "replies": 3 },
    "suggestedAngle": "how to approach a reply",
    "opportunityScore": 0.85
  }]
}
Rules:
- Find 5-10 conversations with high reply opportunity.
- Prioritize: rising engagement, shallow reply threads, larger authors, recent posts.
- opportunityScore: 0.0-1.0 composite of reply potential.
- suggestedAngle: one sentence on what to say, not the actual reply.
- Sort by opportunityScore descending.
- Exclude spam, bot accounts, memecoin promotions, and engagement-bait.
- Return ONLY valid JSON.`

const GROK_ONLY_PROMPT = `You are a social media engagement strategist. Search X for conversations about the given topic that have high reply opportunity. Return ONLY a JSON object:
{
  "opportunities": [{
    "tweetUrl": "https://x.com/user/status/123",
    "author": "username",
    "authorFollowers": 5000,
    "content": "tweet text",
    "engagement": { "likes": 50, "retweets": 10, "replies": 3 },
    "suggestedAngle": "how to approach a reply",
    "opportunityScore": 0.85
  }]
}
Rules:
- Search X for recent, active conversations about the topic.
- Find 5-10 conversations with high reply opportunity.
- Prioritize: rising engagement, shallow reply threads, larger authors, posts < 4 hours old.
- opportunityScore: 0.0-1.0 composite of reply potential.
- suggestedAngle: one sentence on what to say, not the actual reply.
- Sort by opportunityScore descending.
- Exclude spam, bots, memecoin promotions, and engagement-bait.
- Return ONLY valid JSON.`

export async function buildHooksSnapshot(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
): Promise<BuildResult<HooksSnapshot>> {
  if (deps.x) {
    return buildHooksFromXApi(deps, topic, maxResults)
  }
  return buildHooksFromGrok(deps, topic)
}

async function buildHooksFromXApi(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
): Promise<BuildResult<HooksSnapshot>> {
  const { tweets, users } = await deps.x!.searchRecent(topic, maxResults)
  if (tweets.length === 0) throw new Error(`No tweets found for "${topic}"`)

  const userMap = new Map(users.map((u) => [u.id, u]))

  const tweetBlock = tweets
    .map((t, i) => {
      const user = userMap.get(t.authorId)
      const handle = user?.username ?? t.authorId
      const followers = user?.followersCount ?? 0
      return `${i + 1}. @${handle} (${followers} followers) [${t.createdAt}]: ${t.text} (${t.metrics.likes} likes, ${t.metrics.retweets} RTs, ${t.metrics.replies} replies)`
    })
    .join('\n')

  const response = await deps.grok.query(
    `Find the best conversations to reply to about "${topic}" from these ${tweets.length} tweets:\n\n${tweetBlock}`,
    {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
    },
  )

  const grok = parseGrokJson<{ opportunities: HooksSnapshot['opportunities'] }>(response.text)

  return {
    data: {
      topic,
      opportunities: (grok.opportunities ?? [])
        .slice(0, 10)
        .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)),
      fetchedAt: new Date().toISOString(),
    },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets,
    scores: [],
    newestTweetAt: tweets.length > 0
      ? Math.max(...tweets.map((t) => new Date(t.createdAt).getTime()))
      : null,
    citations: response.citations,
  }
}

async function buildHooksFromGrok(
  deps: CorvusDeps,
  topic: string,
): Promise<BuildResult<HooksSnapshot>> {
  const response = await deps.grok.query(
    `Find the best conversations to reply to about: "${topic}"`,
    {
      systemPrompt: GROK_ONLY_PROMPT,
      enableXSearch: true,
      maxTokens: 4096,
    },
  )

  const grok = parseGrokJson<{ opportunities: HooksSnapshot['opportunities'] }>(response.text)

  return {
    data: {
      topic,
      opportunities: (grok.opportunities ?? [])
        .slice(0, 10)
        .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)),
      fetchedAt: new Date().toISOString(),
    },
    raw: response.text,
    cost: response.usage.costUsd,
    tweets: [],
    scores: [],
    newestTweetAt: null,
    citations: response.citations,
  }
}
