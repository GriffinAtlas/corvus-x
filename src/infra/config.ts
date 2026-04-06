import os from 'os'
import path from 'path'

export const CONFIG_DIR = path.join(os.homedir(), '.corvus')

export class ConfigManager {
  static defaultDir(): string {
    return CONFIG_DIR
  }

}
