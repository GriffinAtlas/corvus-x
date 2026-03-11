#!/usr/bin/env node

import { Command } from 'commander'
import { VERSION } from '../src/index.js'
import { registerAuthCommand } from '../src/cli/commands/auth.js'
import { registerAskCommand } from '../src/cli/commands/ask.js'

const program = new Command()

program
  .name('corvus')
  .description('AI-powered X intelligence in your terminal')
  .version(VERSION)

registerAuthCommand(program)
registerAskCommand(program)

program.parse()
