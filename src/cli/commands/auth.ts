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

function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)
    let input = ''
    const onData = (ch: Buffer) => {
      const c = ch.toString()
      if (c === '\n' || c === '\r') {
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        process.stdin.removeListener('data', onData)
        process.stdin.pause()
        process.stdout.write('\n')
        resolve(input.trim())
      } else if (c === '\x7f' || c === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1)
          process.stdout.write('\b \b')
        }
      } else if (c === '\x03') {
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        process.stdin.removeListener('data', onData)
        process.stdin.pause()
        process.exit(1)
      } else if (c >= ' ') {
        input += c
        process.stdout.write('*')
      }
    }
    process.stdin.resume()
    process.stdin.on('data', onData)
  })
}

export function formatPostSetupHints(platform: string): string[] {
  const lines: string[] = []
  if (platform === 'win32') {
    lines.push('  ⚠ Note: credentials.json is not OS-protected on Windows.')
    lines.push('     Any local user can read it. See SECURITY.md for details.')
    lines.push('')
  }
  lines.push('  ✓ Ready. Try: corvus grow "your topic"')
  lines.push('')
  return lines
}

export async function validateGrokKey(apiKey: string): Promise<'valid' | 'invalid' | 'unknown'> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch('https://api.x.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    if (res.ok) return 'valid'
    if (res.status === 401 || res.status === 403) return 'invalid'
    return 'unknown'
  } catch {
    return 'unknown'
  } finally {
    clearTimeout(timer)
  }
}

async function runSetup(): Promise<void> {
  const auth = new AuthManager(ConfigManager.defaultDir())

  console.log('\n  corvus auth setup')
  console.log('  ─────────────────\n')

  console.log('  You need a Grok API key from https://console.x.ai\n')
  const grokKey = await promptSecret('  Grok API key: ')

  if (!grokKey) {
    console.log('\n  Grok API key is required. Aborting.')
    process.exit(1)
  }

  process.stdout.write('  Verifying key...')
  const status = await validateGrokKey(grokKey)
  if (status === 'invalid') {
    console.log(' ✗ invalid key')
    console.log('  Check your key at https://console.x.ai and try again.\n')
    process.exit(1)
  }
  if (status === 'unknown') {
    console.log(' ⚠ could not verify — saving anyway\n')
  } else {
    console.log(' ✓ valid\n')
  }

  auth.setGrokKey(grokKey)
  console.log('  ✓ Grok key saved\n')

  const addX = await prompt('  Add X API bearer token? (optional) [y/N]: ')
  if (addX.toLowerCase() === 'y') {
    console.log('\n  Get your token at https://developer.x.com\n')
    const xToken = await promptSecret('  X Bearer Token: ')
    if (xToken) {
      auth.setXToken(xToken)
      console.log('  ✓ X API token saved\n')
    }
  }

  const handle = await prompt('  Your X handle (e.g. @RogGriff): ')
  if (handle) {
    auth.setXHandle(handle)
    console.log(`  ✓ Handle saved: @${handle.replace(/^@/, '')}\n`)
  }

  for (const line of formatPostSetupHints(process.platform)) {
    console.log(line)
  }
}

function runStatus(): void {
  const auth = new AuthManager(ConfigManager.defaultDir())

  console.log('\n  corvus auth status')
  console.log('  ──────────────────')
  console.log(`  Grok API:  ${auth.getGrokKey() ? '✓ configured' : '✗ not set'}`)
  console.log(`  X API:     ${auth.getXToken() ? '✓ configured' : '✗ not set (optional)'}`)
  const handle = auth.getXHandle()
  console.log(`  X Handle:  ${handle ? `✓ @${handle}` : '✗ not set (run corvus auth setup)'}`)
  console.log()
}

export function registerAuthCommand(program: Command): void {
  const auth = program.command('auth')
    .description('Configure Grok API key and optional X credentials')

  auth.command('setup').description('Interactive API key setup').action(runSetup)
  auth.command('status').description('Show current auth status').action(runStatus)
  auth.action(runSetup)
}
