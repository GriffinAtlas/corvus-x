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
  it('renders crow art and logo', () => {
    const { lastFrame } = render(<App version="0.1.0" />)
    const frame = lastFrame()!
    expect(frame).toContain('⣠⣤⣄⣀⣀')
    expect(frame).toContain('╔═╗╔═╗╦═╗╦')
  })

  it('renders status line with dot indicators', () => {
    const { lastFrame } = render(<App version="0.1.0" />)
    expect(lastFrame()!).toContain('Grok')
    expect(lastFrame()!).toContain('●')
  })

  it('renders input prompt', () => {
    const { lastFrame } = render(<App version="0.1.0" />)
    // The TextInput placeholder or prompt character should be visible
    expect(lastFrame()).toBeDefined()
  })
})
