import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  XAdapter,
  XRateLimitError,
  XApiError,
  formatTweetsForAnalysis,
} from '../../src/core/x-adapter.js'
import type { Tweet, XUser } from '../../src/core/x-adapter.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }
}

const RAW_TWEET = {
  id: '123',
  text: 'AI agents are the future',
  author_id: 'user_1',
  created_at: '2026-03-10T12:00:00Z',
  public_metrics: {
    retweet_count: 50,
    reply_count: 10,
    like_count: 200,
    impression_count: 5000,
  },
}

const RAW_USER = {
  id: 'user_1',
  username: 'corvus_dev',
  name: 'Corvus Dev',
  description: 'Building intelligence tools',
  public_metrics: {
    followers_count: 1200,
    following_count: 300,
    tweet_count: 4500,
  },
  verified: false,
}

describe('XAdapter', () => {
  let adapter: XAdapter

  beforeEach(() => {
    mockFetch.mockReset()
    adapter = new XAdapter('test-bearer-token')
  })

  it('sends authorization header on all requests', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: RAW_TWEET }))
    await adapter.getTweet('123')
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-bearer-token')
  })

  it('getTweet returns parsed tweet', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: RAW_TWEET }))
    const tweet = await adapter.getTweet('123')
    expect(tweet.id).toBe('123')
    expect(tweet.text).toBe('AI agents are the future')
    expect(tweet.authorId).toBe('user_1')
    expect(tweet.createdAt).toBe('2026-03-10T12:00:00Z')
    expect(tweet.metrics.likes).toBe(200)
    expect(tweet.metrics.retweets).toBe(50)
    expect(tweet.metrics.replies).toBe(10)
    expect(tweet.metrics.impressions).toBe(5000)
  })

  it('getTweet requests correct fields', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: RAW_TWEET }))
    await adapter.getTweet('456')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/tweets/456')
    expect(url).toContain('tweet.fields=created_at')
    expect(url).toContain('public_metrics')
    expect(url).toContain('author_id')
  })

  it('getUser returns parsed user', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: RAW_USER }))
    const user = await adapter.getUser('corvus_dev')
    expect(user.id).toBe('user_1')
    expect(user.username).toBe('corvus_dev')
    expect(user.name).toBe('Corvus Dev')
    expect(user.description).toBe('Building intelligence tools')
    expect(user.followersCount).toBe(1200)
    expect(user.followingCount).toBe(300)
    expect(user.tweetCount).toBe(4500)
    expect(user.verified).toBe(false)
  })

  it('getUser requests correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: RAW_USER }))
    await adapter.getUser('test_user')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/users/by/username/test_user')
  })

  it('getUser rejects usernames with path traversal characters', async () => {
    await expect(adapter.getUser('foo/../tweets')).rejects.toThrow('Invalid X username')
  })

  it('getUser rejects usernames with query string characters', async () => {
    await expect(adapter.getUser('foo?bar=baz')).rejects.toThrow('Invalid X username')
  })

  it('getUser rejects usernames with hash characters', async () => {
    await expect(adapter.getUser('foo#fragment')).rejects.toThrow('Invalid X username')
  })

  it('getUser rejects empty username', async () => {
    await expect(adapter.getUser('')).rejects.toThrow('Invalid X username')
  })

  it('getUser rejects username longer than 15 characters', async () => {
    await expect(adapter.getUser('a'.repeat(16))).rejects.toThrow('Invalid X username')
  })

  it('getUser accepts valid usernames with underscores and digits', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: RAW_USER }))
    const user = await adapter.getUser('test_user_123')
    expect(user.username).toBe('corvus_dev')
  })

  it('getUserTweets returns array of parsed tweets', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [RAW_TWEET, RAW_TWEET] }))
    const tweets = await adapter.getUserTweets('12345')
    expect(tweets).toHaveLength(2)
    expect(tweets[0].id).toBe('123')
  })

  it('getUserTweets caps maxResults at 100', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await adapter.getUserTweets('12345', 999)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('max_results=100')
  })

  it('getUserTweets returns empty array when no data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: null }))
    const tweets = await adapter.getUserTweets('12345')
    expect(tweets).toEqual([])
  })

  it('searchRecent returns tweets, users, and nextToken', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [RAW_TWEET],
        includes: { users: [RAW_USER] },
        meta: { next_token: 'abc123' },
      }),
    )
    const result = await adapter.searchRecent('AI agents')
    expect(result.tweets).toHaveLength(1)
    expect(result.tweets[0].text).toBe('AI agents are the future')
    expect(result.users).toHaveLength(1)
    expect(result.users[0].username).toBe('corvus_dev')
    expect(result.nextToken).toBe('abc123')
  })

  it('searchRecent sends query param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], meta: {} }))
    await adapter.searchRecent('from:elonmusk AI')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('query=from')
  })

  it('searchRecent clamps maxResults between 10 and 100', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], meta: {} }))
    await adapter.searchRecent('test', 3)
    expect(mockFetch.mock.calls[0][0]).toContain('max_results=10')

    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], meta: {} }))
    await adapter.searchRecent('test', 500)
    expect(mockFetch.mock.calls[1][0]).toContain('max_results=100')
  })

  it('searchRecent returns empty when no data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: null, meta: {} }))
    const result = await adapter.searchRecent('test')
    expect(result.tweets).toEqual([])
    expect(result.users).toEqual([])
    expect(result.nextToken).toBeUndefined()
  })

  it('searchRecent paginates across multiple pages', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ ...RAW_TWEET, id: '100' }],
          includes: { users: [RAW_USER] },
          meta: { next_token: 'page2' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ ...RAW_TWEET, id: '200' }],
          includes: { users: [RAW_USER] },
          meta: {},
        }),
      )

    const result = await adapter.searchRecent('test', 10, 2)
    expect(result.tweets).toHaveLength(2)
    expect(result.tweets[0].id).toBe('100')
    expect(result.tweets[1].id).toBe('200')
  })

  it('searchRecent deduplicates tweets across pages', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: [RAW_TWEET],
          includes: { users: [RAW_USER] },
          meta: { next_token: 'page2' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [RAW_TWEET],
          includes: { users: [RAW_USER] },
          meta: {},
        }),
      )

    const result = await adapter.searchRecent('test', 10, 2)
    expect(result.tweets).toHaveLength(1)
    expect(result.users).toHaveLength(1)
  })

  it('searchRecent stops early when no nextToken', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [RAW_TWEET],
        includes: { users: [RAW_USER] },
        meta: {},
      }),
    )

    const result = await adapter.searchRecent('test', 10, 3)
    expect(result.tweets).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('searchRecent passes next_token as query param', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ ...RAW_TWEET, id: '1' }],
          includes: { users: [] },
          meta: { next_token: 'tok123' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ ...RAW_TWEET, id: '2' }],
          includes: { users: [] },
          meta: {},
        }),
      )

    await adapter.searchRecent('test', 10, 2)
    const secondUrl = mockFetch.mock.calls[1][0] as string
    expect(secondUrl).toContain('next_token=tok123')
  })

  it('getUserById fetches user by ID', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: RAW_USER }))
    const user = await adapter.getUserById('12345')
    expect(user.username).toBe('corvus_dev')
    expect(user.followersCount).toBe(1200)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/users/12345')
  })

  it('getTweet rejects non-numeric ID', async () => {
    await expect(adapter.getTweet('abc')).rejects.toThrow('Invalid tweet ID')
  })

  it('getTweet rejects path traversal in ID', async () => {
    await expect(adapter.getTweet('123/../tweets')).rejects.toThrow('Invalid tweet ID')
  })

  it('getUserById rejects non-numeric ID', async () => {
    await expect(adapter.getUserById('abc')).rejects.toThrow('Invalid user ID')
  })

  it('getUserTweets rejects non-numeric ID', async () => {
    await expect(adapter.getUserTweets('abc')).rejects.toThrow('Invalid user ID')
  })

  it('throws XRateLimitError on 429', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ detail: 'Too Many Requests' }, 429, {
        'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 900),
      }),
    )
    try {
      await adapter.getTweet('123')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(XRateLimitError)
      expect((err as XRateLimitError).resetAt).toBeInstanceOf(Date)
    }
  })

  it('throws XApiError on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: 'Not Found' }, 404))
    try {
      await adapter.getTweet('999')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(XApiError)
      expect((err as XApiError).status).toBe(404)
      expect((err as XApiError).message).toContain('404')
    }
  })

  it('throws XApiError on 401 unauthorized', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: 'Unauthorized' }, 401))
    await expect(adapter.getUser('test')).rejects.toThrow(XApiError)
  })

  it('propagates network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'))
    await expect(adapter.getTweet('123')).rejects.toThrow('fetch failed')
  })

  it('handles tweet with missing optional fields', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: { id: '789', text: 'minimal tweet' },
      }),
    )
    const tweet = await adapter.getTweet('789')
    expect(tweet.authorId).toBe('')
    expect(tweet.createdAt).toBe('')
    expect(tweet.metrics.likes).toBe(0)
    expect(tweet.metrics.impressions).toBe(0)
  })

  it('handles user with missing optional fields', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: { id: 'u1', username: 'min', name: 'Min' },
      }),
    )
    const user = await adapter.getUser('min')
    expect(user.description).toBe('')
    expect(user.followersCount).toBe(0)
    expect(user.verified).toBe(false)
  })

  it('throws XApiError when response body is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    })
    await expect(adapter.getTweet('123')).rejects.toThrow(XApiError)
  })

  it('XApiError from invalid JSON includes status code', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.reject(new SyntaxError('bad')),
    })
    try {
      await adapter.getTweet('123')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(XApiError)
      expect((err as XApiError).status).toBe(200)
      expect((err as XApiError).message).toContain('invalid JSON')
    }
  })
})

