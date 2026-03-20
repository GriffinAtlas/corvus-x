import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { StatusPanel } from '../../../src/tui/components/status-panel.js'

describe('StatusPanel', () => {
  it('shows connected status with filled dots', () => {
    const { lastFrame } = render(
      <StatusPanel grokStatus="connected" xApiStatus="connected" />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('●')
    expect(frame).toContain('Grok')
    expect(frame).toContain('X API')
  })

  it('shows no-key status with hollow dots', () => {
    const { lastFrame } = render(
      <StatusPanel grokStatus="no-key" xApiStatus="no-key" />,
    )
    expect(lastFrame()!).toContain('○')
  })

  it('shows optional status for X API', () => {
    const { lastFrame } = render(
      <StatusPanel grokStatus="connected" xApiStatus="optional" />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('●')
    expect(frame).toContain('○')
  })

  it('does not show cost or query count', () => {
    const { lastFrame } = render(
      <StatusPanel grokStatus="connected" xApiStatus="connected" />,
    )
    const frame = lastFrame()!
    expect(frame).not.toContain('$')
    expect(frame).not.toContain('quer')
  })
})
