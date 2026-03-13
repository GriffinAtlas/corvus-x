import fs from 'fs'
import path from 'path'

interface Credentials {
  grokKey?: string
  xBearerToken?: string
}

export class AuthManager {
  private credPath: string

  constructor(private baseDir: string) {
    this.credPath = path.join(baseDir, 'credentials.json')
  }

  getGrokKey(): string | null {
    return process.env.CORVUS_GROK_KEY ?? this.readCreds().grokKey ?? null
  }

  setGrokKey(key: string): void {
    this.updateCreds((c) => (c.grokKey = key))
  }

  getXToken(): string | null {
    return process.env.CORVUS_X_BEARER_TOKEN ?? this.readCreds().xBearerToken ?? null
  }

  setXToken(token: string): void {
    this.updateCreds((c) => (c.xBearerToken = token))
  }

  private readCreds(): Credentials {
    let raw: string
    try {
      raw = fs.readFileSync(this.credPath, 'utf-8')
    } catch {
      return {}
    }
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }

  private updateCreds(mutate: (c: Credentials) => void): void {
    const creds = this.readCreds()
    mutate(creds)
    try {
      fs.mkdirSync(this.baseDir, { recursive: true, mode: 0o700 })
      fs.writeFileSync(this.credPath, JSON.stringify(creds, null, 2), { mode: 0o600 })
    } catch (err) {
      throw new Error(`Failed to write credentials to ${this.credPath}`, { cause: err })
    }
  }
}
