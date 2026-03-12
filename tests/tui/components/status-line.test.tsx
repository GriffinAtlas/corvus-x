import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { StatusLine } from '../../../src/tui/components/status-line.js'

describe('StatusLine', () => {
  it('shows connected status in green', () => {
    const { lastFrame } = render(
      <StatusLine grokStatus="connected" xApiStatus="connected" totalCost={0} queryCount={0} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('Grok')
    expect(frame).toContain('connected')
    expect(frame).toContain('X API')
  })

  it('shows cost formatted to 3 decimal places', () => {
    const { lastFrame } = render(
      <StatusLine grokStatus="connected" xApiStatus="no-key" totalCost={0.0125} queryCount={3} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('$0.013')
    expect(frame).toContain('3')
  })

  it('shows optional status for X API', () => {
    const { lastFrame } = render(
      <StatusLine grokStatus="connected" xApiStatus="optional" totalCost={0} queryCount={0} />,
    )
    expect(lastFrame()!).toContain('optional')
  })

  it('shows no-key status', () => {
    const { lastFrame } = render(
      <StatusLine grokStatus="no-key" xApiStatus="no-key" totalCost={0} queryCount={0} />,
    )
    expect(lastFrame()!).toContain('no key')
  })
})
