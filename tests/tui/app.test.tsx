import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'

vi.mock('../../src/infra/auth.js', () => ({
  AuthManager: class {
    getGrokKey() { return 'test-key' }
    getXToken() { return null }
  },
}))

vi.mock('../../src/infra/config.js', () => ({
  ConfigManager: {
    defaultDir: () => '/tmp/.corvus',
    exists: () => true,
  },
}))

vi.mock('../../src/core/grok-adapter.js', () => ({
  GrokAdapter: class {},
}))

vi.mock('../../src/core/x-adapter.js', () => ({
  XAdapter: class {},
}))

import { App } from '../../src/tui/app.js'

describe('App', () => {
  it('renders CORVUS logo', () => {
    const { lastFrame } = render(<App version="0.2.0" />)
    expect(lastFrame()!).toContain('╔═╗╔═╗╦═╗╦')
  })

  it('renders status dots', () => {
    const { lastFrame } = render(<App version="0.2.0" />)
    const frame = lastFrame()!
    expect(frame).toContain('●')
    expect(frame).toContain('grok')
  })

  it('renders welcome message for returning user', () => {
    const { lastFrame } = render(<App version="0.2.0" />)
    expect(lastFrame()!).toContain('investigating')
  })

  it('renders input prompt', () => {
    const { lastFrame } = render(<App version="0.2.0" />)
    expect(lastFrame()).toBeDefined()
  })
})
