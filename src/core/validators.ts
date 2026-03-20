import { z } from 'zod/v4'

const GrokTweetScoreSchema = z.object({
  index: z.number(),
  sentiment: z.number(),
  narrative: z.string(),
})

const GrokNarrativeSchema = z.object({
  theme: z.string(),
  description: z.string(),
})

export const GrokScanResponseSchema = z.object({
  takeaway: z.string(),
  actions: z.array(z.string()),
  tweetAnalysis: z.array(GrokTweetScoreSchema),
  narratives: z.array(GrokNarrativeSchema),
  signals: z.array(z.string()),
})

export const GrokPulseResponseSchema = z.object({
  takeaway: z.string(),
  actions: z.array(z.string()),
  tweetAnalysis: z.array(GrokTweetScoreSchema),
  bullSignals: z.array(z.string()),
  bearSignals: z.array(z.string()),
})

export const GrokTraceResponseSchema = z.object({
  tweetAnalysis: z.array(GrokTweetScoreSchema),
  originIndex: z.number().nullable(),
  phases: z.array(
    z.object({
      name: z.string(),
      tweetIndices: z.array(z.number()),
      timeframe: z.string(),
    }),
  ),
  mutations: z.array(
    z.object({
      original: z.string(),
      variant: z.string(),
    }),
  ),
})

export const GrokProfileResponseSchema = z.object({
  postFrequency: z.object({
    postsPerWeek: z.number(),
    activeDays: z.array(z.string()),
    peakHours: z.array(z.number()),
  }),
  contentMix: z.array(
    z.object({
      category: z.string(),
      percentage: z.number(),
      avgEngagement: z.number(),
    }),
  ),
  topPerformers: z.array(
    z.object({
      url: z.string(),
      content: z.string(),
      engagement: z.number(),
      why: z.string(),
    }),
  ),
  voiceTraits: z.object({
    tone: z.string(),
    vocabulary: z.string(),
    emojiUsage: z.string(),
    avgLength: z.number(),
  }),
  algorithmScore: z.object({
    replyRate: z.number(),
    authorReplyRate: z.number(),
    conversationRatio: z.number(),
    bookmarkToLikeRatio: z.number(),
    grade: z.string(),
  }),
  recommendations: z.array(z.string()).nullable(),
  sentiment: z.number(),
})

export const GrokVoiceProfileResponseSchema = z.object({
  traits: z.object({
    tone: z.string(),
    vocabulary: z.string(),
    sentenceStyle: z.string(),
    emojiUsage: z.string(),
    hashtagUsage: z.string(),
    humor: z.string(),
    catchphrases: z.array(z.string()),
    avgPostLength: z.number(),
    threadStyle: z.string(),
  }),
  topicPreferences: z.array(
    z.object({
      topic: z.string(),
      frequency: z.number(),
    }),
  ),
})

const AgentStepSchema = z.object({
  command: z.enum(['scan', 'pulse', 'trace', 'profile', 'hooks', 'draft']),
  args: z.object({
    topic: z.string().optional(),
    username: z.string().optional(),
    count: z.number().optional(),
  }),
  reasoning: z.string(),
})

export const AgentPlanSchema = z.object({
  goal: z.string(),
  steps: z.array(AgentStepSchema),
})

export const ReplanDecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('continue') }),
  z.object({ action: z.literal('revise'), steps: z.array(AgentStepSchema) }),
])
