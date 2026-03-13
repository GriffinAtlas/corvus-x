const BASE_URL = 'https://api.x.com/2'
const DEFAULT_TIMEOUT_MS = 15_000

export interface Tweet {
  id: string
  text: string
  authorId: string
  createdAt: string
  metrics: {
    retweets: number
    replies: number
    likes: number
    impressions: number
  }
}

export interface XUser {
  id: string
  username: string
  name: string
  description: string
  followersCount: number
  followingCount: number
  tweetCount: number
  verified: boolean
}

export interface XSearchResult {
  tweets: Tweet[]
  users: XUser[]
  nextToken?: string
}

export class XRateLimitError extends Error {
  constructor(public resetAt: Date) {
    super(`Rate limited until ${resetAt.toISOString()}`)
    this.name = 'XRateLimitError'
  }
}

export class XApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'XApiError'
  }
}

const X_USERNAME_RE = /^[A-Za-z0-9_]{1,15}$/

export class XAdapter {
  private bearerToken: string
  private timeoutMs: number

  constructor(bearerToken: string, options?: { timeoutMs?: number }) {
    this.bearerToken = bearerToken
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async getTweet(id: string): Promise<Tweet> {
    const params = new URLSearchParams({
      'tweet.fields': 'created_at,public_metrics,author_id',
    })
    const data = await this.request(`/tweets/${id}?${params}`)
    return parseTweet(data.data)
  }

  async getUserById(id: string): Promise<XUser> {
    const params = new URLSearchParams({
      'user.fields': 'description,public_metrics,verified',
    })
    const data = await this.request(`/users/${id}?${params}`)
    return parseUser(data.data)
  }

  async getUser(username: string): Promise<XUser> {
    if (!X_USERNAME_RE.test(username)) {
      throw new XApiError(400, `Invalid X username: ${username}`)
    }
    const params = new URLSearchParams({
      'user.fields': 'description,public_metrics,verified',
    })
    const data = await this.request(`/users/by/username/${username}?${params}`)
    return parseUser(data.data)
  }

  async getUserTweets(userId: string, maxResults = 10): Promise<Tweet[]> {
    const params = new URLSearchParams({
      'tweet.fields': 'created_at,public_metrics,author_id',
      max_results: String(Math.min(maxResults, 100)),
    })
    const data = await this.request(`/users/${userId}/tweets?${params}`)
    return (data.data ?? []).map(parseTweet)
  }

  async searchRecent(query: string, maxResults = 10, pages = 1): Promise<XSearchResult> {
    const perPage = Math.min(Math.max(maxResults, 10), 100)
    const allTweets: Tweet[] = []
    const seenTweetIds = new Set<string>()
    const allUsers: XUser[] = []
    const seenUserIds = new Set<string>()
    let nextToken: string | undefined

    for (let page = 0; page < pages; page++) {
      const params = new URLSearchParams({
        query,
        'tweet.fields': 'created_at,public_metrics,author_id',
        expansions: 'author_id',
        'user.fields': 'username,name,description,public_metrics,verified',
        max_results: String(perPage),
      })
      if (nextToken) params.set('next_token', nextToken)

      const data = await this.request(`/tweets/search/recent?${params}`)
      const pageTweets: Tweet[] = (data.data ?? []).map(parseTweet)
      const pageUsers: XUser[] = (data.includes?.users ?? []).map(parseUser)

      for (const tweet of pageTweets) {
        if (!seenTweetIds.has(tweet.id)) {
          seenTweetIds.add(tweet.id)
          allTweets.push(tweet)
        }
      }
      for (const user of pageUsers) {
        if (!seenUserIds.has(user.id)) {
          seenUserIds.add(user.id)
          allUsers.push(user)
        }
      }

      nextToken = data.meta?.next_token
      if (!nextToken) break
    }

    const totalDesired = maxResults * pages
    return { tweets: allTweets.slice(0, totalDesired), users: allUsers, nextToken }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request(path: string): Promise<any> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let res: Response
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${this.bearerToken}` },
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new XApiError(0, `X API request timed out after ${this.timeoutMs}ms`)
      }
      throw err
    }
    clearTimeout(timer)

    if (res.status === 429) {
      const reset = res.headers.get('x-rate-limit-reset')
      const resetSec = Number(reset)
      const resetDate =
        Number.isFinite(resetSec) && resetSec > 0
          ? new Date(resetSec * 1000)
          : new Date(Date.now() + 15 * 60 * 1000)
      throw new XRateLimitError(resetDate)
    }

    if (!res.ok) {
      const body = await res.text()
      const truncated = body.length > 200 ? body.slice(0, 200) + '...' : body
      throw new XApiError(res.status, `X API ${res.status}: ${truncated}`)
    }

    try {
      return await res.json()
    } catch {
      throw new XApiError(res.status, `X API ${res.status}: invalid JSON in response`)
    }
  }
}

export function formatTweetsForAnalysis(tweets: Tweet[], users: XUser[]): string {
  const userMap = new Map(users.map((u) => [u.id, u]))
  return tweets
    .map((t, i) => {
      const user = userMap.get(t.authorId)
      const handle = user?.username ?? t.authorId
      const eng = `${t.metrics.likes}L ${t.metrics.retweets}RT ${t.metrics.replies}R ${t.metrics.impressions}V`
      return `[${i}] @${handle} (${eng}): ${t.text}`
    })
    .join('\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTweet(raw: any): Tweet {
  return {
    id: raw.id,
    text: raw.text,
    authorId: raw.author_id ?? '',
    createdAt: raw.created_at ?? '',
    metrics: {
      retweets: raw.public_metrics?.retweet_count ?? 0,
      replies: raw.public_metrics?.reply_count ?? 0,
      likes: raw.public_metrics?.like_count ?? 0,
      impressions: raw.public_metrics?.impression_count ?? 0,
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseUser(raw: any): XUser {
  return {
    id: raw.id,
    username: raw.username,
    name: raw.name,
    description: raw.description ?? '',
    followersCount: raw.public_metrics?.followers_count ?? 0,
    followingCount: raw.public_metrics?.following_count ?? 0,
    tweetCount: raw.public_metrics?.tweet_count ?? 0,
    verified: raw.verified ?? false,
  }
}
