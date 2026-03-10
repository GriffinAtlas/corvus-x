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

  async getGrokKey(): Promise<string | null> {
    if (process.env.CORVUS_GROK_KEY) return process.env.CORVUS_GROK_KEY
    const creds = this.readCreds()
    return creds.grokKey ?? null
  }

  async setGrokKey(key: string): Promise<void> {
    const creds = this.readCreds()
    creds.grokKey = key
    this.writeCreds(creds)
  }

  async getXToken(): Promise<string | null> {
    if (process.env.CORVUS_X_BEARER_TOKEN) return process.env.CORVUS_X_BEARER_TOKEN
    const creds = this.readCreds()
    return creds.xBearerToken ?? null
  }

  async setXToken(token: string): Promise<void> {
    const creds = this.readCreds()
    creds.xBearerToken = token
    this.writeCreds(creds)
  }

  async hasGrokKey(): Promise<boolean> {
    return (await this.getGrokKey()) !== null
  }

  async hasXToken(): Promise<boolean> {
    return (await this.getXToken()) !== null
  }

  private readCreds(): Credentials {
    if (!fs.existsSync(this.credPath)) return {}
    try {
      return JSON.parse(fs.readFileSync(this.credPath, 'utf-8'))
    } catch {
      return {}
    }
  }

  private writeCreds(creds: Credentials): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
    fs.writeFileSync(this.credPath, JSON.stringify(creds, null, 2), { mode: 0o600 })
  }

  static defaultDir(): string {
    return path.join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.corvus')
  }
}
