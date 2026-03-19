import fs from 'fs'
import path from 'path'
import type { VoiceProfile } from './schemas.js'
import type { GrokAdapter } from './grok-adapter.js'
import type { Tweet } from './x-adapter.js'
import { parseGrokJson } from './grok-adapter.js'
import { GrokVoiceProfileResponseSchema } from './validators.js'

const VOICE_PROFILE_FILE = 'voice-profile.json'
const STALENESS_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const VOICE_ANALYSIS_PROMPT = `You are a writing style analyst. Analyze the following posts from a single author and extract their writing voice profile. Return ONLY a JSON object:
{
  "traits": {
    "tone": "brief description of overall tone (e.g. 'casual and direct', 'professional with dry humor')",
    "vocabulary": "vocabulary level and style (e.g. 'technical, uses jargon freely', 'accessible, avoids buzzwords')",
    "sentenceStyle": "sentence structure patterns (e.g. 'short punchy sentences', 'long flowing paragraphs')",
    "emojiUsage": "how they use emoji (e.g. 'never', 'sparingly for emphasis', 'heavy use')",
    "hashtagUsage": "how they use hashtags (e.g. 'never', '1-2 per post', 'heavy use')",
    "humor": "humor style if any (e.g. 'none', 'sarcastic', 'self-deprecating', 'dry wit')",
    "catchphrases": ["recurring phrases or patterns"],
    "avgPostLength": 150,
    "threadStyle": "how they structure threads if applicable (e.g. 'numbered lists', 'narrative flow', 'rarely threads')"
  },
  "topicPreferences": [{ "topic": "topic name", "frequency": 0.3 }]
}
Rules:
- Analyze the actual writing patterns, not what you think they should be.
- catchphrases: real recurring phrases, not generic patterns. Empty array if none.
- topicPreferences.frequency: proportion of posts about this topic (0.0 to 1.0).
- avgPostLength: average character count of their posts.
- Return ONLY valid JSON.`

export class VoiceProfileManager {
  private profilePath: string

  constructor(private baseDir: string) {
    this.profilePath = path.join(baseDir, VOICE_PROFILE_FILE)
  }

  load(): VoiceProfile | null {
    let raw: string
    try {
      raw = fs.readFileSync(this.profilePath, 'utf-8')
    } catch {
      return null
    }
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  save(profile: VoiceProfile): void {
    fs.mkdirSync(this.baseDir, { recursive: true })
    fs.writeFileSync(this.profilePath, JSON.stringify(profile, null, 2), { mode: 0o600 })
  }

  isStale(profile: VoiceProfile): boolean {
    return Date.now() - new Date(profile.generatedAt).getTime() > STALENESS_MS
  }

  async generate(
    grok: GrokAdapter,
    handle: string,
    tweets: Tweet[],
  ): Promise<VoiceProfile> {
    const postBlock = tweets
      .map((t, i) => `${i + 1}. ${t.text}`)
      .join('\n')

    const response = await grok.query(
      `Analyze the writing style of @${handle} from these ${tweets.length} posts:\n\n${postBlock}`,
      {
        systemPrompt: VOICE_ANALYSIS_PROMPT,
        maxTokens: 3072,
        responseSchema: GrokVoiceProfileResponseSchema,
      },
    )

    const parsed = parseGrokJson<{
      traits: VoiceProfile['traits']
      topicPreferences: VoiceProfile['topicPreferences']
    }>(response.text, GrokVoiceProfileResponseSchema)

    const profile: VoiceProfile = {
      handle,
      generatedAt: new Date().toISOString(),
      postCount: tweets.length,
      traits: parsed.traits,
      topicPreferences: parsed.topicPreferences,
      examplePosts: tweets.slice(0, 5).map((t) => t.text),
    }

    this.save(profile)
    return profile
  }
}
