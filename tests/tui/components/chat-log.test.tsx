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
})
