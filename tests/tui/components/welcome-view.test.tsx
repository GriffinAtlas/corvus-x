import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { WelcomeView } from '../../../src/tui/components/welcome-view.js'

describe('WelcomeView', () => {
  it('renders header and panels when connected', () => {
    const { lastFrame } = render(
      <WelcomeView
        version="0.2.0"
        grokStatus="connected"
        xApiStatus="optional"
        totalCost={0}
        queryCount={0}
        recentTopics={[]}
      />,
    )
    const frame = lastFrame()!
    expect(frame.includes('██████') || frame.includes('╔═╗╔═╗')).toBe(true)
    expect(frame).toContain('●')
    expect(frame).toContain('Grok')
    expect(frame).toContain('Quick start')
    expect(frame).toContain('scan')
  })

  it('renders setup notice when no key', () => {
    const { lastFrame } = render(
      <WelcomeView
        version="0.2.0"
        grokStatus="no-key"
        xApiStatus="no-key"
        totalCost={0}
        queryCount={0}
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
        version="0.2.0"
        grokStatus="connected"
        xApiStatus="connected"
        totalCost={0}
        queryCount={0}
        recentTopics={topics}
      />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('Recent activity')
    expect(frame).toContain('AI regulation')
  })
})
