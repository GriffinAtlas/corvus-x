import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { ProseResult } from '../../../src/tui/components/prose-result.js'

describe('ProseResult', () => {
  it('renders the response text', () => {
    const { lastFrame } = render(<ProseResult text="AI is transforming healthcare." cost={0.002} />)
    expect(lastFrame()!).toContain('AI is transforming healthcare.')
  })

  it('renders cost', () => {
    const { lastFrame } = render(<ProseResult text="Response" cost={0.0045} />)
    expect(lastFrame()!).toContain('$0.0045')
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
})
