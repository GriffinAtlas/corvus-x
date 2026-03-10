import { describe, it, expect } from 'vitest'
import { formatOutput } from '../../src/cli/output.js'
import type { CommandResult } from '../../src/core/types.js'

const mockResult: CommandResult = {
  command: 'ask',
  query: 'test query',
  response: 'AI agents are trending on X today.',
  cost: 0.001,
  cached: false,
  timestamp: Date.now(),
}

describe('formatOutput', () => {
  it('formats as table with cost', () => {
    const output = formatOutput(mockResult, 'table')
    expect(output).toContain('AI agents are trending')
    expect(output).toContain('$0.0010')
  })

  it('formats cached result without cost', () => {
    const cached = { ...mockResult, cached: true }
    const output = formatOutput(cached, 'table')
    expect(output).toContain('(cached)')
    expect(output).not.toContain('$0.0010')
  })

  it('formats as valid json', () => {
    const output = formatOutput(mockResult, 'json')
    const parsed = JSON.parse(output)
    expect(parsed.response).toBe('AI agents are trending on X today.')
    expect(parsed.cost).toBe(0.001)
  })

  it('formats as csv with header', () => {
    const output = formatOutput(mockResult, 'csv')
    expect(output).toContain('command,query,response')
    expect(output.split('\n')).toHaveLength(2)
  })

  it('formats as markdown with header', () => {
    const output = formatOutput(mockResult, 'md')
    expect(output).toContain('## ask')
    expect(output).toContain('AI agents are trending')
    expect(output).toContain('live')
  })
})
