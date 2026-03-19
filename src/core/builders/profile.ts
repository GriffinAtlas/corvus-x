import { parseGrokJson } from '../grok-adapter.js'
import { GrokProfileResponseSchema } from '../validators.js'
import type { ProfileSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are a content strategy analyst. Analyze the posts provided and return ONLY a JSON object:
{
  "postFrequency": { "postsPerWeek": 5, "activeDays": ["Monday", "Wednesday"], "peakHours": [9, 14] },
  "contentMix": [{ "category": "TypeScript", "percentage": 40, "avgEngagement": 120 }],
  "topPerformers": [{ "url": "", "content": "post text", "engagement": 500, "why": "reason" }],
  "voiceTraits": { "tone": "casual technical", "vocabulary": "developer jargon", "emojiUsage": "minimal", "avgLength": 180 },
  "recommendations": ["actionable suggestion"],
  "sentiment": 0.3
}
Rules:
- postFrequency: from the posts provided. peakHours in UTC (0-23).
- contentMix: 3-7 categories with percentage and avg engagement.
- topPerformers: 3-5 highest-engagement posts with why they worked.
- voiceTraits: characterize their writing style.
- recommendations: 3-5 actionable suggestions. Only when analyzing the user's own account.
- sentiment: -1.0 to 1.0.
- Return ONLY valid JSON.`

const GROK_ONLY_PROMPT = `You are a content strategy analyst. Search X for this user's recent posts and profile, then analyze. Return ONLY a JSON object:
{
  "displayName": "User Name",
  "followers": 5000,
  "following": 200,
  "postFrequency": { "postsPerWeek": 5, "activeDays": ["Monday", "Wednesday"], "peakHours": [9, 14] },
  "contentMix": [{ "category": "TypeScript", "percentage": 40, "avgEngagement": 120 }],
  "topPerformers": [{ "url": "", "content": "post text", "engagement": 500, "why": "reason" }],
  "voiceTraits": { "tone": "casual technical", "vocabulary": "developer jargon", "emojiUsage": "minimal", "avgLength": 180 },
  "recommendations": ["actionable suggestion"],
  "sentiment": 0.3
}
Rules:
- displayName/followers/following: profile stats (best effort).
- postFrequency: from posts found. peakHours in UTC (0-23).
- contentMix: 3-7 categories.
- topPerformers: 3-5 highest-engagement posts.
- voiceTraits: characterize their writing style.
- recommendations: 3-5 suggestions. Only when analyzing the user's own account.
- sentiment: -1.0 to 1.0.
- Return ONLY valid JSON.`

export function resolveIsSelf(handle: string, selfHandle: string | null): boolean {
  return selfHandle !== null && handle.toLowerCase() === selfHandle.toLowerCase()
}

export async function buildProfileSnapshot(
  deps: CorvusDeps,
  handle: string,
  postCount: number,
  isSelf: boolean,
): Promise<BuildResult<ProfileSnapshot>> {
  if (deps.x) {
    return buildProfileFromXApi(deps, handle, postCount, isSelf)
  }
  return buildProfileFromGrok(deps, handle, isSelf)
}

async function buildProfileFromXApi(
  deps: CorvusDeps,
  handle: string,
  postCount: number,
  isSelf: boolean,
): Promise<BuildResult<ProfileSnapshot>> {
  const user = await deps.x!.getUser(handle)
  const tweets = await deps.x!.getUserTweets(user.id, postCount)

  const profileContext = [
    `Username: @${user.username}`,
    `Name: ${user.name}`,
    `Bio: ${user.description}`,
    `Followers: ${user.followersCount}`,
    `Following: ${user.followingCount}`,
    `Tweets: ${user.tweetCount}`,
    '',
    `Recent posts (${tweets.length}):`,
    ...tweets.map(
      (t, i) =>
        `${i + 1}. [${t.createdAt}] ${t.text} (${t.metrics.likes} likes, ${t.metrics.retweets} RTs, ${t.metrics.replies} replies)`,
    ),
  ].join('\n')

  const selfNote = isSelf
    ? '\n\nThis is the user\'s OWN account. Include recommendations.'
    : '\n\nNot the user\'s own account. Do NOT include recommendations.'

  const response = await deps.grok.query(
    `Analyze the content strategy of @${handle}:\n\n${profileContext}${selfNote}`,
    {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      responseSchema: GrokProfileResponseSchema,
    },
  )

  const grok = parseGrokJson<ProfileSnapshot>(response.text)

  return {
    data: {
      handle: user.username,
      displayName: user.name,
      followers: user.followersCount,
      following: user.followingCount,
      postFrequency: grok.postFrequency,
      contentMix: grok.contentMix,
      topPerformers: grok.topPerformers,
      voiceTraits: grok.voiceTraits,
      recommendations: isSelf ? grok.recommendations : undefined,
      sentiment: grok.sentiment,
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

async function buildProfileFromGrok(
  deps: CorvusDeps,
  handle: string,
  isSelf: boolean,
): Promise<BuildResult<ProfileSnapshot>> {
  const selfNote = isSelf ? ' This is the user\'s OWN account. Include recommendations.' : ''

  const response = await deps.grok.query(
    `Analyze the content strategy of this X account: @${handle}.${selfNote}`,
    {
      systemPrompt: GROK_ONLY_PROMPT,
      enableXSearch: true,
      xSearchHandles: [handle],
      maxTokens: 4096,
    },
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grok = parseGrokJson<any>(response.text)

  return {
    data: {
      handle,
      displayName: grok.displayName ?? handle,
      followers: grok.followers ?? 0,
      following: grok.following ?? 0,
      postFrequency: grok.postFrequency ?? { postsPerWeek: 0, activeDays: [], peakHours: [] },
      contentMix: grok.contentMix ?? [],
      topPerformers: grok.topPerformers ?? [],
      voiceTraits: grok.voiceTraits ?? { tone: '', vocabulary: '', emojiUsage: '', avgLength: 0 },
      recommendations: isSelf ? grok.recommendations : undefined,
      sentiment: grok.sentiment ?? 0,
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
