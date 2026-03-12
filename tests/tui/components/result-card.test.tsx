import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { ResultCard } from '../../../src/tui/components/result-card.js'

describe('ResultCard', () => {
  it('renders command name and topic', () => {
    const { lastFrame } = render(
      <ResultCard command="scan" topic="bitcoin" rendered="mock output" cost={0.003} elapsed={1200} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('scan')
    expect(frame).toContain('bitcoin')
  })

  it('renders cost and elapsed time', () => {
    const { lastFrame } = render(
      <ResultCard command="pulse" topic="ETH" rendered="output" cost={0.005} elapsed={2500} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('$0.005')
    expect(frame).toContain('2.5s')
  })

  it('renders the inner content', () => {
    const { lastFrame } = render(
      <ResultCard command="scan" topic="test" rendered="Sentiment: 0.72" cost={0} elapsed={0} />,
    )
    expect(lastFrame()!).toContain('Sentiment: 0.72')
  })

  it('shows truncation footer when truncated > 0', () => {
    const { lastFrame } = render(
      <ResultCard command="scan" topic="btc" rendered="output" cost={0.003} elapsed={1200}
        truncated={32} index={0} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('32 more lines')
    expect(frame).toContain('/view 1')
  })

  it('hides truncation footer when truncated is 0', () => {
    const { lastFrame } = render(
      <ResultCard command="scan" topic="btc" rendered="output" cost={0.003} elapsed={1200}
        truncated={0} index={0} />,
    )
    expect(lastFrame()!).not.toContain('more lines')
  })
})
