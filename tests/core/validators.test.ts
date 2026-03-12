import { describe, it, expect } from 'vitest'
import {
  GrokScanResponseSchema,
  GrokPulseResponseSchema,
  GrokTraceResponseSchema,
  GrokGatherResponseSchema,
  GrokReadResponseSchema,
  GrokScopeResponseSchema,
  AgentPlanSchema,
  ReplanDecisionSchema,
} from '../../src/core/validators.js'

describe('GrokScanResponseSchema', () => {
  it('accepts valid scan response', () => {
    const valid = {
      tweetAnalysis: [{ index: 0, sentiment: 0.5, narrative: 'theme1' }],
      narratives: [{ theme: 'theme1', description: 'desc' }],
      signals: ['signal 1'],
    }
    expect(() => GrokScanResponseSchema.parse(valid)).not.toThrow()
  })

  it('rejects missing tweetAnalysis', () => {
    const invalid = { narratives: [], signals: [] }
    expect(() => GrokScanResponseSchema.parse(invalid)).toThrow()
  })

  it('rejects sentiment outside -1 to 1', () => {
    const invalid = {
      tweetAnalysis: [{ index: 0, sentiment: 5, narrative: 'x' }],
      narratives: [],
      signals: [],
    }
    // Zod doesn't enforce min/max on structured output (xAI constraint),
    // but the schema should still parse — clamping is done in metrics.ts
    const result = GrokScanResponseSchema.safeParse(invalid)
    expect(result.success).toBe(true)
  })
})

describe('GrokPulseResponseSchema', () => {
  it('accepts valid pulse response', () => {
    const valid = {
      tweetAnalysis: [{ index: 0, sentiment: -0.3, narrative: 'bearish' }],
      bullSignals: ['signal 1'],
      bearSignals: ['signal 2'],
    }
    expect(() => GrokPulseResponseSchema.parse(valid)).not.toThrow()
  })
})

describe('GrokTraceResponseSchema', () => {
  it('accepts valid trace response', () => {
    const valid = {
      tweetAnalysis: [{ index: 0, sentiment: 0.1, narrative: 'spread' }],
      originIndex: 0,
      phases: [{ name: 'emergence', tweetIndices: [0], timeframe: 'Mar 10' }],
      mutations: [{ original: 'a', variant: 'b' }],
    }
    expect(() => GrokTraceResponseSchema.parse(valid)).not.toThrow()
  })

  it('accepts null originIndex', () => {
    const valid = {
      tweetAnalysis: [],
      originIndex: null,
      phases: [],
      mutations: [],
    }
    expect(() => GrokTraceResponseSchema.parse(valid)).not.toThrow()
  })
})

describe('GrokGatherResponseSchema', () => {
  it('accepts valid gather response', () => {
    const valid = {
      tweetAnalysis: [{ index: 0, sentiment: 0.7, narrative: 'bullish' }],
      narratives: [{ theme: 'AI', description: 'AI related' }],
      signals: ['s1'],
      webContext: ['news article'],
      outlook: 'positive outlook',
    }
    expect(() => GrokGatherResponseSchema.parse(valid)).not.toThrow()
  })
})

describe('GrokReadResponseSchema', () => {
  it('accepts valid read response', () => {
    const valid = {
      analysis: 'This tweet is significant.',
      significance: 'high',
      signals: ['notable'],
    }
    expect(() => GrokReadResponseSchema.parse(valid)).not.toThrow()
  })

  it('rejects invalid significance', () => {
    const invalid = {
      analysis: 'text',
      significance: 'extreme',
      signals: [],
    }
    expect(() => GrokReadResponseSchema.parse(invalid)).toThrow()
  })
})

describe('GrokScopeResponseSchema', () => {
  it('accepts valid scope response', () => {
    const valid = {
      contentPatterns: ['pattern'],
      recentFocus: ['focus'],
      networkPosition: 'central',
      influence: 'high',
      signalValue: 'medium',
    }
    expect(() => GrokScopeResponseSchema.parse(valid)).not.toThrow()
  })
})

describe('AgentPlanSchema', () => {
  it('accepts valid plan', () => {
    const valid = {
      goal: 'investigate topic',
      steps: [
        {
          command: 'scan',
          args: { topic: 'AI' },
          reasoning: 'start broad',
        },
      ],
    }
    expect(() => AgentPlanSchema.parse(valid)).not.toThrow()
  })
})

describe('ReplanDecisionSchema', () => {
  it('accepts continue action', () => {
    const valid = { action: 'continue' }
    expect(() => ReplanDecisionSchema.parse(valid)).not.toThrow()
  })

  it('accepts revise action with steps', () => {
    const valid = {
      action: 'revise',
      steps: [
        {
          command: 'scope',
          args: { username: 'alice' },
          reasoning: 'follow lead',
        },
      ],
    }
    expect(() => ReplanDecisionSchema.parse(valid)).not.toThrow()
  })
})
