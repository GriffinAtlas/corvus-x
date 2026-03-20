import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { WelcomeView } from '../../../src/tui/components/welcome-view.js'

describe('WelcomeView', () => {
  it('renders header and panels when connected', () => {
    const { lastFrame } = render(
      <WelcomeView
        version="0.3.0"
        grokStatus="connected"
        xApiStatus="optional"
        recentTopics={[]}
      />,
    )
    const frame = lastFrame()!
    // Compact header (terminal < 30 rows) shows ▸ corvus; big header shows crow art
    expect(frame.includes('corvus')).toBe(true)
    expect(frame).toContain('●')
    expect(frame).toContain('Grok')
    expect(frame).toContain('Try')
  })

  it('renders setup notice when no key', () => {
    const { lastFrame } = render(
      <WelcomeView
        version="0.3.0"
        grokStatus="no-key"
        xApiStatus="no-key"
        recentTopics={[]}
      />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('corvus auth setup')
    expect(frame).not.toContain('Quick start')
  })

  it('renders recent activity when topics exist', () => {
    const topics = [
      { command: 'scan', topic: 'AI regulation', latest: Date.now() - 3_600_000 },
    ]
    const { lastFrame } = render(
      <WelcomeView
        version="0.3.0"
        grokStatus="connected"
        xApiStatus="connected"
        recentTopics={topics}
      />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('Recent')
    expect(frame).toContain('AI regulation')
  })
})
