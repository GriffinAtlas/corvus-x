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

export const CROW_SMALL = t.accent(
  `⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⣄⣀⣀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣼⣿⣿⡿⠋⠉⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣴⣿⣿⣿⣿⣿⡿⠁⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢀⣠⣾⣿⣿⣿⣿⣿⣿⠟⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢀⣴⣿⣿⣿⠿⠿⣿⣿⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⡪⠕⠋⠉⠉⠀⠀⠀⠫⡻⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⠷⠤⠀⠀⠀⠀⠀⠀⠀⠀⠀`,
)

export const CROW_LARGE = t.accent(
  `⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣶⣷⣶⣶⣦⣤⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⣿⣿⣿⣿⠏⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣤⣾⣿⣿⣿⣿⡿⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣴⣿⣿⣿⣿⣿⣿⣿⣿⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⣠⣾⣿⣿⣿⣿⣿⣿⣿⣿⠟⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⢀⣴⣾⣿⣿⣿⠿⠛⢿⣿⣿⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠐⢊⡭⠚⠛⠉⠉⠀⠀⠀⠘⢏⢻⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣱⣵⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`,
)

export const CROW_SMALL_LINES = [
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⣄⣀⣀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣼⣿⣿⡿⠋⠉⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣴⣿⣿⣿⣿⣿⡿⠁⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⢀⣠⣾⣿⣿⣿⣿⣿⣿⠟⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⢀⣴⣿⣿⣿⠿⠿⣿⣿⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⡪⠕⠋⠉⠉⠀⠀⠀⠫⡻⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⠷⠤⠀⠀⠀⠀⠀⠀⠀⠀⠀',
]

export const LOGO_LINES = [
  '  ╔═╗╔═╗╦═╗╦  ╦╦ ╦╔═╗',
  '  ║  ║ ║╠╦╝╚╗╔╝║ ║╚═╗',
  '  ╚═╝╚═╝╩╚═ ╚╝ ╚═╝╚═╝',
]

const PULSE_COLORS = [
  chalk.hex('#4A1F8A'),
  chalk.hex('#5C29A8'),
  chalk.hex('#6E33C6'),
  chalk.hex('#7C3AED'),
  chalk.hex('#9F67FF'),
  chalk.hex('#B48AFF'),
  chalk.hex('#9F67FF'),
  chalk.hex('#7C3AED'),
  chalk.hex('#6E33C6'),
  chalk.hex('#5C29A8'),
]

export function revealCrow(): Promise<void> {
  if (!isTTY) {
    console.log(CROW_SMALL)
    console.log(LOGO)
    return Promise.resolve()
  }

  const allLines = [...CROW_SMALL_LINES, ...LOGO_LINES]
  let i = 0

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      console.log(t.accent(allLines[i]))
      i++
      if (i >= allLines.length) {
        clearInterval(timer)
        resolve()
      }
    }, 60)
  })
}

export class CrowPulse {
  private frame = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private lineCount: number
  private lines: string[]

  constructor(variant: 'small' | 'logo' = 'small') {
    this.lines = variant === 'logo' ? LOGO_LINES : CROW_SMALL_LINES
    this.lineCount = this.lines.length
  }

  start(): void {
    if (!isTTY) {
      for (const line of this.lines) {
        console.log(t.accent(line))
      }
      return
    }

    this.render()
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % PULSE_COLORS.length
      this.render()
    }, 150)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (isTTY) {
      process.stdout.write(`\x1b[${this.lineCount}A`)
      for (const line of this.lines) {
        const stripped = strip(line)
        const padding = Math.max(0, (process.stdout.columns ?? 80) - stripped.length)
        process.stdout.write(t.accent(line) + ' '.repeat(padding) + '\n')
      }
    }
  }

  private render(): void {
    const color = PULSE_COLORS[this.frame]
    if (this.frame > 0) {
      process.stdout.write(`\x1b[${this.lineCount}A`)
    }
    for (const line of this.lines) {
      const stripped = strip(line)
      const padding = Math.max(0, (process.stdout.columns ?? 80) - stripped.length)
      process.stdout.write(color(line) + ' '.repeat(padding) + '\n')
    }
  }
}
