import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { WelcomeHeader } from '../../../src/tui/components/welcome-header.js'

describe('WelcomeHeader', () => {
  it('renders crow art', () => {
    const { lastFrame } = render(<WelcomeHeader version="0.2.0" />)
    const frame = lastFrame()!
    // New crow art uses block characters
    expect(frame.includes('█') || frame.includes('▓') || frame.includes('▒')).toBe(true)
  })

  it('renders block-letter logo', () => {
    const { lastFrame } = render(<WelcomeHeader version="0.2.0" />)
    const frame = lastFrame()!
    // Large logo uses ██████╗ block chars, small uses ╔═╗
    expect(frame.includes('██████') || frame.includes('╔═╗╔═╗')).toBe(true)
  })

  it('renders tagline', () => {
    const { lastFrame } = render(<WelcomeHeader version="0.2.0" />)
    expect(lastFrame()!).toContain('investigate X')
  })

  it('renders version', () => {
    const { lastFrame } = render(<WelcomeHeader version="0.2.0" />)
    expect(lastFrame()!).toContain('v0.2.0')
  })
})
