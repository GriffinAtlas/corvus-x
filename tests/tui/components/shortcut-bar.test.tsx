import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { ShortcutBar } from '../../../src/tui/components/shortcut-bar.js'

describe('ShortcutBar', () => {
  it('shows keyboard shortcuts', () => {
    const { lastFrame } = render(<ShortcutBar />)
    const frame = lastFrame()!
    expect(frame).toContain('Tab')
    expect(frame).toContain('Ctrl+C')
    expect(frame).toContain('Esc')
    expect(frame).toContain('↑↓')
  })
})
