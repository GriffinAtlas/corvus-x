import fs from 'fs'
import os from 'os'
import path from 'path'

export interface CorvusConfig {
  activeProfile: string
  display: {
    animation: boolean
    defaultFormat: 'table' | 'json' | 'csv' | 'md'
  }
  budget: {
    sessionMaxUsd: number
  }
}

const DEFAULT_CONFIG: CorvusConfig = {
  activeProfile: 'default',
  display: {
    animation: true,
    defaultFormat: 'table',
  },
  budget: {
    sessionMaxUsd: 1.0,
  },
}

function defaults(): CorvusConfig {
  return structuredClone(DEFAULT_CONFIG)
}

export class ConfigManager {
  private configPath: string

  constructor(private baseDir: string) {
    this.configPath = path.join(baseDir, 'config.json')
  }

  private ensureDir(): void {
    fs.mkdirSync(this.baseDir, { recursive: true })
  }

  load(): CorvusConfig {
    this.ensureDir()

    let raw: string
    try {
      raw = fs.readFileSync(this.configPath, 'utf-8')
    } catch {
      return defaults() // file doesn't exist yet — expected on first run
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error(`  warning: ${this.configPath} is corrupted, using defaults`)
      return defaults()
    }

    return {
      activeProfile: parsed.activeProfile ?? DEFAULT_CONFIG.activeProfile,
      display: {
        animation: parsed.display?.animation ?? DEFAULT_CONFIG.display.animation,
        defaultFormat: parsed.display?.defaultFormat ?? DEFAULT_CONFIG.display.defaultFormat,
      },
      budget: {
        sessionMaxUsd: parsed.budget?.sessionMaxUsd ?? DEFAULT_CONFIG.budget.sessionMaxUsd,
      },
    }
  }

  save(config: CorvusConfig): void {
    this.ensureDir()
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2))
  }

  get dir(): string {
    return this.baseDir
  }

  static defaultDir(): string {
    return path.join(os.homedir(), '.corvus')
  }
}
