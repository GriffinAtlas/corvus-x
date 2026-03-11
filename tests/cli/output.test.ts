import { describe, it, expect } from 'vitest'
import { formatOutput } from '../../src/cli/output.js'
import type { CommandResult } from '../../src/core/types.js'

function makeResult(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    command: 'ask',
    query: 'test query',
    response: 'AI agents are trending on X today.',
    cost: 0.001,
    cached: false,
    timestamp: 1710000000000,
    ...overrides,
  }
}

describe('formatOutput', () => {
  describe('table', () => {
    it('includes response text', () => {
      expect(formatOutput(makeResult(), 'table')).toContain('AI agents are trending')
    })

    it('includes cost with 4 decimal places', () => {
      expect(formatOutput(makeResult(), 'table')).toContain('$0.0010')
    })

    it('shows (cached) instead of cost when cached', () => {
      const output = formatOutput(makeResult({ cached: true }), 'table')
      expect(output).toContain('(cached)')
      expect(output).not.toContain('$0.0010')
    })

    it('includes command name and query', () => {
      const output = formatOutput(makeResult(), 'table')
      expect(output).toContain('ask')
      expect(output).toContain('test query')
    })

    it('indents multi-line responses', () => {
      const output = formatOutput(makeResult({ response: 'line1\nline2\nline3' }), 'table')
      expect(output).toContain('  line1')
      expect(output).toContain('  line2')
      expect(output).toContain('  line3')
    })

    it('handles zero cost', () => {
      expect(formatOutput(makeResult({ cost: 0 }), 'table')).toContain('$0.0000')
    })
  })

  describe('json', () => {
    it('produces valid JSON', () => {
      expect(() => JSON.parse(formatOutput(makeResult(), 'json'))).not.toThrow()
    })

    it('contains all CommandResult fields', () => {
      const parsed = JSON.parse(formatOutput(makeResult(), 'json'))
      expect(parsed.command).toBe('ask')
      expect(parsed.query).toBe('test query')
      expect(parsed.response).toBe('AI agents are trending on X today.')
      expect(parsed.cost).toBe(0.001)
      expect(parsed.cached).toBe(false)
      expect(parsed.timestamp).toBe(1710000000000)
    })

    it('preserves boolean cached field', () => {
      const parsed = JSON.parse(formatOutput(makeResult({ cached: true }), 'json'))
      expect(parsed.cached).toBe(true)
    })

    it('preserves numeric types', () => {
      const parsed = JSON.parse(formatOutput(makeResult({ cost: 0 }), 'json'))
      expect(parsed.cost).toBe(0)
      expect(typeof parsed.cost).toBe('number')
      expect(typeof parsed.timestamp).toBe('number')
    })

    it('handles special characters in response', () => {
      const parsed = JSON.parse(formatOutput(makeResult({ response: 'said "hello" and \'goodbye\'' }), 'json'))
      expect(parsed.response).toBe('said "hello" and \'goodbye\'')
    })

    it('handles newlines in response', () => {
      const parsed = JSON.parse(formatOutput(makeResult({ response: 'line1\nline2' }), 'json'))
      expect(parsed.response).toBe('line1\nline2')
    })
  })

  describe('csv', () => {
    it('has header row and data row', () => {
      const lines = formatOutput(makeResult(), 'csv').split('\n')
      expect(lines).toHaveLength(2)
      expect(lines[0]).toBe('command,query,response,cost,cached,timestamp')
    })

    it('escapes double quotes in query', () => {
      const output = formatOutput(makeResult({ query: 'what does "AI" mean?' }), 'csv')
      expect(output).toContain('"what does ""AI"" mean?"')
    })

    it('escapes double quotes in response', () => {
      const output = formatOutput(makeResult({ response: 'They said "yes"' }), 'csv')
      expect(output).toContain('"They said ""yes"""')
    })

    it('wraps query and response in quotes', () => {
      const dataRow = formatOutput(makeResult(), 'csv').split('\n')[1]
      expect(dataRow).toContain('"test query"')
      expect(dataRow).toContain('"AI agents are trending on X today."')
    })

    it('handles newlines in response', () => {
      const output = formatOutput(makeResult({ response: 'line1\nline2' }), 'csv')
      expect(output).toContain('"line1\nline2"')
    })

    it('includes all fields in correct order', () => {
      const dataRow = formatOutput(makeResult(), 'csv').split('\n')[1]
      expect(dataRow).toMatch(/^ask,/)
      expect(dataRow).toContain('0.001')
      expect(dataRow).toContain('false')
      expect(dataRow).toContain('1710000000000')
    })
  })

  describe('markdown', () => {
    it('includes command as heading', () => {
      expect(formatOutput(makeResult(), 'md')).toContain('## ask')
    })

    it('includes query in bold', () => {
      expect(formatOutput(makeResult(), 'md')).toContain('**Query:** test query')
    })

    it('includes response text', () => {
      expect(formatOutput(makeResult(), 'md')).toContain('AI agents are trending on X today.')
    })

    it('shows "live" for non-cached result', () => {
      expect(formatOutput(makeResult({ cached: false }), 'md')).toContain('live')
    })

    it('shows "cached" for cached result', () => {
      const output = formatOutput(makeResult({ cached: true }), 'md')
      expect(output).toContain('cached')
      expect(output).not.toContain('live')
    })

    it('includes cost with 4 decimal places', () => {
      expect(formatOutput(makeResult({ cost: 0.00123 }), 'md')).toContain('$0.0012')
    })

    it('includes horizontal rule', () => {
      expect(formatOutput(makeResult(), 'md')).toContain('---')
    })

    it('preserves multi-line response', () => {
      expect(formatOutput(makeResult({ response: 'line1\nline2' }), 'md')).toContain('line1\nline2')
    })
  })

  it('falls back to table for unknown format', () => {
    const tableOutput = formatOutput(makeResult(), 'table')
    expect(formatOutput(makeResult(), 'anything' as 'table')).toBe(tableOutput)
  })

  it('handles empty response', () => {
    const result = makeResult({ response: '' })
    expect(() => formatOutput(result, 'table')).not.toThrow()
    expect(() => formatOutput(result, 'json')).not.toThrow()
    expect(() => formatOutput(result, 'csv')).not.toThrow()
    expect(() => formatOutput(result, 'md')).not.toThrow()
  })

  it('handles very small cost', () => {
    expect(formatOutput(makeResult({ cost: 0.00001 }), 'table')).toContain('$0.0000')
  })

  it('handles unicode in response', () => {
    const parsed = JSON.parse(formatOutput(makeResult({ response: 'Trending: 🔥 AI agents' }), 'json'))
    expect(parsed.response).toBe('Trending: 🔥 AI agents')
  })
})
