import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Header } from '../../../src/tui/components/header.js'

describe('Header', () => {
  it('shows version and status dots', () => {
    const { lastFrame } = render(
      <Header version="0.2.0" firstRun={false} grokStatus="connected" xApiStatus="connected" />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('v0.2.0')
    expect(frame).toContain('●')
    expect(frame).toContain('grok')
  })

  it('shows hollow dots for missing keys', () => {
    const { lastFrame } = render(
      <Header version="0.2.0" firstRun={false} grokStatus="no-key" xApiStatus="no-key" />,
    )
    expect(lastFrame()!).toContain('○')
  })

  it('shows setup prompt when no grok key', () => {
    const { lastFrame } = render(
      <Header version="0.2.0" firstRun={true} grokStatus="no-key" xApiStatus="no-key" />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('corvus auth setup')
    expect(frame).toContain('console.x.ai')
  })

  it('shows tips on first run with keys', () => {
    const { lastFrame } = render(
      <Header version="0.2.0" firstRun={true} grokStatus="connected" xApiStatus="optional" />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('scan bitcoin')
    expect(frame).toContain('pulse ethereum')
  })

  it('shows welcome for returning users', () => {
    const { lastFrame } = render(
      <Header version="0.2.0" firstRun={false} grokStatus="connected" xApiStatus="connected" />,
    )
    expect(lastFrame()!).toContain('investigating')
  })
})
