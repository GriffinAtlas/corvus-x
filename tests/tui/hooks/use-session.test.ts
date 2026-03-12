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

  it('add-entry appends to history and increments queryCount', () => {
    const state = sessionReducer(initialSession, {
      type: 'add-entry',
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
      type: 'add-entry',
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
})
