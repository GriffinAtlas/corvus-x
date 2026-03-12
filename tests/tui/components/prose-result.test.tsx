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
})
