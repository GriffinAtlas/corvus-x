#!/usr/bin/env node

import chalk from 'chalk'
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { registerAuthCommand } from '../src/cli/commands/auth.js'
import { registerAskCommand } from '../src/cli/commands/ask.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readVersion(): string {
  for (const depth of ['..', join('..', '..')]) {
    try {
      return JSON.parse(readFileSync(join(__dirname, depth, 'package.json'), 'utf-8')).version
    } catch {
      /* file not found at this depth */
    }
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
import { registerAgentCommand } from '../src/cli/commands/agent.js'
import { registerExportCommand } from '../src/cli/commands/export.js'

const program = new Command()

program
  .name('corvus')
  .description('Autonomous X intelligence agent — one question in, full investigation out')
  .version(VERSION)
  .option('--no-color', 'disable color output')
  .hook('preAction', () => {
    const opts = program.opts()
    if (opts.color === false) {
      chalk.level = 0
    }
  })

// Investigation
registerAgentCommand(program)
registerTraceCommand(program)
registerGatherCommand(program)

// Intelligence
registerScanCommand(program)
registerPulseCommand(program)
registerScopeCommand(program)
registerReadCommand(program)

// Monitoring
registerWatchCommand(program)

// Data
registerExportCommand(program)
registerHistoryCommand(program)

// Utilities
registerAskCommand(program)
registerAuthCommand(program)

program
  .command('repl')
  .description('[deprecated] Use corvus (no args) for interactive mode')
  .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
  .action(async (options: { format: string }) => {
    const { startRepl } = await import('../src/cli/repl.js')
    await startRepl(options.format as 'table' | 'json' | 'csv' | 'md')
  })

program.parse()
