import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { SetupNotice } from '../../../src/tui/components/setup-notice.js'

describe('SetupNotice', () => {
  it('shows auth setup command', () => {
    const { lastFrame } = render(<SetupNotice />)
    expect(lastFrame()!).toContain('corvus auth setup')
  })

  it('shows console.x.ai link', () => {
    const { lastFrame } = render(<SetupNotice />)
    expect(lastFrame()!).toContain('console.x.ai')
  })
})
