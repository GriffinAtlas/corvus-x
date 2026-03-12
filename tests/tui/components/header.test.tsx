import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Header } from '../../../src/tui/components/header.js'

describe('Header', () => {
  it('shows CORVUS logo', () => {
    const { lastFrame } = render(
      <Header version="0.2.0" firstRun={false} grokStatus="connected" xApiStatus="connected" />,
    )
    expect(lastFrame()!).toContain('╔═╗╔═╗╦═╗╦')
  })

  it('shows version', () => {
    const { lastFrame } = render(
      <Header version="0.2.0" firstRun={false} grokStatus="connected" xApiStatus="connected" />,
    )
    expect(lastFrame()!).toContain('v0.2.0')
  })

  it('shows status dots', () => {
    const { lastFrame } = render(
      <Header version="0.2.0" firstRun={false} grokStatus="connected" xApiStatus="no-key" />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('●')
    expect(frame).toContain('○')
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
    expect(frame).toContain('agent')
  })

  it('shows welcome message for returning users', () => {
    const { lastFrame } = render(
      <Header version="0.2.0" firstRun={false} grokStatus="connected" xApiStatus="connected" />,
    )
    expect(lastFrame()!).toContain('investigating')
  })
})
