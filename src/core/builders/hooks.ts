import { parseGrokJson } from '../grok-adapter.js'
import { computeNewestTweetAt } from '../metrics.js'
import type { HooksSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are a growth strategist finding the best conversations for a creator to reply to RIGHT NOW. Return ONLY a JSON object:
{
  "opportunities": [{
    "tweetUrl": "https://x.com/user/status/123",
    "author": "username",
    "authorFollowers": 5000,
    "content": "tweet text",
    "engagement": { "likes": 50, "retweets": 10, "replies": 3 },
    "suggestedAngle": "what to say and why it will get noticed",
    "opportunityScore": 0.85
  }]
}
Rules:
- Find 5-10 conversations worth replying to. A great reply opportunity has:
  * High likes but LOW replies (= high visibility, low competition)
  * Posted in the last 1-4 hours (reply window still open)
  * Author has 1K-50K followers (reachable, not celebrity)
  * An unanswered question or gap you can fill with expertise
- opportunityScore: 0.0-1.0. Weight low-reply-to-like ratio highest.
- suggestedAngle: Be specific. Not "share your thoughts" but "mention your experience building X because the thread is missing a practitioner perspective."
- Sort by opportunityScore descending.
- Exclude spam, bots, memecoins, engagement-bait.
- Return ONLY valid JSON.`

const GROK_ONLY_PROMPT = `You are a growth strategist finding conversations for a creator to reply to RIGHT NOW. Search X for the given topic. Return ONLY a JSON object:
{
  "opportunities": [{
    "tweetUrl": "https://x.com/user/status/123",
    "author": "username",
    "authorFollowers": 5000,
    "content": "tweet text",
    "engagement": { "likes": 50, "retweets": 10, "replies": 3 },
    "suggestedAngle": "what to say and why it will get noticed",
    "opportunityScore": 0.85
  }]
}
Rules:
- Search X for recent conversations (last 1-4 hours preferred).
- Find 5-10 posts with high likes but LOW replies (= high visibility, low competition).
- Prioritize authors with 1K-50K followers (reachable, will notice your reply).
- Look for unanswered questions or gaps a practitioner could fill.
- suggestedAngle: specific and actionable. "Mention your experience with X because..."
- Sort by opportunityScore descending.
- Exclude spam, bots, memecoins, engagement-bait.
- Return ONLY valid JSON.`

export async function buildHooksSnapshot(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  priorContext?: string,
): Promise<BuildResult<HooksSnapshot>> {
  if (deps.x) {
    return buildHooksFromXApi(deps, topic, maxResults, priorContext)
  }
  return buildHooksFromGrok(deps, topic, priorContext)
}

async function buildHooksFromXApi(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  priorContext?: string,
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

  let prompt = `Find the best conversations to reply to about "${topic}" from these ${tweets.length} tweets:\n\n${tweetBlock}`
  if (priorContext) prompt += `\n\n${priorContext}`

  const response = await deps.grok.query(prompt, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 4096,
  })

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
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    toolCalls: response.usage.toolCalls,
    tweets,
    scores: [],
    newestTweetAt: computeNewestTweetAt(tweets),
    citations: response.citations,
  }
}

async function buildHooksFromGrok(
  deps: CorvusDeps,
  topic: string,
  priorContext?: string,
): Promise<BuildResult<HooksSnapshot>> {
  let prompt = `Find the best conversations to reply to about: "${topic}"`
  if (priorContext) prompt += `\n\n${priorContext}`

  const response = await deps.grok.query(prompt, {
    systemPrompt: GROK_ONLY_PROMPT,
    enableXSearch: true,
    maxTokens: 4096,
  })

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
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    toolCalls: response.usage.toolCalls,
    tweets: [],
    scores: [],
    newestTweetAt: null,
    citations: response.citations,
  }
}
