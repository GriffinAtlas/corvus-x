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

const GRADIENT = ['#4A1F8A', '#5C29A8', '#6E33C6', '#7C3AED', '#9F67FF', '#B48AFF']

export function gradient(text: string): string {
  if (!isTTY) return t.accent(text)
  return text
    .split('')
    .map((ch, i) => chalk.hex(GRADIENT[i % GRADIENT.length])(ch))
    .join('')
}

export function banner(command: string, topic: string): string {
  const crow = '▸'
  return `\n  ${t.accent(crow)} ${gradient('corvus')} ${t.accent(command)} ${t.muted('·')} ${topic}`
}

export function resultBox(lines: string[]): string {
  const maxLen = lines.reduce((max, line) => Math.max(max, strip(line).length), 0)
  const width = maxLen + 2
  const top = t.muted('  ┌' + '─'.repeat(width) + '┐')
  const bottom = t.muted('  └' + '─'.repeat(width) + '┘')
  const middle = lines.map((line) => {
    const stripped = strip(line)
    const padding = width - stripped.length - 1
    return t.muted('  │') + ' ' + line + ' '.repeat(Math.max(0, padding)) + t.muted('│')
  })
  return [top, ...middle, bottom].join('\n')
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

export const LOGO_LARGE_LINES = [
  ' ██████╗  ██████╗  ██████╗  ██╗   ██╗ ██╗   ██╗ ███████╗',
  ' ██╔════╝ ██╔═══██╗ ██╔══██╗ ██║   ██║ ██║   ██║ ██╔════╝',
  ' ██║      ██║   ██║ ██████╔╝ ██║   ██║ ██║   ██║ ███████╗',
  ' ██║      ██║   ██║ ██╔══██╗ ╚██╗ ██╔╝ ██║   ██║ ╚════██║',
  ' ╚██████╗ ╚██████╔╝ ██║  ██║  ╚████╔╝  ╚██████╔╝ ███████║',
  '  ╚═════╝  ╚═════╝  ╚═╝  ╚═╝   ╚═══╝    ╚═════╝  ╚══════╝',
]

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

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

export function sparkline(values: number[], maxVal?: number): string {
  if (values.length === 0) return ''
  const max = maxVal ?? Math.max(...values)
  if (max === 0) return SPARK_CHARS[0].repeat(values.length)
  return values
    .map((v) => {
      const idx = Math.min(Math.round((v / max) * (SPARK_CHARS.length - 1)), SPARK_CHARS.length - 1)
      return SPARK_CHARS[idx]
    })
    .join('')
}

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

const CROW_GRADIENT = [
  '#3A1078', '#4A1990', '#5522A8', '#602BBF',
  '#6E33C6', '#7C3AED', '#8B4FFF', '#9F67FF',
  '#B48AFF', '#C9A5FF', '#D4B8FF',
]

const LOGO_LARGE_GRADIENT = [
  '#3A1078', '#4A1990', '#5522A8', '#602BBF',
  '#6E33C6', '#7C3AED', '#8B4FFF', '#9F67FF',
  '#5C29A8', '#6E33C6', '#7C3AED',
  '#8B4FFF', '#9F67FF', '#B48AFF',
]

export function gradientCrow(large = false): string {
  const logoLines = large ? LOGO_LARGE_LINES : LOGO_LINES
  const allLines = [...CROW_SMALL_LINES, ...logoLines]
  const grad = large ? LOGO_LARGE_GRADIENT : CROW_GRADIENT
  return allLines
    .map((line, i) => chalk.hex(grad[i % grad.length])(line))
    .join('\n')
}

export function revealCrow(): Promise<void> {
  const cols = process.stdout.columns ?? 80
  const large = cols >= 80
  const logoLines = large ? LOGO_LARGE_LINES : LOGO_LINES
  const grad = large ? LOGO_LARGE_GRADIENT : CROW_GRADIENT

  if (!isTTY) {
    console.log(gradientCrow(large))
    return Promise.resolve()
  }

  const allLines = [...CROW_SMALL_LINES, ...logoLines]
  let i = 0

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const color = chalk.hex(grad[i % grad.length])
      console.log(color(allLines[i]))
      i++
      if (i >= allLines.length) {
        clearInterval(timer)
        resolve()
      }
    }, 45)
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
      for (let i = 0; i < this.lines.length; i++) {
        console.log(chalk.hex(CROW_GRADIENT[i % CROW_GRADIENT.length])(this.lines[i]))
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
      for (let i = 0; i < this.lines.length; i++) {
        const color = chalk.hex(CROW_GRADIENT[i % CROW_GRADIENT.length])
        const stripped = strip(this.lines[i])
        const padding = Math.max(0, (process.stdout.columns ?? 80) - stripped.length)
        process.stdout.write(color(this.lines[i]) + ' '.repeat(padding) + '\n')
      }
    }
  }

  private render(): void {
    if (this.frame > 0) {
      process.stdout.write(`\x1b[${this.lineCount}A`)
    }
    for (let i = 0; i < this.lines.length; i++) {
      const shift = (this.frame + i) % PULSE_COLORS.length
      const color = PULSE_COLORS[shift]
      const stripped = strip(this.lines[i])
      const padding = Math.max(0, (process.stdout.columns ?? 80) - stripped.length)
      process.stdout.write(color(this.lines[i]) + ' '.repeat(padding) + '\n')
    }
  }
}
