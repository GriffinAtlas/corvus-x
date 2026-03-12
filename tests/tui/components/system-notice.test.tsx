import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { SystemNotice } from '../../../src/tui/components/system-notice.js'

describe('SystemNotice', () => {
  it('renders error message', () => {
    const { lastFrame } = render(<SystemNotice type="error" message="Something broke" />)
    expect(lastFrame()).toContain('Something broke')
  })

  it('renders warning message', () => {
    const { lastFrame } = render(<SystemNotice type="warning" message="Rate limited" />)
    expect(lastFrame()).toContain('Rate limited')
  })

  it('renders info message', () => {
    const { lastFrame } = render(<SystemNotice type="info" message="Tip: try scan" />)
    expect(lastFrame()).toContain('Tip: try scan')
  })
})
