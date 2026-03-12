import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { StatusLine } from '../../../src/tui/components/status-line.js'

describe('StatusLine', () => {
  it('shows filled dot and ready for connected state', () => {
    const { lastFrame } = render(
      <StatusLine grokStatus="connected" xApiStatus="connected" totalCost={0} queryCount={0} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('●')
    expect(frame).toContain('ready')
    expect(frame).toContain('Grok')
    expect(frame).toContain('X API')
  })

  it('shows cost formatted to 3 decimal places', () => {
    const { lastFrame } = render(
      <StatusLine grokStatus="connected" xApiStatus="no-key" totalCost={0.0125} queryCount={3} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('$0.013')
    expect(frame).toContain('3 queries')
  })

  it('shows not set for optional X API', () => {
    const { lastFrame } = render(
      <StatusLine grokStatus="connected" xApiStatus="optional" totalCost={0} queryCount={0} />,
    )
    expect(lastFrame()!).toContain('not set')
  })

  it('shows hollow dot and no key for missing keys', () => {
    const { lastFrame } = render(
      <StatusLine grokStatus="no-key" xApiStatus="no-key" totalCost={0} queryCount={0} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('○')
    expect(frame).toContain('no key')
  })

  it('shows singular query for count of 1', () => {
    const { lastFrame } = render(
      <StatusLine grokStatus="connected" xApiStatus="optional" totalCost={0} queryCount={1} />,
    )
    expect(lastFrame()!).toContain('1 query')
  })
})
