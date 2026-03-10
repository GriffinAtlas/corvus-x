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

  it('returns null when no key is stored', async () => {
    const key = await auth.getGrokKey()
    expect(key).toBeNull()
  })

  it('stores and retrieves grok key', async () => {
    await auth.setGrokKey('xai-test-key-123')
    const key = await auth.getGrokKey()
    expect(key).toBe('xai-test-key-123')
  })

  it('stores and retrieves x bearer token', async () => {
    await auth.setXToken('bearer-test-456')
    const token = await auth.getXToken()
    expect(token).toBe('bearer-test-456')
  })

  it('env var overrides stored key', async () => {
    await auth.setGrokKey('stored-key')
    vi.stubEnv('CORVUS_GROK_KEY', 'env-key')

    const key = await auth.getGrokKey()
    expect(key).toBe('env-key')
  })

  it('env var overrides stored x token', async () => {
    await auth.setXToken('stored-token')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'env-token')

    const token = await auth.getXToken()
    expect(token).toBe('env-token')
  })

  it('hasGrokKey returns true when key exists', async () => {
    await auth.setGrokKey('xai-key')
    expect(await auth.hasGrokKey()).toBe(true)
  })

  it('hasGrokKey returns false when no key', async () => {
    expect(await auth.hasGrokKey()).toBe(false)
  })
})
