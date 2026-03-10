#!/usr/bin/env node

import { Command } from 'commander'
import { registerAuthCommand } from '../src/cli/commands/auth.js'
import { registerAskCommand } from '../src/cli/commands/ask.js'

const program = new Command()

program
  .name('corvus')
  .description('AI-powered X intelligence in your terminal')
  .version('0.1.0')

registerAuthCommand(program)
registerAskCommand(program)

program.parse()
