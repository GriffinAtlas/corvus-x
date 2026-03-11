import chalk from 'chalk'

export const t = {
  accent: chalk.hex('#7C3AED'),
  positive: chalk.green,
  negative: chalk.red,
  warning: chalk.yellow,
  muted: chalk.dim,
  heading: chalk.bold,
  error: chalk.red.bold,
}

export const isTTY = process.stdout.isTTY ?? false

export function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

export function out(s: string): void {
  console.log(isTTY ? s : strip(s))
}

export function sentimentBar(val: number, width = 20): string {
  const clamped = Math.max(-1, Math.min(1, val))
  const center = Math.floor(width / 2)
  const chars = Array(width).fill('░')

  if (clamped < 0) {
    const filled = Math.round(Math.abs(clamped) * center)
    for (let i = center - filled; i < center; i++) {
      chars[i] = '█'
    }
    return t.negative(chars.slice(0, center).join('')) + t.muted(chars.slice(center).join(''))
  } else {
    const filled = Math.round(clamped * center)
    for (let i = center; i < center + filled; i++) {
      chars[i] = '█'
    }
    return t.muted(chars.slice(0, center).join('')) + t.positive(chars.slice(center).join(''))
  }
}

export function confidenceBar(val: number, width = 20): string {
  const clamped = Math.max(0, Math.min(1, val))
  const filled = Math.round(clamped * width)
  const empty = width - filled
  return t.positive('█'.repeat(filled)) + t.muted('░'.repeat(empty))
}

export function divider(width = 45): string {
  return t.muted('─'.repeat(width))
}

export function box(lines: string[]): string {
  const maxLen = lines.reduce((max, line) => Math.max(max, strip(line).length), 0)
  const padded = maxLen + 4
  const top = t.accent('  ╔' + '═'.repeat(padded) + '╗')
  const bottom = t.accent('  ╚' + '═'.repeat(padded) + '╝')
  const middle = lines.map((line) => {
    const stripped = strip(line)
    const padding = padded - stripped.length - 2
    return t.accent('  ║') + '  ' + line + ' '.repeat(Math.max(0, padding)) + t.accent('║')
  })
  return [top, ...middle, bottom].join('\n')
}

export const LOGO = t.accent(`  ╔═╗╔═╗╦═╗╦  ╦╦ ╦╔═╗
  ║  ║ ║╠╦╝╚╗╔╝║ ║╚═╗
  ╚═╝╚═╝╩╚═ ╚╝ ╚═╝╚═╝`)
