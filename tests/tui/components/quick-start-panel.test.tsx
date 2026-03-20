import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { QuickStartPanel } from '../../../src/tui/components/quick-start-panel.js'

describe('QuickStartPanel', () => {
  it('always shows tips', () => {
    const { lastFrame } = render(<QuickStartPanel recentTopics={[]} />)
    const frame = lastFrame()!
    expect(frame).toContain('Try')
    expect(frame).toContain('grow')
    expect(frame).toContain('scan')
    expect(frame).toContain('agent')
    expect(frame).toContain('profile')
  })

  it('shows tips AND recent activity together', () => {
    const topics = [
      { command: 'scan', topic: 'AI regulation', latest: Date.now() - 3_600_000 },
    ]
    const { lastFrame } = render(<QuickStartPanel recentTopics={topics} />)
    const frame = lastFrame()!
    expect(frame).toContain('Try')
    expect(frame).toContain('grow')
    expect(frame).toContain('Recent')
    expect(frame).toContain('AI regulation')
  })

  it('shows encouraging message at bottom', () => {
    const { lastFrame } = render(<QuickStartPanel recentTopics={[]} />)
    expect(lastFrame()!).toContain('Just type a question')
  })

  it('limits recent to 3 items', () => {
    const topics = Array.from({ length: 5 }, (_, i) => ({
      command: 'scan',
      topic: `Topic ${i}`,
      latest: Date.now() - i * 3_600_000,
    }))
    const { lastFrame } = render(<QuickStartPanel recentTopics={topics} />)
    const frame = lastFrame()!
    expect(frame).toContain('Topic 0')
    expect(frame).toContain('Topic 2')
    expect(frame).not.toContain('Topic 3')
  })

  it('does not contain hardcoded usernames', () => {
    const { lastFrame } = render(<QuickStartPanel recentTopics={[]} />)
    expect(lastFrame()!).not.toContain('RogGriff')
  })
})
