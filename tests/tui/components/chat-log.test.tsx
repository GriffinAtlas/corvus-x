import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { ChatLog } from '../../../src/tui/components/chat-log.js'
import type { ChatEntry } from '../../../src/tui/hooks/use-session.js'

describe('ChatLog', () => {
  it('renders empty when no entries', () => {
    const { lastFrame } = render(<ChatLog entries={[]} />)
    expect(lastFrame()).toBe('')
  })

  it('renders user message', () => {
    const entries: ChatEntry[] = [{ type: 'user', text: 'scan bitcoin' }]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    expect(lastFrame()!).toContain('scan bitcoin')
  })

  it('renders error entry', () => {
    const entries: ChatEntry[] = [{ type: 'error', message: 'Rate limited' }]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    expect(lastFrame()!).toContain('Rate limited')
  })

  it('renders prose entry', () => {
    const entries: ChatEntry[] = [{ type: 'prose', text: 'AI analysis here', cost: 0.001 }]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    expect(lastFrame()!).toContain('AI analysis here')
  })

  it('renders result entry', () => {
    const entries: ChatEntry[] = [
      { type: 'result', command: 'scan', topic: 'bitcoin', rendered: 'Scan output', cost: 0.003, elapsed: 1500 },
    ]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    expect(lastFrame()!).toContain('scan')
    expect(lastFrame()!).toContain('Scan output')
  })

  it('renders system entry', () => {
    const entries: ChatEntry[] = [{ type: 'system', message: 'Welcome to corvus' }]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    expect(lastFrame()!).toContain('Welcome to corvus')
  })

  it('renders multiple entries in order', () => {
    const entries: ChatEntry[] = [
      { type: 'user', text: 'scan bitcoin' },
      { type: 'result', command: 'scan', topic: 'bitcoin', rendered: 'Output', cost: 0.003, elapsed: 1000 },
    ]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    const frame = lastFrame()!
    expect(frame.indexOf('scan bitcoin')).toBeLessThan(frame.indexOf('Output'))
  })

  it('truncates result entry to 25 lines', () => {
    const longOutput = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n')
    const entries: ChatEntry[] = [
      { type: 'result', command: 'scan', topic: 'btc', rendered: longOutput, cost: 0.003, elapsed: 1200 },
    ]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    const frame = lastFrame()!
    expect(frame).toContain('line 1')
    expect(frame).toContain('line 25')
    expect(frame).not.toContain('line 26')
    expect(frame).toContain('15 more lines')
    expect(frame).toContain('/view 1')
  })

  it('does not truncate short result entry', () => {
    const shortOutput = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n')
    const entries: ChatEntry[] = [
      { type: 'result', command: 'scan', topic: 'btc', rendered: shortOutput, cost: 0.003, elapsed: 1200 },
    ]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    const frame = lastFrame()!
    expect(frame).toContain('line 10')
    expect(frame).not.toContain('more lines')
  })

  it('shows full content when expanded', () => {
    const longOutput = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n')
    const entries: ChatEntry[] = [
      { type: 'result', command: 'scan', topic: 'btc', rendered: longOutput,
        cost: 0.003, elapsed: 1200, expanded: true },
    ]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    const frame = lastFrame()!
    expect(frame).toContain('line 40')
    expect(frame).not.toContain('more lines')
  })

  it('truncates prose entry to 50 lines', () => {
    const longText = Array.from({ length: 70 }, (_, i) => `paragraph ${i + 1}`).join('\n')
    const entries: ChatEntry[] = [
      { type: 'prose', text: longText, cost: 0.002 },
    ]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    const frame = lastFrame()!
    expect(frame).toContain('paragraph 1')
    expect(frame).toContain('paragraph 50')
    expect(frame).not.toContain('paragraph 51')
    expect(frame).toContain('20 more lines')
    expect(frame).toContain('/view 1')
  })

  it('shows full prose content when expanded', () => {
    const longText = Array.from({ length: 70 }, (_, i) => `paragraph ${i + 1}`).join('\n')
    const entries: ChatEntry[] = [
      { type: 'prose', text: longText, cost: 0.002, expanded: true },
    ]
    const { lastFrame } = render(<ChatLog entries={entries} />)
    const frame = lastFrame()!
    expect(frame).toContain('paragraph 70')
    expect(frame).not.toContain('more lines')
  })

  it('truncation footer uses correct /view index when startIndex is non-zero', () => {
    const longOutput = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n')
    const entries: ChatEntry[] = [
      { type: 'result', command: 'scan', topic: 'btc', rendered: longOutput, cost: 0.003, elapsed: 1200 },
    ]
    const { lastFrame } = render(<ChatLog entries={entries} startIndex={4} />)
    const frame = lastFrame()!
    expect(frame).toContain('/view 5')
  })
})
