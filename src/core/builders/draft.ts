import { parseGrokJson } from '../grok-adapter.js'
import { VoiceProfileManager } from '../voice.js'
import { ConfigManager } from '../../infra/config.js'
import type { DraftSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are a growth-focused ghostwriter who understands the X algorithm. Draft a post that will get engagement. Match the author's voice. Return ONLY a JSON object:
{
  "post": "ready-to-publish post",
  "thread": ["post 1", "post 2"],
  "angles": ["alternative take 1"],
  "hashtags": [],
  "why": "why this post should work based on the algorithm"
}
Rules:
- post: under 280 chars. Must have a HOOK in the first line.
- Strong hooks: bold claim, surprising number, contrarian take, direct question, personal story.
- Weak hooks: "I think...", "Just wanted to share...", "Thread on..."
- Optimize for what the X algorithm actually ranks:
  * Replies (27x a like) — write something people want to respond to. Ask a question. Make a claim.
  * Dwell time — make people stop and READ. Longer posts that hold attention rank higher.
  * Shares via DM — write something people want to send to a friend privately.
  * Photo expand — if including an image, make it one people click to see full size.
  * Profile clicks — write something that makes people curious about you.
- DO NOT use hashtags. The X algorithm does not use them for ranking. They look spammy.
- Search X for what's being discussed NOW. Reference real conversations and people.
- thread: only if asked. Each post under 280 chars. First post is the hook.
- angles: 2-3 alternative versions with different hooks.
- why: explain why this should work based on algorithm signals (replies, dwell, shares).
- Return ONLY valid JSON.`

const NO_VOICE_PROMPT = `You are a growth-focused ghostwriter who understands the X algorithm. Write in a sharp, developer-friendly voice. Return ONLY a JSON object:
{
  "post": "ready-to-publish post",
  "thread": ["post 1", "post 2"],
  "angles": ["alternative take 1"],
  "hashtags": [],
  "why": "why this should work based on algorithm signals"
}
Rules:
- post: under 280 chars. First line must be a HOOK.
- Optimize for replies (27x likes), dwell time, DM shares, and profile clicks.
- DO NOT use hashtags — they don't affect ranking and look spammy.
- Search X for what's trending. Reference real conversations.
- thread: only if asked.
- angles: 2-3 alternatives with different hooks.
- why: why this should get engagement.
- Return ONLY valid JSON.`

interface GrokDraftResponse {
  post: string
  thread?: string[]
  angles: string[]
  hashtags: string[]
  why: string
}

export async function buildDraftSnapshot(
  deps: CorvusDeps,
  topic: string,
  options: { thread?: boolean; replyTo?: string; noContext?: boolean; hooksContext?: string; priorContext?: string },
): Promise<BuildResult<DraftSnapshot>> {
  const voiceManager = new VoiceProfileManager(ConfigManager.defaultDir())
  const voiceProfile = voiceManager.load()

  let voiceContext = ''
  const hasVoice = voiceProfile?.traits?.tone
  if (hasVoice) {
    const traits = voiceProfile!.traits
    voiceContext = `\n\nAuthor voice profile:\n- Tone: ${traits.tone}\n- Vocabulary: ${traits.vocabulary}\n- Sentence style: ${traits.sentenceStyle}\n- Emoji: ${traits.emojiUsage}\n- Humor: ${traits.humor}\n- Avg post length: ${traits.avgPostLength} chars`
    if (voiceProfile!.examplePosts?.length > 0) {
      voiceContext += `\n\nExample posts by this author:\n${voiceProfile!.examplePosts.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
    }
  }

  const systemPrompt = hasVoice ? SYSTEM_PROMPT : NO_VOICE_PROMPT

  let userPrompt = `Draft a post about: ${topic}${voiceContext}`
  if (options.hooksContext) userPrompt += `\n\nHere are conversations happening right now on this topic that you should reference or respond to:\n${options.hooksContext}`
  if (options.priorContext) userPrompt += `\n\n${options.priorContext}`
  if (options.thread) userPrompt += '\n\nFormat as a thread (multiple posts).'
  if (options.replyTo) {
    const replyUrl = options.replyTo.slice(0, 200)
    if (!/^https:\/\/(x\.com|twitter\.com)\//.test(replyUrl)) {
      throw new Error('--reply-to must be an X/Twitter URL (https://x.com/... or https://twitter.com/...)')
    }
    userPrompt += `\n\nThis is a reply to: ${replyUrl}`
  }

  const response = await deps.grok.query(userPrompt, {
    systemPrompt,
    enableXSearch: !options.noContext,
    maxTokens: 3072,
  })

  const grok = parseGrokJson<GrokDraftResponse>(response.text)

  return {
    data: {
      topic,
      post: grok.post ?? '',
      thread: options.thread ? grok.thread : undefined,
      angles: grok.angles ?? [],
      hashtags: grok.hashtags ?? [],
      why: grok.why ?? '',
      contextUsed: !options.noContext,
      replyTo: options.replyTo,
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
