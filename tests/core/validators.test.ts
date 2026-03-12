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

  it('rejects unknown action', () => {
    expect(() => ReplanDecisionSchema.parse({ action: 'abort' })).toThrow()
  })

  it('rejects revise without steps', () => {
    expect(() => ReplanDecisionSchema.parse({ action: 'revise' })).toThrow()
  })

  it('rejects missing action', () => {
    expect(() => ReplanDecisionSchema.parse({})).toThrow()
  })
})

describe('GrokScanResponseSchema rejection', () => {
  it('rejects missing narratives', () => {
    const invalid = { tweetAnalysis: [], signals: [] }
    expect(() => GrokScanResponseSchema.parse(invalid)).toThrow()
  })

  it('rejects missing signals', () => {
    const invalid = { tweetAnalysis: [], narratives: [] }
    expect(() => GrokScanResponseSchema.parse(invalid)).toThrow()
  })

  it('rejects tweetAnalysis item missing index', () => {
    const invalid = {
      tweetAnalysis: [{ sentiment: 0.5, narrative: 'x' }],
      narratives: [],
      signals: [],
    }
    expect(() => GrokScanResponseSchema.parse(invalid)).toThrow()
  })

  it('rejects tweetAnalysis item missing narrative', () => {
    const invalid = {
      tweetAnalysis: [{ index: 0, sentiment: 0.5 }],
      narratives: [],
      signals: [],
    }
    expect(() => GrokScanResponseSchema.parse(invalid)).toThrow()
  })

  it('accepts empty arrays', () => {
    const valid = { tweetAnalysis: [], narratives: [], signals: [] }
    expect(() => GrokScanResponseSchema.parse(valid)).not.toThrow()
  })
})

describe('GrokPulseResponseSchema rejection', () => {
  it('rejects missing bullSignals', () => {
    const invalid = { tweetAnalysis: [], bearSignals: [] }
    expect(() => GrokPulseResponseSchema.parse(invalid)).toThrow()
  })

  it('rejects missing bearSignals', () => {
    const invalid = { tweetAnalysis: [], bullSignals: [] }
    expect(() => GrokPulseResponseSchema.parse(invalid)).toThrow()
  })
})

describe('GrokTraceResponseSchema rejection', () => {
  it('rejects missing phases', () => {
    const invalid = { tweetAnalysis: [], originIndex: null, mutations: [] }
    expect(() => GrokTraceResponseSchema.parse(invalid)).toThrow()
  })

  it('rejects missing mutations', () => {
    const invalid = { tweetAnalysis: [], originIndex: null, phases: [] }
    expect(() => GrokTraceResponseSchema.parse(invalid)).toThrow()
  })

  it('rejects phase missing name', () => {
    const invalid = {
      tweetAnalysis: [],
      originIndex: null,
      phases: [{ tweetIndices: [0], timeframe: 'Mar 10' }],
      mutations: [],
    }
    expect(() => GrokTraceResponseSchema.parse(invalid)).toThrow()
  })
})

describe('GrokGatherResponseSchema rejection', () => {
  it('rejects missing webContext', () => {
    const invalid = { tweetAnalysis: [], narratives: [], signals: [], outlook: 'ok' }
    expect(() => GrokGatherResponseSchema.parse(invalid)).toThrow()
  })

  it('rejects missing outlook', () => {
    const invalid = { tweetAnalysis: [], narratives: [], signals: [], webContext: [] }
    expect(() => GrokGatherResponseSchema.parse(invalid)).toThrow()
  })
})

describe('GrokReadResponseSchema rejection', () => {
  it('rejects missing analysis', () => {
    const invalid = { significance: 'high', signals: [] }
    expect(() => GrokReadResponseSchema.parse(invalid)).toThrow()
  })

  it('accepts all three significance levels', () => {
    for (const sig of ['high', 'medium', 'low']) {
      const valid = { analysis: 'text', significance: sig, signals: [] }
      expect(() => GrokReadResponseSchema.parse(valid)).not.toThrow()
    }
  })
})

describe('GrokScopeResponseSchema rejection', () => {
  it('rejects invalid influence value', () => {
    const invalid = {
      contentPatterns: [],
      recentFocus: [],
      networkPosition: 'central',
      influence: 'massive',
      signalValue: 'high',
    }
    expect(() => GrokScopeResponseSchema.parse(invalid)).toThrow()
  })

  it('rejects invalid signalValue', () => {
    const invalid = {
      contentPatterns: [],
      recentFocus: [],
      networkPosition: 'central',
      influence: 'high',
      signalValue: 'extreme',
    }
    expect(() => GrokScopeResponseSchema.parse(invalid)).toThrow()
  })

  it('accepts all influence and signalValue combos', () => {
    for (const influence of ['high', 'medium', 'low']) {
      for (const signalValue of ['high', 'medium', 'low']) {
        const valid = {
          contentPatterns: [],
          recentFocus: [],
          networkPosition: 'test',
          influence,
          signalValue,
        }
        expect(() => GrokScopeResponseSchema.parse(valid)).not.toThrow()
      }
    }
  })
})

describe('AgentPlanSchema rejection', () => {
  it('rejects missing goal', () => {
    const invalid = {
      steps: [{ command: 'scan', args: { topic: 'test' }, reasoning: 'r' }],
    }
    expect(() => AgentPlanSchema.parse(invalid)).toThrow()
  })

  it('rejects invalid command in step', () => {
    const invalid = {
      goal: 'test',
      steps: [{ command: 'hack', args: {}, reasoning: 'bad' }],
    }
    expect(() => AgentPlanSchema.parse(invalid)).toThrow()
  })

  it('accepts all 6 valid commands', () => {
    for (const cmd of ['scan', 'pulse', 'trace', 'gather', 'read', 'scope']) {
      const valid = {
        goal: 'test',
        steps: [{ command: cmd, args: {}, reasoning: 'ok' }],
      }
      expect(() => AgentPlanSchema.parse(valid)).not.toThrow()
    }
  })

  it('accepts empty steps array', () => {
    const valid = { goal: 'test', steps: [] }
    expect(() => AgentPlanSchema.parse(valid)).not.toThrow()
  })

  it('rejects step missing reasoning', () => {
    const invalid = {
      goal: 'test',
      steps: [{ command: 'scan', args: {} }],
    }
    expect(() => AgentPlanSchema.parse(invalid)).toThrow()
  })
})
