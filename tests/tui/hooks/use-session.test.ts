import { describe, it, expect } from 'vitest'
import { sessionReducer, initialSession } from '../../../src/tui/hooks/use-session.js'

describe('sessionReducer', () => {
  it('initialSession has correct defaults', () => {
    expect(initialSession.totalCost).toBe(0)
    expect(initialSession.queryCount).toBe(0)
    expect(initialSession.grokStatus).toBe('no-key')
    expect(initialSession.xApiStatus).toBe('no-key')
    expect(initialSession.history).toEqual([])
    expect(initialSession.startTime).toBeGreaterThan(0)
    expect(initialSession.refCounter).toBe(0)
    expect(initialSession.contextMap).toEqual({})
  })

  it('add-query appends to history without incrementing queryCount', () => {
    const state = sessionReducer(initialSession, {
      type: 'add-query',
      entry: { type: 'user', text: 'scan bitcoin' },
    })
    expect(state.history).toHaveLength(1)
    expect(state.history[0]).toEqual({ type: 'user', text: 'scan bitcoin' })
    expect(state.queryCount).toBe(0)
  })

  it('add-result with result entry increments queryCount and assigns refId', () => {
    const state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'result', refId: '', command: 'scan', topic: 'bitcoin', rendered: 'output', cost: 0.003, elapsed: 1200 },
    })
    expect(state.history).toHaveLength(1)
    expect(state.queryCount).toBe(1)
    expect(state.refCounter).toBe(1)
    const entry = state.history[0]
    if (entry.type === 'result') {
      expect(entry.refId).toBe('scan:1')
    }
  })

  it('add-result with prose entry assigns refId with ask prefix', () => {
    const state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'prose', refId: '', text: 'answer', cost: 0.001 },
    })
    expect(state.refCounter).toBe(1)
    const entry = state.history[0]
    if (entry.type === 'prose') {
      expect(entry.refId).toBe('ask:1')
    }
  })

  it('refCounter increments across multiple results', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'result', refId: '', command: 'scan', topic: 'btc', rendered: 'x', cost: 0, elapsed: 0 },
    })
    state = sessionReducer(state, {
      type: 'add-result',
      entry: { type: 'result', refId: '', command: 'hooks', topic: 'btc', rendered: 'y', cost: 0, elapsed: 0 },
    })
    state = sessionReducer(state, {
      type: 'add-result',
      entry: { type: 'prose', refId: '', text: 'z', cost: 0 },
    })
    expect(state.refCounter).toBe(3)
    if (state.history[0].type === 'result') expect(state.history[0].refId).toBe('scan:1')
    if (state.history[1].type === 'result') expect(state.history[1].refId).toBe('hooks:2')
    if (state.history[2].type === 'prose') expect(state.history[2].refId).toBe('ask:3')
  })

  it('add-result with system entry does not increment queryCount or refCounter', () => {
    const state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'system', message: 'help text' },
    })
    expect(state.history).toHaveLength(1)
    expect(state.queryCount).toBe(0)
    expect(state.refCounter).toBe(0)
  })

  it('add-cost increases totalCost', () => {
    const state = sessionReducer(initialSession, { type: 'add-cost', cost: 0.005 })
    expect(state.totalCost).toBe(0.005)

    const state2 = sessionReducer(state, { type: 'add-cost', cost: 0.003 })
    expect(state2.totalCost).toBeCloseTo(0.008, 6)
  })

  it('set-grok-status updates grokStatus', () => {
    const state = sessionReducer(initialSession, {
      type: 'set-grok-status',
      status: 'connected',
    })
    expect(state.grokStatus).toBe('connected')
  })

  it('set-x-status updates xApiStatus', () => {
    const state = sessionReducer(initialSession, {
      type: 'set-x-status',
      status: 'optional',
    })
    expect(state.xApiStatus).toBe('optional')
  })

  it('clear-history empties history, resets queryCount, refCounter, and contextMap', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-query',
      entry: { type: 'user', text: 'test' },
    })
    state = sessionReducer(state, {
      type: 'add-result',
      entry: { type: 'result', refId: '', command: 'scan', topic: 'btc', rendered: 'x', cost: 0, elapsed: 0 },
    })
    state = sessionReducer(state, {
      type: 'add-context',
      topic: 'btc',
      entry: { command: 'scan', topic: 'btc', snapshot: {} as any, timestamp: Date.now() },
    })
    state = sessionReducer(state, { type: 'clear-history' })
    expect(state.history).toEqual([])
    expect(state.queryCount).toBe(0)
    expect(state.totalCost).toBe(0)
    expect(state.refCounter).toBe(0)
    expect(state.contextMap).toEqual({})
  })

  it('add-error appends system notice', () => {
    const state = sessionReducer(initialSession, {
      type: 'add-error',
      message: 'Rate limited. Resets at 12:00.',
    })
    expect(state.history).toHaveLength(1)
    expect(state.history[0]).toEqual({ type: 'error', message: 'Rate limited. Resets at 12:00.' })
  })

  it('expand-entry sets expanded on result entry', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'result', refId: '', command: 'scan', topic: 'btc', rendered: 'output', cost: 0.003, elapsed: 1200 },
    })
    state = sessionReducer(state, { type: 'expand-entry', index: 0 })
    const entry = state.history[0]
    expect(entry.type).toBe('result')
    if (entry.type === 'result') expect(entry.expanded).toBe(true)
  })

  it('expand-entry sets expanded on prose entry', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'prose', refId: '', text: 'long text', cost: 0.002 },
    })
    state = sessionReducer(state, { type: 'expand-entry', index: 0 })
    const entry = state.history[0]
    expect(entry.type).toBe('prose')
    if (entry.type === 'prose') expect(entry.expanded).toBe(true)
  })

  it('expand-entry no-ops on user entry', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-query',
      entry: { type: 'user', text: 'scan btc' },
    })
    state = sessionReducer(state, { type: 'expand-entry', index: 0 })
    expect(state.history[0]).toEqual({ type: 'user', text: 'scan btc' })
  })

  it('expand-entry no-ops on out-of-bounds index', () => {
    const state = sessionReducer(initialSession, { type: 'expand-entry', index: 99 })
    expect(state.history).toEqual([])
  })

  it('expand-entry no-ops on already-expanded entry', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'result', refId: '', command: 'scan', topic: 'btc', rendered: 'x', cost: 0, elapsed: 0 },
    })
    state = sessionReducer(state, { type: 'expand-entry', index: 0 })
    const state2 = sessionReducer(state, { type: 'expand-entry', index: 0 })
    expect(state2.history[0]).toEqual(state.history[0])
  })

  it('expand-entry no-ops when index is negative', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'result', refId: '', command: 'scan', topic: 'btc', rendered: 'x', cost: 0, elapsed: 0 },
    })
    state = sessionReducer(state, { type: 'expand-entry', index: -1 })
    const entry = state.history[0]
    expect(entry.type).toBe('result')
    if (entry.type === 'result') expect(entry.expanded).toBeUndefined()
  })

  it('expand-entry no-ops on error entry', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-error',
      message: 'Something failed',
    })
    state = sessionReducer(state, { type: 'expand-entry', index: 0 })
    expect(state.history[0]).toEqual({ type: 'error', message: 'Something failed' })
  })

  it('expand-entry no-ops on system entry', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'system', message: 'Welcome' },
    })
    state = sessionReducer(state, { type: 'expand-entry', index: 0 })
    expect(state.history[0]).toEqual({ type: 'system', message: 'Welcome' })
  })

  it('expand-entry no-ops when index is NaN', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'result', refId: '', command: 'scan', topic: 'btc', rendered: 'x', cost: 0, elapsed: 0 },
    })
    state = sessionReducer(state, { type: 'expand-entry', index: NaN })
    const entry = state.history[0]
    expect(entry.type).toBe('result')
    if (entry.type === 'result') expect(entry.expanded).toBeUndefined()
  })

  it('clear-history preserves startTime', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-query',
      entry: { type: 'user', text: 'test' },
    })
    const { startTime } = state
    state = sessionReducer(state, { type: 'clear-history' })
    expect(state.startTime).toBe(startTime)
  })

  describe('add-context', () => {
    it('adds context entry keyed by normalized topic', () => {
      const state = sessionReducer(initialSession, {
        type: 'add-context',
        topic: 'AI Agents',
        entry: { command: 'scan', topic: 'AI Agents', snapshot: {} as any, timestamp: 1000 },
      })
      expect(state.contextMap['ai agents']).toHaveLength(1)
      expect(state.contextMap['ai agents'][0].command).toBe('scan')
    })

    it('accumulates multiple entries for same topic', () => {
      let state = sessionReducer(initialSession, {
        type: 'add-context',
        topic: 'bitcoin',
        entry: { command: 'scan', topic: 'bitcoin', snapshot: {} as any, timestamp: 1000 },
      })
      state = sessionReducer(state, {
        type: 'add-context',
        topic: 'Bitcoin',
        entry: { command: 'pulse', topic: 'Bitcoin', snapshot: {} as any, timestamp: 2000 },
      })
      expect(state.contextMap['bitcoin']).toHaveLength(2)
      expect(state.contextMap['bitcoin'][0].command).toBe('scan')
      expect(state.contextMap['bitcoin'][1].command).toBe('pulse')
    })

    it('keeps separate contexts for different topics', () => {
      let state = sessionReducer(initialSession, {
        type: 'add-context',
        topic: 'bitcoin',
        entry: { command: 'scan', topic: 'bitcoin', snapshot: {} as any, timestamp: 1000 },
      })
      state = sessionReducer(state, {
        type: 'add-context',
        topic: 'AI agents',
        entry: { command: 'scan', topic: 'AI agents', snapshot: {} as any, timestamp: 2000 },
      })
      expect(state.contextMap['bitcoin']).toHaveLength(1)
      expect(state.contextMap['ai agents']).toHaveLength(1)
    })
  })
})
