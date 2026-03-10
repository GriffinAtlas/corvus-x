import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { GrokAdapter } from '../../core/grok-adapter.js'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import { formatOutput, type OutputFormat } from '../output.js'
import type { CommandResult } from '../../core/types.js'

const SYSTEM_PROMPT = `You are Corvus, a sharp and direct intelligence analyst for X (Twitter).
When answering questions about X discourse, be concise and informative.
Lead with the key insight. Include specific accounts and tweets when relevant.
Add brief editorial context when useful ("worth watching", "contrarian signal").
Do not use emoji. Do not use headers or markdown formatting.`

export function registerAskCommand(program: Command): void {
  program
    .command('ask <question...>')
    .description('Ask a natural language question about X')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (questionParts: string[], options: { format: OutputFormat; cost?: boolean }) => {
      const question = questionParts.join(' ')
      const baseDir = ConfigManager.defaultDir()
      const authManager = new AuthManager(baseDir)

      const grokKey = await authManager.getGrokKey()
      if (!grokKey) {
        console.log(chalk.red('\n  No Grok API key found. Run: corvus auth setup\n'))
        process.exit(1)
      }

      if (options.cost) {
        console.log(chalk.dim('\n  Estimated cost: ~$0.001-0.005 (Grok 4.1 Fast)\n'))
        return
      }

      const spinner = ora({ text: 'scanning X...', indent: 2 }).start()

      try {
        const grok = new GrokAdapter(grokKey)
        const response = await grok.query(question, {
          systemPrompt: SYSTEM_PROMPT,
          enableXSearch: true,
        })

        spinner.stop()

        const result: CommandResult = {
          command: 'ask',
          query: question,
          response: response.text,
          cost: response.usage.costUsd,
          cached: false,
          timestamp: Date.now(),
        }

        console.log(formatOutput(result, options.format))
      } catch (err) {
        spinner.stop()
        const msg = err instanceof Error ? err.message : String(err)
        console.log(chalk.red(`\n  Error: ${msg}\n`))
        process.exit(1)
      }
    })
}
