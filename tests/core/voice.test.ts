import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { VoiceProfileManager } from '../../src/core/voice.js'
import type { VoiceProfile } from '../../src/core/schemas.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('VoiceProfileManager', () => {
  let tmpDir: string
  let manager: VoiceProfileManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-voice-'))
    manager = new VoiceProfileManager(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const sampleProfile: VoiceProfile = {
    handle: 'testuser',
    generatedAt: new Date().toISOString(),
    postCount: 30,
    traits: {
      tone: 'casual and direct',
      vocabulary: 'technical, uses jargon',
      sentenceStyle: 'short punchy sentences',
      emojiUsage: 'never',
      hashtagUsage: 'rarely',
      humor: 'dry wit',
      catchphrases: ['ship it', 'let me cook'],
      avgPostLength: 120,
      threadStyle: 'rarely threads',
    },
    topicPreferences: [
      { topic: 'TypeScript', frequency: 0.4 },
      { topic: 'CLI tools', frequency: 0.3 },
    ],
    examplePosts: ['Just shipped a new CLI tool', 'TypeScript is the way'],
  }

  it('returns null when no profile exists', () => {
    expect(manager.load()).toBeNull()
  })

  it('saves and loads a profile', () => {
    manager.save(sampleProfile)
    const loaded = manager.load()
    expect(loaded).toEqual(sampleProfile)
  })

  it('returns null for corrupted profile file', () => {
    fs.writeFileSync(path.join(tmpDir, 'voice-profile.json'), '{{{bad json')
    expect(manager.load()).toBeNull()
  })

  it('overwrites existing profile on save', () => {
    manager.save(sampleProfile)
    const updated = { ...sampleProfile, handle: 'newuser', postCount: 50 }
    manager.save(updated)
    const loaded = manager.load()
    expect(loaded!.handle).toBe('newuser')
    expect(loaded!.postCount).toBe(50)
  })

  it('creates directory if it does not exist', () => {
    const nested = path.join(tmpDir, 'deep', 'nested')
    const nestedManager = new VoiceProfileManager(nested)
    nestedManager.save(sampleProfile)
    expect(fs.existsSync(nested)).toBe(true)
    expect(nestedManager.load()).toEqual(sampleProfile)
  })

  it('isStale returns false for fresh profile', () => {
    expect(manager.isStale(sampleProfile)).toBe(false)
  })

  it('isStale returns true for profile older than 7 days', () => {
    const old = {
      ...sampleProfile,
      generatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    }
    expect(manager.isStale(old)).toBe(true)
  })

  it('generate calls Grok, parses response, saves profile', async () => {
    const grokResponse = {
      text: JSON.stringify({
        traits: sampleProfile.traits,
        topicPreferences: sampleProfile.topicPreferences,
      }),
      usage: { inputTokens: 500, outputTokens: 200, costUsd: 0.003, toolCalls: 0 },
      citations: [],
    }
    const mockGrok = {
      query: vi.fn().mockResolvedValue(grokResponse),
    }

    const tweets = [
      { id: '1', text: 'Just shipped a new CLI tool', authorId: 'u1', createdAt: '2026-03-10T12:00:00Z', metrics: { likes: 10, retweets: 5, replies: 2, impressions: 100 } },
      { id: '2', text: 'TypeScript is the way', authorId: 'u1', createdAt: '2026-03-10T13:00:00Z', metrics: { likes: 20, retweets: 3, replies: 1, impressions: 200 } },
    ]

    const profile = await manager.generate(mockGrok as any, 'testuser', tweets)

    expect(profile.handle).toBe('testuser')
    expect(profile.postCount).toBe(2)
    expect(profile.traits).toEqual(sampleProfile.traits)
    expect(profile.topicPreferences).toEqual(sampleProfile.topicPreferences)
    expect(profile.examplePosts).toEqual(['Just shipped a new CLI tool', 'TypeScript is the way'])
    expect(mockGrok.query).toHaveBeenCalledOnce()

    // Verify it was saved to disk
    const loaded = manager.load()
    expect(loaded!.handle).toBe('testuser')
  })
})
