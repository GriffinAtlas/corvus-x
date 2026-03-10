import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigManager } from '../../src/infra/config.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('ConfigManager', () => {
  let tmpDir: string
  let configManager: ConfigManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-test-'))
    configManager = new ConfigManager(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates config directory on first access', () => {
    configManager.load()
    expect(fs.existsSync(tmpDir)).toBe(true)
  })

  it('returns default config when no file exists', () => {
    const config = configManager.load()
    expect(config.activeProfile).toBe('default')
    expect(config.display.defaultFormat).toBe('table')
    expect(config.display.animation).toBe(true)
  })

  it('saves and loads config', () => {
    const config = configManager.load()
    config.display.animation = false
    configManager.save(config)

    const reloaded = configManager.load()
    expect(reloaded.display.animation).toBe(false)
  })

  it('returns defaults for corrupted config file', () => {
    const configPath = path.join(tmpDir, 'config.json')
    fs.writeFileSync(configPath, 'not valid json{{{')

    const config = configManager.load()
    expect(config.activeProfile).toBe('default')
  })
})
