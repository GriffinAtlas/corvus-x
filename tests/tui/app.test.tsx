import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { App } from '../../src/tui/app.js'
import type { AppInit } from '../../src/tui/app.js'
import type { CorvusDeps } from '../../src/core/types.js'

const testInit: AppInit = {
  deps: { grok: {}, x: null } as unknown as CorvusDeps,
  grokStatus: 'connected',
  xApiStatus: 'optional',
  recentTopics: [],
}

describe('App', () => {
  it('renders welcome view with crow art', () => {
    const { lastFrame } = render(<App version="0.2.0" init={testInit} />)
    const frame = lastFrame()!
    expect(frame).toContain('╔═╗╔═╗╦═╗')
  })

  it('renders status panel with grok status', () => {
    const { lastFrame } = render(<App version="0.2.0" init={testInit} />)
    const frame = lastFrame()!
    expect(frame).toContain('●')
    expect(frame).toContain('Grok')
  })

  it('renders quick start tips', () => {
    const { lastFrame } = render(<App version="0.2.0" init={testInit} />)
    const frame = lastFrame()!
    expect(frame).toContain('Quick start')
    expect(frame).toContain('scan')
  })

  it('renders shortcut bar', () => {
    const { lastFrame } = render(<App version="0.2.0" init={testInit} />)
    expect(lastFrame()!).toContain('Ctrl+C')
  })

  it('renders input prompt', () => {
    const { lastFrame } = render(<App version="0.2.0" init={testInit} />)
    expect(lastFrame()).toBeDefined()
  })
})
