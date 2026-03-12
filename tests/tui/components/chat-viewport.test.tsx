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
})
