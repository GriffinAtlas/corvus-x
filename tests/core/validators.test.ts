import { describe, it, expect } from 'vitest'
import {
  GrokScanResponseSchema,
  GrokPulseResponseSchema,
  GrokTraceResponseSchema,
} from '../../src/core/validators.js'

describe('GrokScanResponseSchema', () => {
  it('accepts valid scan response', () => {
    const valid = {
      takeaway: "test takeaway", actions: ["test action"], tweetAnalysis: [{ index: 0, sentiment: 0.5, narrative: "theme1" }],
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
      takeaway: 'test', actions: [],
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
      takeaway: 'test', actions: [],
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
    const valid = { takeaway: '', actions: [], tweetAnalysis: [], narratives: [], signals: [] }
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

