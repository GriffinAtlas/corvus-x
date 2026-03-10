import { Command } from 'commander'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import { createInterface } from 'readline'

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export function registerAuthCommand(program: Command): void {
  const auth = program.command('auth').description('Set up API keys')

  auth
    .command('setup')
    .description('Interactive API key setup')
    .action(async () => {
      const baseDir = ConfigManager.defaultDir()
      const authManager = new AuthManager(baseDir)

      console.log('\n  corvus auth setup')
      console.log('  ─────────────────\n')

      console.log('  You need a Grok API key from https://console.x.ai\n')
      const grokKey = await prompt('  Grok API key: ')

      if (!grokKey) {
        console.log('\n  Grok API key is required. Aborting.')
        process.exit(1)
      }

      await authManager.setGrokKey(grokKey)
      console.log('  ✓ Grok key saved\n')

      const addX = await prompt('  Add X API bearer token? (optional) [y/N]: ')
      if (addX.toLowerCase() === 'y') {
        console.log('\n  Get your token at https://developer.x.com\n')
        const xToken = await prompt('  X Bearer Token: ')
        if (xToken) {
          await authManager.setXToken(xToken)
          console.log('  ✓ X API token saved\n')
        }
      }

      console.log("  ✓ Ready. Try: corvus ask \"what's trending in AI?\"\n")
    })

  auth
    .command('status')
    .description('Show current auth status')
    .action(async () => {
      const baseDir = ConfigManager.defaultDir()
      const authManager = new AuthManager(baseDir)

      const hasGrok = await authManager.hasGrokKey()
      const hasX = await authManager.hasXToken()

      console.log('\n  corvus auth status')
      console.log('  ──────────────────')
      console.log(`  Grok API:  ${hasGrok ? '✓ configured' : '✗ not set'}`)
      console.log(`  X API:     ${hasX ? '✓ configured' : '✗ not set (optional)'}`)
      console.log()
    })

  auth.action(async () => {
    await auth.commands.find((c) => c.name() === 'setup')?.parseAsync([], { from: 'user' })
  })
}
