import chalk from 'chalk'
import type { CommandResult } from '../core/types.js'

export type OutputFormat = 'table' | 'json' | 'csv' | 'md'

export function formatOutput(result: CommandResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(result, null, 2)
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
  const cost = result.cached
    ? chalk.dim('(cached)')
    : chalk.dim(`cost: $${result.cost.toFixed(4)}`)

  return [
    '',
    `  ${chalk.bold(result.command)} ${chalk.dim('·')} ${result.query}`,
    `  ${chalk.dim('───────────────────────────────────────────')}`,
    '',
    `  ${result.response.split('\n').join('\n  ')}`,
    '',
    `  ${cost}`,
    '',
  ].join('\n')
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
  return [
    `## ${result.command}`,
    '',
    `**Query:** ${result.query}`,
    '',
    result.response,
    '',
    `---`,
    `*Cost: $${result.cost.toFixed(4)} | ${result.cached ? 'cached' : 'live'}*`,
  ].join('\n')
}
