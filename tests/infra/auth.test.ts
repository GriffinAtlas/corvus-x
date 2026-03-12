import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AuthManager } from '../../src/infra/auth.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('AuthManager', () => {
  let tmpDir: string
  let auth: AuthManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-auth-'))
    auth = new AuthManager(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('returns null when no grok key is stored', () => {
    expect(auth.getGrokKey()).toBeNull()
  })

  it('returns null when no x token is stored', () => {
    expect(auth.getXToken()).toBeNull()
  })

  it('stores and retrieves grok key', () => {
    auth.setGrokKey('xai-test-key-123')
    expect(auth.getGrokKey()).toBe('xai-test-key-123')
  })

  it('stores and retrieves x bearer token', () => {
    auth.setXToken('bearer-test-456')
    expect(auth.getXToken()).toBe('bearer-test-456')
  })

  it('overwrites an existing grok key', () => {
    auth.setGrokKey('old-key')
    auth.setGrokKey('new-key')
    expect(auth.getGrokKey()).toBe('new-key')
  })

  it('overwrites an existing x token', () => {
    auth.setXToken('old-token')
    auth.setXToken('new-token')
    expect(auth.getXToken()).toBe('new-token')
  })

  it('setting grok key does not clobber x token', () => {
    auth.setXToken('my-x-token')
    auth.setGrokKey('my-grok-key')
    expect(auth.getXToken()).toBe('my-x-token')
    expect(auth.getGrokKey()).toBe('my-grok-key')
  })

  it('setting x token does not clobber grok key', () => {
    auth.setGrokKey('my-grok-key')
    auth.setXToken('my-x-token')
    expect(auth.getGrokKey()).toBe('my-grok-key')
    expect(auth.getXToken()).toBe('my-x-token')
  })

  it('env var overrides stored grok key', () => {
    auth.setGrokKey('stored-key')
    vi.stubEnv('CORVUS_GROK_KEY', 'env-key')
    expect(auth.getGrokKey()).toBe('env-key')
  })

  it('env var overrides stored x token', () => {
    auth.setXToken('stored-token')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'env-token')
    expect(auth.getXToken()).toBe('env-token')
  })

  it('env var works even when no file exists', () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'env-only-key')
    expect(auth.getGrokKey()).toBe('env-only-key')
  })

  it('returns null and warns when credentials file is corrupted', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fs.writeFileSync(path.join(tmpDir, 'credentials.json'), '{{{not json')
    expect(auth.getGrokKey()).toBeNull()
    expect(auth.getXToken()).toBeNull()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('corrupted'))
    errSpy.mockRestore()
  })

  it('returns null and warns when credentials file is empty', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fs.writeFileSync(path.join(tmpDir, 'credentials.json'), '')
    expect(auth.getGrokKey()).toBeNull()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('corrupted'))
    errSpy.mockRestore()
  })

  it('returns null when credentials file contains empty object', () => {
    fs.writeFileSync(path.join(tmpDir, 'credentials.json'), '{}')
    expect(auth.getGrokKey()).toBeNull()
    expect(auth.getXToken()).toBeNull()
  })

  it('can write after corrupted file exists', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fs.writeFileSync(path.join(tmpDir, 'credentials.json'), 'garbage')
    auth.setGrokKey('recovered-key')
    expect(auth.getGrokKey()).toBe('recovered-key')
    errSpy.mockRestore()
  })

  it('creates base directory if it does not exist', () => {
    const nested = path.join(tmpDir, 'deep', 'nested', 'dir')
    const deepAuth = new AuthManager(nested)
    deepAuth.setGrokKey('test-key')
    expect(fs.existsSync(nested)).toBe(true)
    expect(deepAuth.getGrokKey()).toBe('test-key')
  })

  it('creates base directory with restricted permissions on Unix', () => {
    if (process.platform === 'win32') return
    const restricted = path.join(tmpDir, 'restricted-dir')
    const restrictedAuth = new AuthManager(restricted)
    restrictedAuth.setGrokKey('test-key')
    const stats = fs.statSync(restricted)
    expect(stats.mode & 0o777).toBe(0o700)
  })

  it('writes credentials as valid JSON on disk', () => {
    auth.setGrokKey('disk-key')
    auth.setXToken('disk-token')
    const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, 'credentials.json'), 'utf-8'))
    expect(parsed.grokKey).toBe('disk-key')
    expect(parsed.xBearerToken).toBe('disk-token')
  })

  it('throws descriptive error when credentials cannot be written', () => {
    const badPath = path.join(tmpDir, '\0invalid')
    const badAuth = new AuthManager(badPath)
    expect(() => badAuth.setGrokKey('test')).toThrow('Failed to write credentials')
  })
})
