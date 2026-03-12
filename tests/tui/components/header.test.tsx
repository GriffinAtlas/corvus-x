import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Header } from '../../../src/tui/components/header.js'

describe('Header', () => {
  it('shows CORVUS logo and version in compact mode', () => {
    const { lastFrame } = render(<Header version="0.2.0" firstRun={false} />)
    const frame = lastFrame()!
    expect(frame).toContain('╔═╗╔═╗╦═╗╦')
    expect(frame).toContain('0.2.0')
  })

  it('shows crow art, logo, and help on first run', () => {
    const { lastFrame } = render(<Header version="0.2.0" firstRun={true} />)
    const frame = lastFrame()!
    expect(frame).toContain('⣠⣤⣄⣀⣀')
    expect(frame).toContain('╔═╗╔═╗╦═╗╦')
    expect(frame).toContain('X intelligence agent')
    expect(frame).toContain('Commands:')
    expect(frame).toContain('corvus auth setup')
  })
})
