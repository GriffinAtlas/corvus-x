#!/usr/bin/env node

import { Command } from 'commander'
import { VERSION } from '../src/index.js'
import { registerAuthCommand } from '../src/cli/commands/auth.js'
import { registerAskCommand } from '../src/cli/commands/ask.js'
import { registerScanCommand } from '../src/cli/commands/scan.js'
import { registerReadCommand } from '../src/cli/commands/read.js'
import { registerScopeCommand } from '../src/cli/commands/scope.js'
import { registerTraceCommand } from '../src/cli/commands/trace.js'
import { registerPulseCommand } from '../src/cli/commands/pulse.js'
import { registerGatherCommand } from '../src/cli/commands/gather.js'

const program = new Command()

program
  .name('corvus')
  .description('AI-powered X intelligence in your terminal')
  .version(VERSION)

registerAuthCommand(program)
registerAskCommand(program)
registerScanCommand(program)
registerReadCommand(program)
registerScopeCommand(program)
registerTraceCommand(program)
registerPulseCommand(program)
registerGatherCommand(program)

program.parse()
