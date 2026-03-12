import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { StatusPanel } from '../../../src/tui/components/status-panel.js'

describe('StatusPanel', () => {
  it('shows connected status with filled dots', () => {
    const { lastFrame } = render(
      <StatusPanel grokStatus="connected" xApiStatus="connected" totalCost={0} queryCount={0} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('●')
    expect(frame).toContain('Grok')
    expect(frame).toContain('X API')
  })

  it('shows no-key status with hollow dots', () => {
    const { lastFrame } = render(
      <StatusPanel grokStatus="no-key" xApiStatus="no-key" totalCost={0} queryCount={0} />,
    )
    expect(lastFrame()!).toContain('○')
  })

  it('shows cost and query count', () => {
    const { lastFrame } = render(
      <StatusPanel
        grokStatus="connected"
        xApiStatus="connected"
        totalCost={0.015}
        queryCount={3}
      />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('$0.015')
    expect(frame).toContain('3 queries')
  })

  it('shows singular query label', () => {
    const { lastFrame } = render(
      <StatusPanel
        grokStatus="connected"
        xApiStatus="connected"
        totalCost={0.005}
        queryCount={1}
      />,
    )
    expect(lastFrame()!).toContain('1 query')
  })

  it('shows optional status for X API', () => {
    const { lastFrame } = render(
      <StatusPanel grokStatus="connected" xApiStatus="optional" totalCost={0} queryCount={0} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('●')
    expect(frame).toContain('○')
  })
})
