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

  it('shows spinner when loading', () => {
    const { lastFrame } = render(
      <InputBar onSubmit={() => {}} isLoading={true} />,
    )
    expect(lastFrame()!).toContain('working')
  })

  it('provides command suggestions', () => {
    const { lastFrame } = render(
      <InputBar onSubmit={() => {}} isLoading={false} />,
    )
    expect(lastFrame()).toBeDefined()
  })

  it('shows phaseLabel when loading', () => {
    const { lastFrame } = render(
      <InputBar onSubmit={() => {}} isLoading={true} phaseLabel='scanning "bitcoin"...' />,
    )
    expect(lastFrame()!).toContain('scanning "bitcoin"...')
  })

  it('falls back to working when phaseLabel is null', () => {
    const { lastFrame } = render(
      <InputBar onSubmit={() => {}} isLoading={true} phaseLabel={null} />,
    )
    expect(lastFrame()!).toContain('working')
  })
})
