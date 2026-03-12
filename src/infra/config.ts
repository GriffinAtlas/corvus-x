import fs from 'fs'
import os from 'os'
import path from 'path'

export const CONFIG_DIR = path.join(os.homedir(), '.corvus')

export class ConfigManager {
  static defaultDir(): string {
    return CONFIG_DIR
  }

  static exists(dir?: string): boolean {
    try {
      fs.statSync(dir ?? ConfigManager.defaultDir())
      return true
    } catch {
      return false
    }
  }
}
