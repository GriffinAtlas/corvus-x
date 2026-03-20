export type ParsedCommand =
  | { type: 'command'; command: string; args: Record<string, string> }
  | { type: 'slash'; command: string; args?: Record<string, string> }
  | { type: 'error'; message: string }
  | { type: 'empty' }

const TOPIC_COMMANDS = new Set(['scan', 'pulse', 'trace', 'hooks', 'draft', 'grow'])
const SLASH_COMMANDS = new Set(['help', 'cost', 'history', 'clear', 'exit', 'view'])

export const COMMAND_KEYWORDS = [
  ...TOPIC_COMMANDS,
  'profile',
  'review',
  'timing',
  'ask',
  'history',
  '/view',
] as const

export function parseInput(raw: string): ParsedCommand {
  const input = raw.trim()
  if (!input) return { type: 'empty' }

  if (input.startsWith('/')) {
    // /view N — must be checked before generic slash lookup
    if (input === '/view' || input.startsWith('/view ')) {
      const rest = input.slice(5).trim()
      if (!rest) return { type: 'error', message: 'Usage: /view <number>' }
      const n = parseInt(rest)
      if (isNaN(n) || n < 1) return { type: 'error', message: 'Usage: /view <number>' }
      return { type: 'slash', command: 'view', args: { index: String(n) } }
    }

    const cmd = input.slice(1).toLowerCase()
    if (SLASH_COMMANDS.has(cmd)) {
      return { type: 'slash', command: cmd }
    }
    return { type: 'error', message: `Unknown command: ${input}. Type /help for available commands.` }
  }

  const spaceIdx = input.indexOf(' ')
  const keyword = (spaceIdx === -1 ? input : input.slice(0, spaceIdx)).toLowerCase()
  const rest = spaceIdx === -1 ? '' : input.slice(spaceIdx + 1).trim()

  if (TOPIC_COMMANDS.has(keyword)) {
    if (!rest) return { type: 'error', message: `Usage: ${keyword} <topic>` }
    return { type: 'command', command: keyword, args: { topic: rest } }
  }

  if (keyword === 'review') {
    return { type: 'command', command: 'review', args: {} }
  }

  if (keyword === 'timing') {
    if (!rest) return { type: 'command', command: 'timing', args: {} }
    return { type: 'command', command: 'timing', args: { topic: rest } }
  }

  if (keyword === 'profile') {
    if (!rest) return { type: 'error', message: 'Usage: profile <@username>' }
    return { type: 'command', command: 'profile', args: { username: rest.replace(/^@/, '') } }
  }

  if (keyword === 'ask') {
    if (!rest) return { type: 'error', message: 'Usage: ask <question>' }
    return { type: 'command', command: 'ask', args: { question: rest } }
  }

  if (keyword === 'history') {
    return { type: 'command', command: 'history', args: {} }
  }

  // Natural language fallback -> ask
  return { type: 'command', command: 'ask', args: { question: input } }
}
