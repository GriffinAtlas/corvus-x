import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

  it('creates config directory on first load', () => {
    const nested = path.join(tmpDir, 'sub', 'dir')
    const mgr = new ConfigManager(nested)
    mgr.load()
    expect(fs.existsSync(nested)).toBe(true)
  })

  it('creates config directory on save', () => {
    const nested = path.join(tmpDir, 'save', 'dir')
    const mgr = new ConfigManager(nested)
    mgr.save(mgr.load())
    expect(fs.existsSync(nested)).toBe(true)
  })

  it('returns full default config when no file exists', () => {
    const loaded = config.load()
    expect(loaded.activeProfile).toBe('default')
    expect(loaded.display.animation).toBe(true)
    expect(loaded.display.defaultFormat).toBe('table')
    expect(loaded.budget.sessionMaxUsd).toBe(1.0)
  })

  it('returns defaults and warns for corrupted JSON', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fs.writeFileSync(path.join(tmpDir, 'config.json'), 'not valid json{{{')
    const loaded = config.load()
    expect(loaded.activeProfile).toBe('default')
    expect(loaded.display.animation).toBe(true)
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('corrupted'))
    errSpy.mockRestore()
  })

  it('returns defaults and warns for empty file', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '')
    const loaded = config.load()
    expect(loaded.activeProfile).toBe('default')
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('corrupted'))
    errSpy.mockRestore()
  })

  it('fills missing display fields from defaults', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
      activeProfile: 'custom',
    }))
    const loaded = config.load()
    expect(loaded.activeProfile).toBe('custom')
    expect(loaded.display.animation).toBe(true)
    expect(loaded.display.defaultFormat).toBe('table')
    expect(loaded.budget.sessionMaxUsd).toBe(1.0)
  })

  it('fills missing budget from defaults', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
      activeProfile: 'test',
      display: { animation: false, defaultFormat: 'json' },
    }))
    const loaded = config.load()
    expect(loaded.display.animation).toBe(false)
    expect(loaded.display.defaultFormat).toBe('json')
    expect(loaded.budget.sessionMaxUsd).toBe(1.0)
  })

  it('fills missing animation from defaults when display exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
      display: { defaultFormat: 'csv' },
    }))
    const loaded = config.load()
    expect(loaded.display.animation).toBe(true)
    expect(loaded.display.defaultFormat).toBe('csv')
  })

  it('handles empty JSON object with all defaults', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{}')
    const loaded = config.load()
    expect(loaded.activeProfile).toBe('default')
    expect(loaded.display.animation).toBe(true)
    expect(loaded.display.defaultFormat).toBe('table')
    expect(loaded.budget.sessionMaxUsd).toBe(1.0)
  })

  it('saves and loads config preserving all fields', () => {
    const cfg = config.load()
    cfg.activeProfile = 'work'
    cfg.display.animation = false
    cfg.display.defaultFormat = 'md'
    cfg.budget.sessionMaxUsd = 5.0
    config.save(cfg)

    const reloaded = config.load()
    expect(reloaded.activeProfile).toBe('work')
    expect(reloaded.display.animation).toBe(false)
    expect(reloaded.display.defaultFormat).toBe('md')
    expect(reloaded.budget.sessionMaxUsd).toBe(5.0)
  })

  it('overwrites existing config on save', () => {
    const cfg1 = config.load()
    cfg1.activeProfile = 'first'
    config.save(cfg1)

    const cfg2 = config.load()
    cfg2.activeProfile = 'second'
    config.save(cfg2)

    expect(config.load().activeProfile).toBe('second')
  })

  it('saves valid JSON to disk', () => {
    const cfg = config.load()
    cfg.budget.sessionMaxUsd = 0
    config.save(cfg)
    const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'))
    expect(parsed.budget.sessionMaxUsd).toBe(0)
  })

  it('load returns independent copies', () => {
    const first = config.load()
    first.activeProfile = 'modified'
    first.display.animation = false

    const second = config.load()
    expect(second.activeProfile).toBe('default')
    expect(second.display.animation).toBe(true)
  })

  it('dir getter returns the base directory', () => {
    expect(config.dir).toBe(tmpDir)
  })

  it('defaultDir returns path under homedir', () => {
    expect(ConfigManager.defaultDir()).toBe(path.join(os.homedir(), '.corvus'))
  })

  it('handles zero budget', () => {
    const cfg = config.load()
    cfg.budget.sessionMaxUsd = 0
    config.save(cfg)
    expect(config.load().budget.sessionMaxUsd).toBe(0)
  })
})
