import os from 'os'
import path from 'path'

export class ConfigManager {
  constructor(private baseDir: string) {}

  get dir(): string {
    return this.baseDir
  }

  static defaultDir(): string {
    return path.join(os.homedir(), '.corvus')
  }
}
