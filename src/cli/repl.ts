import { createInterface, Interface } from 'readline'
import { t, CorvusSpinner } from './theme.js'
import { AuthManager } from '../infra/auth.js'
import { ConfigManager } from '../infra/config.js'
import { GrokAdapter } from '../core/grok-adapter.js'
import { XAdapter } from '../core/x-adapter.js'
import { QueryCache } from '../core/cache.js'
import type { CommandResult } from '../core/types.js'
import { formatOutput, type OutputFormat } from './output.js'

const REPL_SYSTEM_PROMPT = `You are Corvus, a sharp intelligence analyst working in an interactive session.
The user will ask questions about X (Twitter) discourse, accounts, and narratives.
Be concise and direct. Lead with the key insight.
Include specific accounts and tweets when relevant.
Do not use emoji. Do not use headers or markdown formatting.`

interface ReplContext {
  grok: GrokAdapter
  x: XAdapter | null
  cache: QueryCache
  format: OutputFormat
  history: CommandResult[]
}

const COMMANDS: Record<string, string> = {
  '/help': 'Show available commands',
  '/format <type>': 'Set output format (table, json, csv, md)',
  '/history': 'Show query history for this session',
  '/cost': 'Show total session cost',
  '/clear': 'Clear screen',
  '/exit': 'Exit the REPL',
}

export async function startRepl(format: OutputFormat = 'table'): Promise<void> {
  const auth = new AuthManager(ConfigManager.defaultDir())

  const grokKey = auth.getGrokKey()
  if (!grokKey) {
    console.log(t.error('\n  No Grok API key found. Run: corvus auth setup\n'))
    process.exit(1)
  }

  const xToken = auth.getXToken()
  const ctx: ReplContext = {
    grok: new GrokAdapter(grokKey),
    x: xToken ? new XAdapter(xToken) : null,
    cache: new QueryCache(ConfigManager.defaultDir()),
    format,
    history: [],
  }

  console.log(t.heading('\n  corvus interactive'))
  console.log(t.muted('  type a question, or /help for commands\n'))

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: t.muted('  corvus> '),
  })

  rl.prompt()

  rl.on('line', async (line: string) => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }

    if (input.startsWith('/')) {
      const handled = handleSlashCommand(input, ctx, rl)
      if (handled === 'exit') return
      rl.prompt()
      return
    }

    await handleQuery(input, ctx)
    rl.prompt()
  })

  rl.on('close', () => {
    const totalCost = ctx.history.reduce((sum, r) => sum + r.cost, 0)
    if (ctx.history.length > 0) {
      console.log(
        t.muted(`\n  session: ${ctx.history.length} queries, $${totalCost.toFixed(4)} total\n`),
      )
    }
  })
}

function handleSlashCommand(input: string, ctx: ReplContext, rl: Interface): 'exit' | void {
  const [cmd, ...args] = input.split(' ')

  switch (cmd) {
    case '/help':
      console.log('')
      for (const [k, v] of Object.entries(COMMANDS)) {
        console.log(`  ${t.heading(k.padEnd(20))} ${t.muted(v)}`)
      }
      console.log('')
      break

    case '/format': {
      const valid: OutputFormat[] = ['table', 'json', 'csv', 'md']
      const fmt = args[0] as OutputFormat
      if (valid.includes(fmt)) {
        ctx.format = fmt
        console.log(t.muted(`  format set to ${fmt}`))
      } else {
        console.log(t.error(`  invalid format. options: ${valid.join(', ')}`))
      }
      break
    }

    case '/history':
      if (ctx.history.length === 0) {
        console.log(t.muted('  no queries yet'))
      } else {
        console.log('')
        for (const [i, r] of ctx.history.entries()) {
          console.log(`  ${t.muted(`${i + 1}.`)} ${r.query} ${t.muted(`($${r.cost.toFixed(4)})`)}`)
        }
        console.log('')
      }
      break

    case '/cost': {
      const total = ctx.history.reduce((sum, r) => sum + r.cost, 0)
      console.log(
        t.muted(`  session cost: $${total.toFixed(4)} across ${ctx.history.length} queries`),
      )
      break
    }

    case '/clear':
      console.clear()
      break

    case '/exit':
    case '/quit':
    case '/q':
      rl.close()
      return 'exit'

    default:
      console.log(t.error(`  unknown command: ${cmd}. type /help`))
  }
}

async function handleQuery(input: string, ctx: ReplContext): Promise<void> {
  const spinner = new CorvusSpinner('thinking...').start()

  try {
    const cached = ctx.cache.get('repl', input)
    if (cached) {
      spinner.stop()
      const result: CommandResult = {
        command: 'repl',
        query: input,
        response: cached.response,
        cost: 0,
        cached: true,
        timestamp: Date.now(),
      }
      ctx.history.push(result)
      console.log(formatOutput(result, ctx.format))
      return
    }

    const response = await ctx.grok.query(input, {
      systemPrompt: REPL_SYSTEM_PROMPT,
      enableXSearch: true,
      enableWebSearch: true,
    })

    spinner.stop()

    ctx.cache.set('repl', input, response.text, response.usage.costUsd)

    const result: CommandResult = {
      command: 'repl',
      query: input,
      response: response.text,
      cost: response.usage.costUsd,
      cached: false,
      timestamp: Date.now(),
    }

    ctx.history.push(result)
    console.log(formatOutput(result, ctx.format))
  } catch (err) {
    spinner.stop()
    const msg = err instanceof Error ? err.message : String(err)
    console.log(t.error(`  error: ${msg}`))
  }
}
