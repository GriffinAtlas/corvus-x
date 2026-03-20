import { parseGrokJson } from '../grok-adapter.js'
import { VoiceProfileManager } from '../voice.js'
import { ConfigManager } from '../../infra/config.js'
import type { DraftSnapshot } from '../schemas.js'
import type { BuildResult, CorvusDeps } from '../types.js'

const SYSTEM_PROMPT = `You are a ghostwriter drafting a social media post. Match the author's voice exactly. Return ONLY a JSON object:
{
  "post": "the drafted post text",
  "thread": ["post 1", "post 2"],
  "angles": ["talking point 1"],
  "hashtags": ["#relevant"]
}
Rules:
- post: a single ready-to-publish post (under 280 chars).
- thread: only if asked for a thread. Array of posts, each under 280 chars.
- angles: 2-3 alternative talking points the author could use.
- hashtags: 1-3 relevant hashtags. Empty array if not appropriate for the voice.
- Ground the post in current X discourse.
- Reference real conversations, people, events. Never fabricate.
- Return ONLY valid JSON.`

const NO_VOICE_PROMPT = `You are a ghostwriter drafting a social media post. Write in a sharp, concise, developer-friendly voice. Return ONLY a JSON object:
{
  "post": "the drafted post text",
  "thread": ["post 1", "post 2"],
  "angles": ["talking point 1"],
  "hashtags": ["#relevant"]
}
Rules:
- post: a single ready-to-publish post (under 280 chars).
- thread: only if asked for a thread.
- angles: 2-3 alternative talking points.
- hashtags: 1-3 relevant hashtags or empty array.
- Reference real current discourse.
- Return ONLY valid JSON.`

interface GrokDraftResponse {
  post: string
  thread?: string[]
  angles: string[]
  hashtags: string[]
}

export async function buildDraftSnapshot(
  deps: CorvusDeps,
  topic: string,
  options: { thread?: boolean; replyTo?: string; noContext?: boolean },
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
  if (options.thread) userPrompt += '\n\nFormat as a thread (multiple posts).'
  if (options.replyTo) userPrompt += `\n\nThis is a reply to: ${options.replyTo}`

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
