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
import { registerTraceCommand } from '../src/cli/commands/trace.js'
import { registerPulseCommand } from '../src/cli/commands/pulse.js'
import { registerWatchCommand } from '../src/cli/commands/watch.js'
import { registerHistoryCommand } from '../src/cli/commands/history.js'
import { registerAgentCommand } from '../src/cli/commands/agent.js'
import { registerExportCommand } from '../src/cli/commands/export.js'
import { registerProfileCommand } from '../src/cli/commands/profile.js'
import { registerHooksCommand } from '../src/cli/commands/hooks.js'
import { registerDraftCommand } from '../src/cli/commands/draft.js'
import { registerReviewCommand } from '../src/cli/commands/review.js'
import { registerTimingCommand } from '../src/cli/commands/timing.js'
import { registerGrowCommand } from '../src/cli/commands/grow.js'

const program = new Command()

program
  .name('corvus')
  .description('AI agent toolkit for X — investigate discourse, grow your presence')
  .usage('[options] [command]')
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

// Intelligence
registerScanCommand(program)
registerPulseCommand(program)

// Growth
registerProfileCommand(program)
registerHooksCommand(program)
registerDraftCommand(program)
registerReviewCommand(program)
registerTimingCommand(program)
registerGrowCommand(program)

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
  .action(async () => {
    console.log('\n  corvus repl is deprecated. Run corvus (no args) for the interactive TUI.\n')
    process.exit(0)
  })

program
  .argument('[args...]')
  .action(async (args: string[]) => {
    if (args.length > 0) {
      console.error(`\n  Unknown command: ${args[0]}`)
      console.error(`  Run corvus --help for available commands.\n`)
      process.exit(1)
    }
    const React = await import('react')
    const { App, initApp } = await import('../src/tui/app.js')
    const init = initApp()
    const element = React.createElement(App, { version: VERSION, init })

    if (process.stdout.isTTY) {
      const { withFullScreen } = await import('fullscreen-ink')
      const { start, waitUntilExit } = withFullScreen(element)
      await start()
      await waitUntilExit()
    } else {
      const { render } = await import('ink')
      render(element, { exitOnCtrlC: true })
    }
  })

program.parse()