describe('XAdapter timeout', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('throws XApiError when request times out', async () => {
    const adapter = new XAdapter('test-token', { timeoutMs: 50 })
    mockFetch.mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
          if (init?.signal?.aborted) {
            onAbort()
            return
          }
          init?.signal?.addEventListener('abort', onAbort)
        }),
    )

    await expect(adapter.getTweet('123')).rejects.toThrow('timed out')
  })

  it('passes AbortSignal to fetch', async () => {
    const adapter = new XAdapter('test-token')
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: RAW_TWEET }))
    await adapter.getTweet('123')
    expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('uses custom timeout when provided', async () => {
    const adapter = new XAdapter('test-token', { timeoutMs: 5000 })
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: RAW_TWEET }))
    await adapter.getTweet('123')
    // Verify the request completed successfully (no timeout at 5s)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('clears timeout on successful response', async () => {
    const adapter = new XAdapter('test-token', { timeoutMs: 100 })
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: RAW_TWEET }))
    const tweet = await adapter.getTweet('123')
    expect(tweet.id).toBe('123')
  })

  it('clears timeout on non-abort error', async () => {
    const adapter = new XAdapter('test-token', { timeoutMs: 100 })
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    await expect(adapter.getTweet('123')).rejects.toThrow('network error')
  })
})

