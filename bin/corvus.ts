#!/usr/bin/env node

import chalk from 'chalk'
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { registerAuthCommand } from '../src/cli/commands/auth.js'
import { registerAskCommand } from '../src/cli/commands/ask.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Resolves from both bin/corvus.ts (dev) and dist/bin/corvus.js (build/npm install)
function readVersion(): string {
  for (const depth of ['..', join('..', '..')]) {
    try {
      return JSON.parse(readFileSync(join(__dirname, depth, 'package.json'), 'utf-8')).version
    } catch {}
  }
  return '0.0.0'
}
const VERSION = readVersion()
import { registerScanCommand } from '../src/cli/commands/scan.js'
import { registerReadCommand } from '../src/cli/commands/read.js'
import { registerScopeCommand } from '../src/cli/commands/scope.js'
import { registerTraceCommand } from '../src/cli/commands/trace.js'
import { registerPulseCommand } from '../src/cli/commands/pulse.js'
import { registerGatherCommand } from '../src/cli/commands/gather.js'
import { registerWatchCommand } from '../src/cli/commands/watch.js'
import { registerHistoryCommand } from '../src/cli/commands/history.js'

const program = new Command()

program
  .name('corvus')
  .description('AI-powered X intelligence in your terminal')
  .version(VERSION)
  .option('--no-color', 'disable color output')
  .hook('preAction', () => {
    const opts = program.opts()
    if (opts.color === false) {
      chalk.level = 0
    }
  })

registerAuthCommand(program)
registerAskCommand(program)
registerScanCommand(program)
registerReadCommand(program)
registerScopeCommand(program)
registerTraceCommand(program)
registerPulseCommand(program)
registerGatherCommand(program)
registerWatchCommand(program)
registerHistoryCommand(program)

program
  .command('repl')
  .description('Start an interactive intelligence session')
  .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
  .action(async (options: { format: string }) => {
    const { startRepl } = await import('../src/cli/repl.js')
    await startRepl(options.format as 'table' | 'json' | 'csv' | 'md')
  })

program.parse()
