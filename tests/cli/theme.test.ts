import { describe, it, expect } from 'vitest'
import { strip, sentimentBar, confidenceBar, divider, box, LOGO, percentBar, labeledDivider } from '../../src/cli/theme.js'

describe('strip', () => {
  it('removes ANSI color codes', () => {
    expect(strip('\x1b[31mred text\x1b[0m')).toBe('red text')
  })

  it('returns plain text unchanged', () => {
    expect(strip('hello world')).toBe('hello world')
  })

  it('handles multiple ANSI codes', () => {
    expect(strip('\x1b[1m\x1b[32mbold green\x1b[0m')).toBe('bold green')
  })

  it('handles empty string', () => {
    expect(strip('')).toBe('')
  })
})

describe('sentimentBar', () => {
  it('returns a string of the specified width', () => {
    const bar = sentimentBar(0.5, 20)
    expect(strip(bar).length).toBe(20)
  })

  it('returns empty bar for zero sentiment', () => {
    const bar = sentimentBar(0, 20)
    const stripped = strip(bar)
    // All should be unfilled
    expect(stripped).toBe('░'.repeat(20))
  })

  it('fills right side for positive sentiment', () => {
    const bar = sentimentBar(1.0, 20)
    const stripped = strip(bar)
    // Right half should be filled
    expect(stripped.slice(10)).toContain('█')
  })

  it('fills left side for negative sentiment', () => {
    const bar = sentimentBar(-1.0, 20)
    const stripped = strip(bar)
    // Left half should be filled
    expect(stripped.slice(0, 10)).toContain('█')
  })

  it('clamps values above 1', () => {
    const bar1 = sentimentBar(1.0, 20)
    const bar5 = sentimentBar(5.0, 20)
    expect(strip(bar1)).toBe(strip(bar5))
  })

  it('clamps values below -1', () => {
    const bar1 = sentimentBar(-1.0, 20)
    const bar5 = sentimentBar(-5.0, 20)
    expect(strip(bar1)).toBe(strip(bar5))
  })
})

describe('confidenceBar', () => {
  it('returns a string of the specified width', () => {
    const bar = confidenceBar(0.5, 20)
    expect(strip(bar).length).toBe(20)
  })

  it('shows full bar for confidence 1.0', () => {
    const bar = confidenceBar(1.0, 20)
    expect(strip(bar)).toBe('█'.repeat(20))
  })

  it('shows empty bar for confidence 0', () => {
    const bar = confidenceBar(0, 20)
    expect(strip(bar)).toBe('░'.repeat(20))
  })

  it('clamps values above 1', () => {
    const bar = confidenceBar(2.0, 20)
    expect(strip(bar)).toBe('█'.repeat(20))
  })

  it('clamps values below 0', () => {
    const bar = confidenceBar(-1.0, 20)
    expect(strip(bar)).toBe('░'.repeat(20))
  })
})

describe('divider', () => {
  it('returns a line of dashes at specified width', () => {
    const d = divider(30)
    expect(strip(d)).toBe('─'.repeat(30))
  })

  it('defaults to 45 chars', () => {
    const d = divider()
    expect(strip(d)).toBe('─'.repeat(45))
  })
})

describe('box', () => {
  it('wraps lines in a border', () => {
    const result = box(['hello'])
    const stripped = strip(result)
    expect(stripped).toContain('╔')
    expect(stripped).toContain('╗')
    expect(stripped).toContain('║')
    expect(stripped).toContain('╚')
    expect(stripped).toContain('╝')
    expect(stripped).toContain('hello')
  })

  it('handles multiple lines', () => {
    const result = box(['line one', 'line two'])
    const stripped = strip(result)
    expect(stripped).toContain('line one')
    expect(stripped).toContain('line two')
  })

  it('sizes to the longest line', () => {
    const result = box(['short', 'this is a longer line'])
    const lines = strip(result).split('\n')
    // All lines should be the same width
    const widths = lines.map((l) => l.length)
    expect(new Set(widths).size).toBe(1)
  })
})

describe('percentBar', () => {
  it('returns string of correct stripped width', () => {
    expect(strip(percentBar(0.5, 20)).length).toBe(20)
    expect(strip(percentBar(0.5, 10)).length).toBe(10)
  })

  it('fills proportionally — 0% empty, 100% full', () => {
    const empty = strip(percentBar(0, 10))
    expect(empty).toBe('░'.repeat(10))
    const full = strip(percentBar(1, 10))
    expect(full).toBe('█'.repeat(10))
  })

  it('clamps values below 0 and above 1', () => {
    expect(strip(percentBar(-0.5, 10))).toBe('░'.repeat(10))
    expect(strip(percentBar(1.5, 10))).toBe('█'.repeat(10))
  })

  it('fills half at 0.5', () => {
    const bar = strip(percentBar(0.5, 10))
    expect(bar.slice(0, 5)).toBe('█'.repeat(5))
    expect(bar.slice(5)).toBe('░'.repeat(5))
  })
})

describe('labeledDivider', () => {
  it('includes the label text', () => {
    const result = strip(labeledDivider('Test'))
    expect(result).toContain('Test')
  })

  it('has dashes on both sides', () => {
    const result = strip(labeledDivider('Hello'))
    expect(result).toMatch(/^──/)
    expect(result).toMatch(/─+$/)
  })

  it('pads to requested width', () => {
    const result = strip(labeledDivider('Hi', 30))
    expect(result.length).toBeGreaterThanOrEqual(28)
  })

  it('handles label longer than width gracefully', () => {
    const long = 'A'.repeat(50)
    const result = strip(labeledDivider(long, 20))
    expect(result).toContain(long)
  })
})

describe('LOGO', () => {
  it('contains CORVUS text', () => {
    const stripped = strip(LOGO)
    expect(stripped).toContain('╔═╗╔═╗╦═╗╦')
    expect(stripped).toContain('╚═╝╚═╝╩╚═')
  })
})
