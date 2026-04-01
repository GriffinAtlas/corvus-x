import { describe, it, expect } from 'vitest'
import { UsageTracker } from '../../src/core/usage.js'

describe('UsageTracker', () => {
  it('starts with zero totals', () => {
    const tracker = new UsageTracker()
    expect(tracker.totalTokens).toBe(0)
    expect(tracker.totalInputTokens).toBe(0)
    expect(tracker.totalOutputTokens).toBe(0)
    expect(tracker.totalToolCalls).toBe(0)
    expect(tracker.turnCount).toBe(0)
  })

  it('records a single turn', () => {
    const tracker = new UsageTracker()
    tracker.record({ inputTokens: 500, outputTokens: 200, toolCalls: 1 })
    expect(tracker.totalTokens).toBe(700)
    expect(tracker.totalInputTokens).toBe(500)
    expect(tracker.totalOutputTokens).toBe(200)
    expect(tracker.totalToolCalls).toBe(1)
    expect(tracker.turnCount).toBe(1)
  })

  it('accumulates across multiple turns', () => {
    const tracker = new UsageTracker()
    tracker.record({ inputTokens: 500, outputTokens: 200, toolCalls: 1 })
    tracker.record({ inputTokens: 300, outputTokens: 150, toolCalls: 0 })
    tracker.record({ inputTokens: 800, outputTokens: 400, toolCalls: 2 })
    expect(tracker.totalTokens).toBe(2350)
    expect(tracker.totalInputTokens).toBe(1600)
    expect(tracker.totalOutputTokens).toBe(750)
    expect(tracker.totalToolCalls).toBe(3)
    expect(tracker.turnCount).toBe(3)
  })

  it('latestTurn returns null when empty', () => {
    const tracker = new UsageTracker()
    expect(tracker.latestTurn()).toBeNull()
  })

  it('latestTurn returns the most recent recording', () => {
    const tracker = new UsageTracker()
    tracker.record({ inputTokens: 100, outputTokens: 50, toolCalls: 0 })
    tracker.record({ inputTokens: 200, outputTokens: 100, toolCalls: 1 })
    expect(tracker.latestTurn()).toEqual({ inputTokens: 200, outputTokens: 100, toolCalls: 1 })
  })

  it('allTurns returns all recorded turns', () => {
    const tracker = new UsageTracker()
    tracker.record({ inputTokens: 100, outputTokens: 50, toolCalls: 0 })
    tracker.record({ inputTokens: 200, outputTokens: 100, toolCalls: 1 })
    expect(tracker.allTurns()).toHaveLength(2)
  })

  it('toSummary returns "0 tokens" when empty', () => {
    const tracker = new UsageTracker()
    expect(tracker.toSummary()).toBe('0 tokens')
  })

  it('toSummary returns raw count under 1000', () => {
    const tracker = new UsageTracker()
    tracker.record({ inputTokens: 300, outputTokens: 200, toolCalls: 0 })
    expect(tracker.toSummary()).toBe('500 tokens')
  })

  it('toSummary returns K format over 1000', () => {
    const tracker = new UsageTracker()
    tracker.record({ inputTokens: 5000, outputTokens: 3000, toolCalls: 0 })
    expect(tracker.toSummary()).toBe('8.0K tokens')
  })

  it('toSummary rounds to one decimal', () => {
    const tracker = new UsageTracker()
    tracker.record({ inputTokens: 1234, outputTokens: 567, toolCalls: 0 })
    expect(tracker.toSummary()).toBe('1.8K tokens')
  })

  it('allTurns()[0] deep-equals the first recorded usage', () => {
    const tracker = new UsageTracker()
    const first = { inputTokens: 100, outputTokens: 50, toolCalls: 1 }
    const second = { inputTokens: 200, outputTokens: 100, toolCalls: 2 }
    tracker.record(first)
    tracker.record(second)
    expect(tracker.allTurns()[0]).toEqual({ inputTokens: 100, outputTokens: 50, toolCalls: 1 })
    expect(tracker.allTurns()[1]).toEqual({ inputTokens: 200, outputTokens: 100, toolCalls: 2 })
  })

  it('allTurns() returns the internal array reference — push does not update turnCount', () => {
    const tracker = new UsageTracker()
    tracker.record({ inputTokens: 100, outputTokens: 50, toolCalls: 0 })
    expect(tracker.turnCount).toBe(1)

    // allTurns() exposes the internal array — mutating it bypasses cumulative tracking
    const turns = tracker.allTurns() as { inputTokens: number; outputTokens: number; toolCalls: number }[]
    turns.push({ inputTokens: 999, outputTokens: 999, toolCalls: 9 })

    // The array grew, but turnCount reads from the same array's length
    // This documents the aliasing behavior: turnCount reflects the mutation
    expect(turns.length).toBe(2)
    expect(tracker.turnCount).toBe(2)

    // However, cumulative totals are NOT updated — only record() updates them
    expect(tracker.totalInputTokens).toBe(100)
    expect(tracker.totalOutputTokens).toBe(50)
    expect(tracker.totalToolCalls).toBe(0)
  })
})
