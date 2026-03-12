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
  tweetAnalysis: z.array(GrokTweetScoreSchema),
  narratives: z.array(GrokNarrativeSchema),
  signals: z.array(z.string()),
})

export const GrokPulseResponseSchema = z.object({
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

export const GrokGatherResponseSchema = z.object({
  tweetAnalysis: z.array(GrokTweetScoreSchema),
  narratives: z.array(GrokNarrativeSchema),
  signals: z.array(z.string()),
  webContext: z.array(z.string()),
  outlook: z.string(),
})

export const GrokReadResponseSchema = z.object({
  analysis: z.string(),
  significance: z.enum(['high', 'medium', 'low']),
  signals: z.array(z.string()),
})

export const GrokScopeResponseSchema = z.object({
  contentPatterns: z.array(z.string()),
  recentFocus: z.array(z.string()),
  networkPosition: z.string(),
  influence: z.enum(['high', 'medium', 'low']),
  signalValue: z.enum(['high', 'medium', 'low']),
})

const AgentStepSchema = z.object({
  command: z.enum(['scan', 'pulse', 'trace', 'gather', 'read', 'scope']),
  args: z.object({
    topic: z.string().optional(),
    username: z.string().optional(),
    tweetId: z.string().optional(),
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
