import fs from 'fs'
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

export class ConfigManager {
  private configPath: string

  constructor(private baseDir: string) {
    this.configPath = path.join(baseDir, 'config.json')
  }

  load(): CorvusConfig {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }

    if (!fs.existsSync(this.configPath)) {
      return {
        ...DEFAULT_CONFIG,
        display: { ...DEFAULT_CONFIG.display },
        budget: { ...DEFAULT_CONFIG.budget },
      }
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      return {
        activeProfile: raw.activeProfile ?? DEFAULT_CONFIG.activeProfile,
        display: {
          animation: raw.display?.animation ?? DEFAULT_CONFIG.display.animation,
          defaultFormat: raw.display?.defaultFormat ?? DEFAULT_CONFIG.display.defaultFormat,
        },
        budget: {
          sessionMaxUsd: raw.budget?.sessionMaxUsd ?? DEFAULT_CONFIG.budget.sessionMaxUsd,
        },
      }
    } catch {
      return {
        ...DEFAULT_CONFIG,
        display: { ...DEFAULT_CONFIG.display },
        budget: { ...DEFAULT_CONFIG.budget },
      }
    }
  }

  save(config: CorvusConfig): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2))
  }

  get dir(): string {
    return this.baseDir
  }

  static defaultDir(): string {
    return path.join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.corvus')
  }
}
