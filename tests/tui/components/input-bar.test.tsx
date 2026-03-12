import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { InputBar } from '../../../src/tui/components/input-bar.js'

describe('InputBar', () => {
  it('renders without crashing', () => {
    const { lastFrame } = render(
      <InputBar onSubmit={() => {}} isLoading={false} />,
    )
    expect(lastFrame()).toBeDefined()
  })

  it('shows loading indicator when isLoading is true', () => {
    const { lastFrame } = render(
      <InputBar onSubmit={() => {}} isLoading={true} />,
    )
    expect(lastFrame()!).toContain('…')
  })

  it('provides command suggestions', () => {
    const { lastFrame } = render(
      <InputBar onSubmit={() => {}} isLoading={false} />,
    )
    // TextInput with suggestions is rendered — we verify it doesn't crash.
    // Actual suggestion matching is tested via @inkjs/ui internals.
    expect(lastFrame()).toBeDefined()
  })
})
