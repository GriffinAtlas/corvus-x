import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigManager } from '../../src/infra/config.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('ConfigManager', () => {
  let tmpDir: string
  let config: ConfigManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-config-'))
    config = new ConfigManager(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('dir getter returns the base directory', () => {
    expect(config.dir).toBe(tmpDir)
  })

  it('defaultDir returns path under homedir', () => {
    expect(ConfigManager.defaultDir()).toBe(path.join(os.homedir(), '.corvus'))
  })
})
