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
      /* not at this depth */
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
  .description('X intelligence agent')
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

// MCP
program
  .command('mcp')
  .description('Start MCP server — exposes all tools over stdio for AI agents')
  .action(async () => {
    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    )
    const { createServer } = await import('../src/mcp/server.js')
    const server = createServer()
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('corvus MCP server running on stdio')
  })

program
  .command('repl')
  .description('[deprecated] Use corvus (no args) for interactive mode')
  .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
  .action(async () => {
    console.log('\n  corvus repl is deprecated. Run corvus (no args) for the interactive TUI.\n')
    process.exit(0)
  })

program
  .action(async () => {
    const { render } = await import('ink')
    const React = await import('react')
    const { App } = await import('../src/tui/app.js')
    render(React.createElement(App, { version: VERSION }))
  })

program.parse()
