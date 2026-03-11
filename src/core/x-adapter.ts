const BASE_URL = 'https://api.x.com/2'

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
  nextToken?: string
}

export class XRateLimitError extends Error {
  constructor(public resetAt: Date) {
    super(`Rate limited until ${resetAt.toISOString()}`)
    this.name = 'XRateLimitError'
  }
}

export class XApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'XApiError'
  }
}

export class XAdapter {
  constructor(private bearerToken: string) {}

  async getTweet(id: string): Promise<Tweet> {
    const params = new URLSearchParams({
      'tweet.fields': 'created_at,public_metrics,author_id',
    })
    const data = await this.request(`/tweets/${id}?${params}`)
    return parseTweet(data.data)
  }

  async getUser(username: string): Promise<XUser> {
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

  async searchRecent(query: string, maxResults = 10): Promise<XSearchResult> {
    const params = new URLSearchParams({
      query,
      'tweet.fields': 'created_at,public_metrics,author_id',
      max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    })
    const data = await this.request(`/tweets/search/recent?${params}`)
    return {
      tweets: (data.data ?? []).map(parseTweet),
      nextToken: data.meta?.next_token,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request(path: string): Promise<any> {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${this.bearerToken}` },
    })

    if (res.status === 429) {
      const reset = res.headers.get('x-rate-limit-reset')
      throw new XRateLimitError(new Date(Number(reset) * 1000))
    }

    if (!res.ok) {
      const body = await res.text()
      throw new XApiError(res.status, `X API ${res.status}: ${body}`)
    }

    return res.json()
  }
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
