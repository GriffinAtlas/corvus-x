import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { ChatViewport } from '../../../src/tui/components/chat-viewport.js'
import type { ChatEntry } from '../../../src/tui/hooks/use-session.js'

function makeEntries(n: number): ChatEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    type: 'user' as const,
    text: `message ${i + 1}`,
  }))
}

describe('ChatViewport', () => {
  it('renders all entries when they fit in viewport', () => {
    const entries = makeEntries(3)
    const { lastFrame } = render(
      <ChatViewport entries={entries} scrollOffset={0} viewportHeight={20} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('message 1')
    expect(frame).toContain('message 3')
    expect(frame).not.toContain('more above')
    expect(frame).not.toContain('more below')
  })

  it('shows above indicator when scrolled up', () => {
    const entries = makeEntries(30)
    const { lastFrame } = render(
      <ChatViewport entries={entries} scrollOffset={5} viewportHeight={10} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('more above')
  })

  it('shows below indicator when scrolled up from bottom', () => {
    const entries = makeEntries(30)
    const { lastFrame } = render(
      <ChatViewport entries={entries} scrollOffset={5} viewportHeight={10} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('more below')
  })

  it('renders empty when no entries', () => {
    const { lastFrame } = render(
      <ChatViewport entries={[]} scrollOffset={0} viewportHeight={20} />,
    )
    expect(lastFrame()).toBe('')
  })

  it('clamps scroll offset to valid range', () => {
    const entries = makeEntries(3)
    const { lastFrame } = render(
      <ChatViewport entries={entries} scrollOffset={100} viewportHeight={20} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('message 1')
  })

  it('clamps negative scroll offset to 0', () => {
    const entries = makeEntries(5)
    const { lastFrame } = render(
      <ChatViewport entries={entries} scrollOffset={-5} viewportHeight={20} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('message 5')
    expect(frame).not.toContain('more below')
  })

  it('renders single entry with no scroll indicators', () => {
    const entries = makeEntries(1)
    const { lastFrame } = render(
      <ChatViewport entries={entries} scrollOffset={0} viewportHeight={20} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('message 1')
    expect(frame).not.toContain('more above')
    expect(frame).not.toContain('more below')
  })

  it('correctly estimates height for result entries', () => {
    // A result with 5 lines of content: estimated height = 5 + 3 = 8
    // With viewportHeight=9, one result should fit but two should not
    const resultEntry: ChatEntry = {
      type: 'result',
      refId: 'scan:1',
      command: 'scan',
      topic: 'btc',
      rendered: 'line1\nline2\nline3\nline4\nline5',
      cost: 0.003,
      elapsed: 1200,
    }
    const entries: ChatEntry[] = [
      { type: 'user', text: 'query 1' },
      resultEntry,
      { type: 'user', text: 'query 2' },
    ]
    // viewportHeight=9 should fit the result (8) + one user (1) = 9 exactly
    const { lastFrame } = render(
      <ChatViewport entries={entries} scrollOffset={0} viewportHeight={9} />,
    )
    const frame = lastFrame()!
    // Should show the last two entries (result + query 2) fitting in 9 lines
    expect(frame).toContain('query 2')
    expect(frame).toContain('line1')
  })

  it('correctly estimates height for prose entries', () => {
    const proseEntry: ChatEntry = {
      type: 'prose',
      refId: 'ask:1',
      text: 'para1\npara2\npara3',
      cost: 0.002,
    }
    const entries: ChatEntry[] = [proseEntry]
    // prose height = 3 lines + 3 = 6, should fit in viewport of 10
    const { lastFrame } = render(
      <ChatViewport entries={entries} scrollOffset={0} viewportHeight={10} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('para1')
    expect(frame).not.toContain('more above')
  })
})
