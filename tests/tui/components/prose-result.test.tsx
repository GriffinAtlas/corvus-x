import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { ProseResult } from '../../../src/tui/components/prose-result.js'

describe('ProseResult', () => {
  it('renders the response text', () => {
    const { lastFrame } = render(<ProseResult text="AI is transforming healthcare." cost={0.002} />)
    expect(lastFrame()!).toContain('AI is transforming healthcare.')
  })

  it('does not show cost', () => {
    const { lastFrame } = render(<ProseResult text="Response" cost={0.0045} />)
    expect(lastFrame()!).not.toContain('$')
  })

  it('shows truncation footer when truncated > 0', () => {
    const { lastFrame } = render(
      <ProseResult text="short text" cost={0.002} truncated={18} index={2} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('18 more lines')
    expect(frame).toContain('/view 3')
  })

  it('hides truncation footer when truncated is 0', () => {
    const { lastFrame } = render(
      <ProseResult text="response" cost={0.002} truncated={0} index={0} />,
    )
    expect(lastFrame()!).not.toContain('more lines')
  })

  it('hides truncation footer when truncated prop is omitted', () => {
    const { lastFrame } = render(
      <ProseResult text="some text" cost={0.002} />,
    )
    expect(lastFrame()!).not.toContain('more lines')
  })

  it('truncation footer shows /view 1 when index is omitted', () => {
    const { lastFrame } = render(
      <ProseResult text="some text" cost={0.002} truncated={15} />,
    )
    const frame = lastFrame()!
    expect(frame).toContain('15 more lines')
    expect(frame).toContain('/view 1')
  })
})
