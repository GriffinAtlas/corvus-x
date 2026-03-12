import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Header } from '../../../src/tui/components/header.js'

describe('Header', () => {
  it('always shows crow art and CORVUS logo', () => {
    const { lastFrame } = render(<Header version="0.2.0" firstRun={false} />)
    const frame = lastFrame()!
    expect(frame).toContain('⣠⣤⣄⣀⣀')
    expect(frame).toContain('╔═╗╔═╗╦═╗╦')
    expect(frame).toContain('0.2.0')
  })

  it('shows version and tagline', () => {
    const { lastFrame } = render(<Header version="0.2.0" firstRun={false} />)
    const frame = lastFrame()!
    expect(frame).toContain('v0.2.0')
    expect(frame).toContain('X intelligence agent')
  })

  it('shows divider line', () => {
    const { lastFrame } = render(<Header version="0.2.0" firstRun={false} />)
    expect(lastFrame()!).toContain('──────')
  })

  it('shows getting started guide on first run', () => {
    const { lastFrame } = render(<Header version="0.2.0" firstRun={true} />)
    const frame = lastFrame()!
    expect(frame).toContain('Getting started')
    expect(frame).toContain('corvus auth setup')
    expect(frame).toContain('scan bitcoin')
    expect(frame).toContain('autonomous investigation')
  })

  it('shows command list on first run', () => {
    const { lastFrame } = render(<Header version="0.2.0" firstRun={true} />)
    const frame = lastFrame()!
    expect(frame).toContain('scan')
    expect(frame).toContain('pulse')
    expect(frame).toContain('agent')
  })

  it('does not show getting started for returning users', () => {
    const { lastFrame } = render(<Header version="0.2.0" firstRun={false} />)
    expect(lastFrame()!).not.toContain('Getting started')
  })
})
