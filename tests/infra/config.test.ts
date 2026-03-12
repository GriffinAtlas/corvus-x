import { describe, it, expect } from 'vitest'
import { ConfigManager, CONFIG_DIR } from '../../src/infra/config.js'
import path from 'path'
import os from 'os'

describe('ConfigManager', () => {
  it('defaultDir returns path under homedir', () => {
    expect(ConfigManager.defaultDir()).toBe(path.join(os.homedir(), '.corvus'))
  })

  it('CONFIG_DIR matches defaultDir', () => {
    expect(CONFIG_DIR).toBe(ConfigManager.defaultDir())
  })

  it('exists() returns false when dir does not exist', () => {
    expect(ConfigManager.exists('/tmp/nonexistent-corvus-test-' + Date.now())).toBe(false)
  })

  it('exists() returns true for an existing dir', () => {
    expect(ConfigManager.exists(os.tmpdir())).toBe(true)
  })
})
