export type ParsedCommand =
  | { type: 'command'; command: string; args: Record<string, string> }
  | { type: 'slash'; command: string }
  | { type: 'error'; message: string }
  | { type: 'empty' }

const TOPIC_COMMANDS = ['scan', 'pulse', 'trace', 'gather'] as const
const SLASH_COMMANDS = ['help', 'cost', 'history', 'clear', 'exit'] as const

export const COMMAND_KEYWORDS = [
  ...TOPIC_COMMANDS,
  'read',
  'scope',
  'ask',
  'history',
] as const

export function parseInput(raw: string): ParsedCommand {
  const input = raw.trim()
  if (!input) return { type: 'empty' }

  if (input.startsWith('/')) {
    const cmd = input.slice(1).toLowerCase()
    if ((SLASH_COMMANDS as readonly string[]).includes(cmd)) {
      return { type: 'slash', command: cmd }
    }
    return { type: 'error', message: `Unknown command: ${input}. Type /help for available commands.` }
  }

  const spaceIdx = input.indexOf(' ')
  const keyword = (spaceIdx === -1 ? input : input.slice(0, spaceIdx)).toLowerCase()
  const rest = spaceIdx === -1 ? '' : input.slice(spaceIdx + 1).trim()

  if ((TOPIC_COMMANDS as readonly string[]).includes(keyword)) {
    if (!rest) return { type: 'error', message: `Usage: ${keyword} <topic>` }
    return { type: 'command', command: keyword, args: { topic: rest } }
  }

  if (keyword === 'read') {
    if (!rest) return { type: 'error', message: 'Usage: read <tweet-id-or-url>' }
    return { type: 'command', command: 'read', args: { tweetIdOrUrl: rest } }
  }

  if (keyword === 'scope') {
    if (!rest) return { type: 'error', message: 'Usage: scope <@username>' }
    return { type: 'command', command: 'scope', args: { username: rest.replace(/^@/, '') } }
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
