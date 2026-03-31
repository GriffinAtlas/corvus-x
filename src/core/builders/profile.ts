import { parseGrokJson } from '../grok-adapter.js'
import { GrokProfileResponseSchema } from '../validators.js'
import { VoiceProfileManager } from '../voice.js'
import { ConfigManager } from '../../infra/config.js'
import type { ProfileSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are a content strategy analyst who understands the X algorithm's scoring weights. Analyze the posts and return ONLY a JSON object:
{
  "postFrequency": { "postsPerWeek": 5, "activeDays": ["Monday", "Wednesday"], "peakHours": [9, 14] },
  "contentMix": [{ "category": "TypeScript", "percentage": 40, "avgEngagement": 120 }],
  "topPerformers": [{ "url": "", "content": "post text", "engagement": 500, "why": "reason" }],
  "voiceTraits": { "tone": "casual technical", "vocabulary": "developer jargon", "emojiUsage": "minimal", "avgLength": 180 },
  "algorithmScore": { "replyRate": 0.12, "authorReplyRate": 0.45, "conversationRatio": 0.08, "bookmarkToLikeRatio": 0.05, "grade": "B" },
  "recommendations": ["actionable suggestion"],
  "sentiment": 0.3
}
Rules:
- postFrequency: from the posts provided. peakHours in UTC (0-23).
- contentMix: 3-7 categories with percentage and avg engagement.
- topPerformers: 3-5 posts with highest ALGORITHMIC value (not just likes). Replies worth 13.5x likes. Conversations worth 150x likes.
- voiceTraits: characterize their writing style.
- algorithmScore: X algorithm analysis based on real weights.
  - replyRate: fraction of posts that received replies (0.0-1.0). The algorithm weights replies at 13.5x.
  - authorReplyRate: fraction of replies the author responded to (0.0-1.0). Author replies are weighted 75x.
  - conversationRatio: fraction of posts that became conversations (reply + author reply). Worth 150x a like.
  - bookmarkToLikeRatio: bookmarks/likes ratio. Bookmarks indicate save-worthy content (not directly an algorithm signal, but correlates with quality).
  - grade: overall algorithm health A/B/C/D/F. A = strong reply culture + author engagement. F = like-farming with no replies.
- recommendations: 3-5 actionable suggestions based on algorithm weights. Only when analyzing the user's own account.
- sentiment: -1.0 to 1.0.
- Return ONLY valid JSON.`

const GROK_ONLY_PROMPT = `You are a content strategy analyst who understands the X algorithm's scoring weights. Search X for this user's recent posts and profile, then analyze. Return ONLY a JSON object:
{
  "displayName": "User Name",
  "followers": 5000,
  "following": 200,
  "postFrequency": { "postsPerWeek": 5, "activeDays": ["Monday", "Wednesday"], "peakHours": [9, 14] },
  "contentMix": [{ "category": "TypeScript", "percentage": 40, "avgEngagement": 120 }],
  "topPerformers": [{ "url": "", "content": "post text", "engagement": 500, "why": "reason" }],
  "voiceTraits": { "tone": "casual technical", "vocabulary": "developer jargon", "emojiUsage": "minimal", "avgLength": 180 },
  "algorithmScore": { "replyRate": 0.12, "authorReplyRate": 0.45, "conversationRatio": 0.08, "bookmarkToLikeRatio": 0.05, "grade": "B" },
  "recommendations": ["actionable suggestion"],
  "sentiment": 0.3
}
Rules:
- displayName/followers/following: profile stats (best effort).
- postFrequency: from posts found. peakHours in UTC (0-23).
- contentMix: 3-7 categories.
- topPerformers: 3-5 posts with highest ALGORITHMIC value. Replies worth 13.5x likes.
- voiceTraits: characterize their writing style.
- algorithmScore: X algorithm analysis. replyRate (0-1), authorReplyRate (0-1, how often they reply back), conversationRatio (0-1, posts that became conversations), bookmarkToLikeRatio, grade (A-F based on algorithm health).
- recommendations: 3-5 suggestions based on algorithm weights. Only when analyzing the user's own account.
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

  const realReplyRate = tweets.length > 0
    ? tweets.filter((tw) => tw.metrics.replies > 0).length / tweets.length
    : 0
  const algoScore = {
    ...(grok.algorithmScore ?? { replyRate: 0, authorReplyRate: 0, conversationRatio: 0, bookmarkToLikeRatio: 0, grade: 'N/A' }),
    replyRate: Number(realReplyRate.toFixed(2)),
  }

  if (isSelf && tweets.length > 0) {
    const voiceManager = new VoiceProfileManager(ConfigManager.defaultDir())
    const existing = voiceManager.load()
    if (!existing || voiceManager.isStale(existing)) {
      voiceManager.generate(deps.grok, handle, tweets).catch((err) => {
        process.stderr.write(`corvus: voice profile generation failed: ${err instanceof Error ? err.message : String(err)}\n`)
      })
    }
  }

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
      algorithmScore: algoScore,
      recommendations: isSelf ? grok.recommendations ?? undefined : undefined,
      sentiment: grok.sentiment,
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

const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/

async function buildProfileFromGrok(
  deps: CorvusDeps,
  handle: string,
  isSelf: boolean,
): Promise<BuildResult<ProfileSnapshot>> {
  if (!X_HANDLE_RE.test(handle)) throw new Error(`Invalid X username: ${handle}`)
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
      algorithmScore: grok.algorithmScore ?? { replyRate: 0, authorReplyRate: 0, conversationRatio: 0, bookmarkToLikeRatio: 0, grade: 'N/A' },
      recommendations: isSelf ? grok.recommendations ?? undefined : undefined,
      sentiment: grok.sentiment ?? 0,
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
