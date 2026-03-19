import { describe, it, expect, vi } from 'vitest'
import { buildDraftSnapshot } from '../../../src/core/builders/draft.js'
import type { CorvusDeps } from '../../../src/core/types.js'

const mockUsage = { inputTokens: 300, outputTokens: 150, costUsd: 0.005, toolCalls: 0 }

const draftGrokResponse = {
  post: 'TypeScript agents are the next frontier. Here is why I built one.',
  thread: ['1/3 TypeScript agents...', '2/3 The key insight...', '3/3 Try it yourself...'],
  angles: ['Focus on the architecture', 'Lead with the cost savings'],
  hashtags: ['#TypeScript', '#AIAgents'],
}

function makeDeps(grokResponse: unknown): CorvusDeps {
  const grok = {
    query: vi.fn().mockResolvedValue({
      text: JSON.stringify(grokResponse),
      usage: mockUsage,
      citations: [{ type: 'url_citation', url: 'https://x.com/someone/status/1', title: 'ref' }],
    }),
  } as unknown as CorvusDeps['grok']
  return { grok, x: null }
}

vi.mock('../../../src/core/voice.js', () => ({
  VoiceProfileManager: class {
    load() { return null }
  },
}))

vi.mock('../../../src/infra/config.js', () => ({
  ConfigManager: { defaultDir: () => '/tmp/.corvus' },
}))

describe('buildDraftSnapshot', () => {
  it('returns draft with post, angles, hashtags', async () => {
    const deps = makeDeps(draftGrokResponse)

    const result = await buildDraftSnapshot(deps, 'building AI agents', {})

    expect(result.data.topic).toBe('building AI agents')
    expect(result.data.post).toBe('TypeScript agents are the next frontier. Here is why I built one.')
    expect(result.data.angles).toEqual(['Focus on the architecture', 'Lead with the cost savings'])
    expect(result.data.hashtags).toEqual(['#TypeScript', '#AIAgents'])
    expect(result.data.contextUsed).toBe(true)
    expect(result.data.thread).toBeUndefined()
    expect(result.data.replyTo).toBeUndefined()
    expect(result.data.fetchedAt).toBeDefined()
    expect(result.cost).toBe(0.005)
    expect(result.citations).toHaveLength(1)
  })

  it('includes thread when thread option is set', async () => {
    const deps = makeDeps(draftGrokResponse)

    const result = await buildDraftSnapshot(deps, 'why I built Corvus', { thread: true })

    expect(result.data.thread).toEqual([
      '1/3 TypeScript agents...',
      '2/3 The key insight...',
      '3/3 Try it yourself...',
    ])
  })

  it('sets replyTo when provided', async () => {
    const deps = makeDeps(draftGrokResponse)

    const result = await buildDraftSnapshot(deps, 'reply', { replyTo: 'https://x.com/alice/status/99' })

    expect(result.data.replyTo).toBe('https://x.com/alice/status/99')
  })

  it('sets contextUsed=false when noContext is true', async () => {
    const deps = makeDeps(draftGrokResponse)

    const result = await buildDraftSnapshot(deps, 'test', { noContext: true })

    expect(result.data.contextUsed).toBe(false)
    // Verify enableXSearch was false
    const queryCall = (deps.grok.query as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(queryCall[1].enableXSearch).toBe(false)
  })

  it('uses NO_VOICE_PROMPT when no voice profile exists', async () => {
    const deps = makeDeps(draftGrokResponse)

    await buildDraftSnapshot(deps, 'test', {})

    const queryCall = (deps.grok.query as ReturnType<typeof vi.fn>).mock.calls[0]
    // Should use the no-voice prompt (contains "developer-friendly")
    expect(queryCall[1].systemPrompt).toContain('developer-friendly')
  })

  it('handles null/missing fields in Grok response', async () => {
    const deps = makeDeps({ post: null, angles: null, hashtags: null })

    const result = await buildDraftSnapshot(deps, 'test', {})

    expect(result.data.post).toBe('')
    expect(result.data.angles).toEqual([])
    expect(result.data.hashtags).toEqual([])
  })

  it('returns empty tweets and scores', async () => {
    const deps = makeDeps(draftGrokResponse)

    const result = await buildDraftSnapshot(deps, 'test', {})

    expect(result.tweets).toEqual([])
    expect(result.scores).toEqual([])
    expect(result.newestTweetAt).toBeNull()
  })
})
