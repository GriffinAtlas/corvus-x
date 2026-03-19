import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { QuickStartPanel } from '../../../src/tui/components/quick-start-panel.js'

describe('QuickStartPanel', () => {
  it('shows tips when no recent topics', () => {
    const { lastFrame } = render(<QuickStartPanel recentTopics={[]} />)
    const frame = lastFrame()!
    expect(frame).toContain('Quick start')
    expect(frame).toContain('scan')
    expect(frame).toContain('pulse')
    expect(frame).toContain('hooks')
    expect(frame).toContain('draft')
    expect(frame).toContain('profile')
    expect(frame).toContain('review')
    expect(frame).not.toContain('RogGriff')
  })

  it('shows slash commands at bottom', () => {
    const { lastFrame } = render(<QuickStartPanel recentTopics={[]} />)
    const frame = lastFrame()!
    expect(frame).toContain('/help')
    expect(frame).toContain('/cost')
    expect(frame).toContain('/clear')
    expect(frame).toContain('/exit')
  })

  it('shows recent activity when topics exist', () => {
    const topics = [
      { command: 'scan', topic: 'AI regulation', latest: Date.now() - 3_600_000 },
      { command: 'pulse', topic: 'Tesla', latest: Date.now() - 7_200_000 },
    ]
    const { lastFrame } = render(<QuickStartPanel recentTopics={topics} />)
    const frame = lastFrame()!
    expect(frame).toContain('Recent activity')
    expect(frame).toContain('scan')
    expect(frame).toContain('AI regulation')
    expect(frame).toContain('1h ago')
  })

  it('truncates long topic names', () => {
    const topics = [
      { command: 'scan', topic: 'A very long topic name that exceeds thirty five characters easily', latest: Date.now() },
    ]
    const { lastFrame } = render(<QuickStartPanel recentTopics={topics} />)
    const frame = lastFrame()!
    expect(frame).toContain('...')
    expect(frame).not.toContain('easily')
  })
})
