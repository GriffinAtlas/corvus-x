import { describe, it, expect, vi, beforeEach } from 'vitest'
import { XAdapter, XRateLimitError, XApiError } from '../../src/core/x-adapter.js'

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

  it('getUserTweets returns array of parsed tweets', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [RAW_TWEET, RAW_TWEET] }))
    const tweets = await adapter.getUserTweets('user_1')
    expect(tweets).toHaveLength(2)
    expect(tweets[0].id).toBe('123')
  })

  it('getUserTweets caps maxResults at 100', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await adapter.getUserTweets('user_1', 999)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('max_results=100')
  })

  it('getUserTweets returns empty array when no data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: null }))
    const tweets = await adapter.getUserTweets('user_1')
    expect(tweets).toEqual([])
  })

  it('searchRecent returns tweets and nextToken', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: [RAW_TWEET],
      meta: { next_token: 'abc123' },
    }))
    const result = await adapter.searchRecent('AI agents')
    expect(result.tweets).toHaveLength(1)
    expect(result.tweets[0].text).toBe('AI agents are the future')
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
    expect(result.nextToken).toBeUndefined()
  })

  it('throws XRateLimitError on 429', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(
      { detail: 'Too Many Requests' },
      429,
      { 'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 900) },
    ))
    try {
      await adapter.getTweet('123')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(XRateLimitError)
      expect((err as XRateLimitError).resetAt).toBeInstanceOf(Date)
    }
  })

  it('throws XApiError on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(
      { detail: 'Not Found' },
      404,
    ))
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
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: { id: '789', text: 'minimal tweet' },
    }))
    const tweet = await adapter.getTweet('789')
    expect(tweet.authorId).toBe('')
    expect(tweet.createdAt).toBe('')
    expect(tweet.metrics.likes).toBe(0)
    expect(tweet.metrics.impressions).toBe(0)
  })

  it('handles user with missing optional fields', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: { id: 'u1', username: 'min', name: 'Min' },
    }))
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
