#!/usr/bin/env node

import { Command } from 'commander'

const program = new Command()

program
  .name('corvus')
  .description('AI-powered X intelligence in your terminal')
  .version('0.1.0')

program.parse()
