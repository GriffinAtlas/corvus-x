import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Header } from '../../../src/tui/components/header.js'

describe('Header', () => {
  it('shows version in compact mode', () => {
    const { lastFrame } = render(<Header version="0.1.0" firstRun={false} />)
    const frame = lastFrame()!
    expect(frame).toContain('corvus')
    expect(frame).toContain('0.1.0')
  })

  it('shows welcome message on first run', () => {
    const { lastFrame } = render(<Header version="0.1.0" firstRun={true} />)
    const frame = lastFrame()!
    expect(frame).toContain('corvus')
    expect(frame).toContain('Commands:')
  })
})
