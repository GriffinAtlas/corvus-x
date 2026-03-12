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
  })

  it('add-query appends to history and increments queryCount', () => {
    const state = sessionReducer(initialSession, {
      type: 'add-query',
      entry: { type: 'user', text: 'scan bitcoin' },
    })
    expect(state.history).toHaveLength(1)
    expect(state.history[0]).toEqual({ type: 'user', text: 'scan bitcoin' })
    expect(state.queryCount).toBe(1)
  })

  it('add-result appends result entry without incrementing queryCount', () => {
    const state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'result', command: 'scan', topic: 'bitcoin', rendered: 'output', cost: 0.003, elapsed: 1200 },
    })
    expect(state.history).toHaveLength(1)
    expect(state.queryCount).toBe(0)
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

  it('clear-history empties history and resets queryCount', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-query',
      entry: { type: 'user', text: 'test' },
    })
    state = sessionReducer(state, { type: 'clear-history' })
    expect(state.history).toEqual([])
    expect(state.queryCount).toBe(0)
    expect(state.totalCost).toBe(0)
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
      entry: { type: 'result', command: 'scan', topic: 'btc', rendered: 'output', cost: 0.003, elapsed: 1200 },
    })
    state = sessionReducer(state, { type: 'expand-entry', index: 0 })
    const entry = state.history[0]
    expect(entry.type).toBe('result')
    if (entry.type === 'result') expect(entry.expanded).toBe(true)
  })

  it('expand-entry sets expanded on prose entry', () => {
    let state = sessionReducer(initialSession, {
      type: 'add-result',
      entry: { type: 'prose', text: 'long text', cost: 0.002 },
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
      entry: { type: 'result', command: 'scan', topic: 'btc', rendered: 'x', cost: 0, elapsed: 0 },
    })
    state = sessionReducer(state, { type: 'expand-entry', index: 0 })
    const state2 = sessionReducer(state, { type: 'expand-entry', index: 0 })
    expect(state2.history[0]).toEqual(state.history[0])
  })
})
