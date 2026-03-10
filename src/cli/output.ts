import chalk from 'chalk'
import type { CommandResult } from '../core/types.js'

export type OutputFormat = 'table' | 'json' | 'csv' | 'md'

export function formatOutput(result: CommandResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return formatJson(result)
    case 'csv':
      return formatCsv(result)
    case 'md':
      return formatMarkdown(result)
    case 'table':
    default:
      return formatTable(result)
  }
}

function formatTable(result: CommandResult): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`  ${chalk.bold(result.command)} ${chalk.dim('·')} ${result.query}`)
  lines.push(`  ${chalk.dim('───────────────────────────────────────────')}`)
  lines.push('')
  lines.push(`  ${result.response.split('\n').join('\n  ')}`)
  lines.push('')
  if (!result.cached) {
    lines.push(`  ${chalk.dim(`cost: $${result.cost.toFixed(4)}`)}`)
  } else {
    lines.push(`  ${chalk.dim('(cached)')}`)
  }
  lines.push('')
  return lines.join('\n')
}

function formatJson(result: CommandResult): string {
  return JSON.stringify(
    {
      command: result.command,
      query: result.query,
      response: result.response,
      cost: result.cost,
      cached: result.cached,
      timestamp: result.timestamp,
    },
    null,
    2,
  )
}

function formatCsv(result: CommandResult): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = 'command,query,response,cost,cached,timestamp'
  const row = [
    result.command,
    escape(result.query),
    escape(result.response),
    result.cost.toString(),
    result.cached.toString(),
    result.timestamp.toString(),
  ].join(',')
  return `${header}\n${row}`
}

function formatMarkdown(result: CommandResult): string {
  const lines: string[] = []
  lines.push(`## ${result.command}`)
  lines.push('')
  lines.push(`**Query:** ${result.query}`)
  lines.push('')
  lines.push(result.response)
  lines.push('')
  lines.push(`---`)
  lines.push(`*Cost: $${result.cost.toFixed(4)} | ${result.cached ? 'cached' : 'live'}*`)
  return lines.join('\n')
}
