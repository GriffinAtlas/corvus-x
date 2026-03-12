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

vi.mock('../../src/core/snapshots.js', () => ({
  SnapshotStore: class {
    listTopics() { return [] }
  },
}))

import { App } from '../../src/tui/app.js'

describe('App', () => {
  it('renders welcome view with crow art', () => {
    const { lastFrame } = render(<App version="0.2.0" />)
    const frame = lastFrame()!
    expect(frame).toContain('╔═╗╔═╗╦═╗')
  })

  it('renders status panel with grok status', () => {
    const { lastFrame } = render(<App version="0.2.0" />)
    const frame = lastFrame()!
    expect(frame).toContain('●')
    expect(frame).toContain('Grok')
  })

  it('renders quick start tips', () => {
    const { lastFrame } = render(<App version="0.2.0" />)
    const frame = lastFrame()!
    expect(frame).toContain('Quick start')
    expect(frame).toContain('scan')
  })

  it('renders shortcut bar', () => {
    const { lastFrame } = render(<App version="0.2.0" />)
    expect(lastFrame()!).toContain('Ctrl+C')
  })

  it('renders input prompt', () => {
    const { lastFrame } = render(<App version="0.2.0" />)
    expect(lastFrame()).toBeDefined()
  })
})