describe('XAdapter searchRecent — caps returned tweets (bug 17)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns only maxResults tweets when API returns more', () => {
    // Mock API returning 10 tweets but caller requests only 5
    const tenTweets = Array.from({ length: 10 }, (_, i) => ({
      ...RAW_TWEET,
      id: String(i + 1),
    }))
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: tenTweets,
        includes: { users: [RAW_USER] },
        meta: {},
      }),
    )

    const adapter = new XAdapter('test-token')
    return adapter.searchRecent('test query', 5, 1).then((result) => {
      expect(result.tweets).toHaveLength(5)
      // Verify the first 5 tweets are returned in order
      expect(result.tweets[0].id).toBe('1')
      expect(result.tweets[4].id).toBe('5')
    })
  })

  it('returns all tweets when API returns fewer than maxResults', () => {
    const threeTweets = Array.from({ length: 3 }, (_, i) => ({
      ...RAW_TWEET,
      id: String(i + 1),
    }))
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: threeTweets,
        includes: { users: [RAW_USER] },
        meta: {},
      }),
    )

    const adapter = new XAdapter('test-token')
    return adapter.searchRecent('test query', 5, 1).then((result) => {
      expect(result.tweets).toHaveLength(3)
    })
  })

  it('caps total tweets across multiple pages to maxResults * pages', () => {
    // Request maxResults=5, pages=2 → totalDesired=10
    // But each page returns 8 tweets (16 total) — should cap at 10
    const page1 = Array.from({ length: 8 }, (_, i) => ({
      ...RAW_TWEET,
      id: String(i + 1),
    }))
    const page2 = Array.from({ length: 8 }, (_, i) => ({
      ...RAW_TWEET,
      id: String(i + 9),
    }))
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: page1,
          includes: { users: [RAW_USER] },
          meta: { next_token: 'page2' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: page2,
          includes: { users: [RAW_USER] },
          meta: {},
        }),
      )

    const adapter = new XAdapter('test-token')
    return adapter.searchRecent('test query', 5, 2).then((result) => {
      expect(result.tweets).toHaveLength(10)
    })
  })
})

describe('formatTweetsForAnalysis', () => {
  const tweets: Tweet[] = [
    {
      id: '1',
      text: 'Hello world',
      authorId: 'a1',
      createdAt: '2024-01-01',
      metrics: { likes: 10, retweets: 5, replies: 2, impressions: 100 },
    },
    {
      id: '2',
      text: 'Goodbye',
      authorId: 'a2',
      createdAt: '2024-01-02',
      metrics: { likes: 20, retweets: 3, replies: 1, impressions: 200 },
    },
  ]
  const users: XUser[] = [
    {
      id: 'a1',
      username: 'alice',
      name: 'Alice',
      description: '',
      followersCount: 100,
      followingCount: 50,
      tweetCount: 10,
      verified: false,
    },
    {
      id: 'a2',
      username: 'bob',
      name: 'Bob',
      description: '',
      followersCount: 200,
      followingCount: 100,
      tweetCount: 20,
      verified: false,
    },
  ]

  it('formats tweets with index and handle', () => {
    const result = formatTweetsForAnalysis(tweets, users)
    expect(result).toContain('[0] @alice')
    expect(result).toContain('[1] @bob')
  })

  it('includes engagement metrics', () => {
    const result = formatTweetsForAnalysis(tweets, users)
    expect(result).toContain('10L 5RT 2R 100V')
  })

  it('includes tweet text', () => {
    const result = formatTweetsForAnalysis(tweets, users)
    expect(result).toContain('Hello world')
    expect(result).toContain('Goodbye')
  })

  it('falls back to authorId when user not found', () => {
    const result = formatTweetsForAnalysis(tweets, [])
    expect(result).toContain('@a1')
    expect(result).toContain('@a2')
  })
})
