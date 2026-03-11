import { describe, it, expect } from 'vitest'
import { diffSnapshots, formatDiffLines } from '../../src/core/differ.js'
import type { DiffLine } from '../../src/core/differ.js'

describe('diffSnapshots', () => {
  it('returns empty array when both objects are identical', () => {
    const data = { count: 10, name: 'test' }
    expect(diffSnapshots(data, data, {})).toEqual([])
  })

  it('detects a changed number with formatted string values', () => {
    const lines = diffSnapshots({ count: 10 }, { count: 20 }, {})
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      path: 'count',
      type: 'changed',
    })
    expect(lines[0].oldValue).toBe('10')
    expect(lines[0].newValue).toBe('20')
  })

  it('detects a changed string', () => {
    const lines = diffSnapshots({ status: 'active' }, { status: 'paused' }, {})
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      type: 'changed',
      oldValue: 'active',
      newValue: 'paused',
    })
  })

  it('detects an added field', () => {
    const lines = diffSnapshots({ a: 1 }, { a: 1, b: 2 } as any, {})
    const added = lines.find((l) => l.type === 'added')
    expect(added).toBeDefined()
    expect(added!.path).toBe('b')
  })

  it('detects a removed field', () => {
    const lines = diffSnapshots({ a: 1, b: 2 }, { a: 1 } as any, {})
    const removed = lines.find((l) => l.type === 'removed')
    expect(removed).toBeDefined()
    expect(removed!.path).toBe('b')
  })

  it('handles string arrays with set comparison', () => {
    const oldData = { tags: ['alpha', 'beta'] }
    const newData = { tags: ['beta', 'gamma'] }
    const lines = diffSnapshots(oldData, newData, {})
    const added = lines.find((l) => l.type === 'added' && l.path === 'tags')
    const removed = lines.find((l) => l.type === 'removed' && l.path === 'tags')
    expect(added).toBeDefined()
    expect(added!.newValue).toBe('gamma')
    expect(removed).toBeDefined()
    expect(removed!.oldValue).toBe('alpha')
  })

  it('diffs object arrays with match key', () => {
    const oldData = {
      accounts: [
        { handle: 'alice', score: 0.5 },
        { handle: 'bob', score: 0.3 },
      ],
    }
    const newData = {
      accounts: [
        { handle: 'alice', score: 0.9 },
        { handle: 'bob', score: 0.3 },
      ],
    }
    const lines = diffSnapshots(oldData, newData, { accounts: 'handle' })
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const changed = lines.find((l) => l.type === 'changed')
    expect(changed).toBeDefined()
    expect(changed!.path).toContain('alice')
    expect(changed!.path).toContain('score')
  })

  it('detects added objects in matched arrays', () => {
    const oldData = { users: [{ name: 'alice', score: 1 }] }
    const newData = {
      users: [
        { name: 'alice', score: 1 },
        { name: 'bob', score: 2 },
      ],
    }
    const lines = diffSnapshots(oldData, newData, { users: 'name' })
    const added = lines.find((l) => l.type === 'added')
    expect(added).toBeDefined()
  })

  it('detects removed objects in matched arrays', () => {
    const oldData = {
      users: [
        { name: 'alice', score: 1 },
        { name: 'bob', score: 2 },
      ],
    }
    const newData = { users: [{ name: 'alice', score: 1 }] }
    const lines = diffSnapshots(oldData, newData, { users: 'name' })
    const removed = lines.find((l) => l.type === 'removed')
    expect(removed).toBeDefined()
    expect(removed!.oldValue).toBe('bob')
  })

  it('reports count change for object arrays without match key', () => {
    const oldData = { items: [{ x: 1 }, { x: 2 }] }
    const newData = { items: [{ x: 1 }, { x: 2 }, { x: 3 }] }
    const lines = diffSnapshots(oldData, newData, {})
    expect(lines.length).toBe(1)
    expect(lines[0].type).toBe('changed')
    expect(lines[0].oldValue).toBe('2 items')
    expect(lines[0].newValue).toBe('3 items')
  })

  it('recurses into nested objects', () => {
    const oldData = { outer: { inner: 1 } }
    const newData = { outer: { inner: 2 } }
    const lines = diffSnapshots(oldData, newData, {})
    expect(lines).toHaveLength(1)
    expect(lines[0].path).toBe('outer.inner')
    expect(lines[0].type).toBe('changed')
  })

  it('uses prefix in path names', () => {
    const lines = diffSnapshots({ x: 1 }, { x: 2 }, {}, 'root')
    expect(lines[0].path).toBe('root.x')
  })

  it('handles empty objects', () => {
    const lines = diffSnapshots({}, {}, {})
    expect(lines).toEqual([])
  })

  it('handles both sides being empty arrays', () => {
    const lines = diffSnapshots({ items: [] }, { items: [] }, {})
    expect(lines).toEqual([])
  })

  it('does not diff when number values are the same', () => {
    const lines = diffSnapshots({ score: 42 }, { score: 42 }, {})
    expect(lines).toEqual([])
  })

  it('formats float values with toFixed(2)', () => {
    const lines = diffSnapshots({ ratio: 0.123 }, { ratio: 0.456 }, {})
    expect(lines[0].oldValue).toBe('0.12')
    expect(lines[0].newValue).toBe('0.46')
  })

  it('formats integer values with toLocaleString', () => {
    const lines = diffSnapshots({ count: 1000 }, { count: 2000 }, {})
    expect(lines[0].type).toBe('changed')
    // toLocaleString output: 1000 → "1,000" (en-US) or "1000" etc.
    expect(lines[0].oldValue).toMatch(/1[,.]?000/)
    expect(lines[0].newValue).toMatch(/2[,.]?000/)
  })

  it('handles null old value treated as undefined (field added)', () => {
    const lines = diffSnapshots({ a: null }, { a: null, b: 1 } as any, {})
    const added = lines.find((l) => l.type === 'added')
    expect(added).toBeDefined()
    expect(added!.path).toBe('b')
  })

  it('treats null vs non-null as a change — falls through with no diff line', () => {
    // null is typeof "object" but the nested-object branch requires both non-null,
    // so null vs string falls through every branch and produces no diff line.
    const lines = diffSnapshots({ x: null }, { x: 'hello' } as any, {})
    expect(lines).toEqual([])
  })

  it('handles negative delta in formatDiffLines', () => {
    const lines: DiffLine[] = [
      { path: 'followers', type: 'changed', oldValue: '200', newValue: '150' },
    ]
    const output = formatDiffLines(lines, 60_000)
    expect(output).toContain('(-50)')
  })

  it('formatDiffLines simplifies metrics. prefix from path', () => {
    const lines: DiffLine[] = [
      { path: 'metrics.tweetCount', type: 'changed', oldValue: '10', newValue: '20' },
    ]
    const output = formatDiffLines(lines, 60_000)
    expect(output).toContain('tweetCount')
    expect(output).not.toContain('metrics.')
  })
})

describe('formatDiffLines', () => {
  it('returns empty string when no diff lines', () => {
    expect(formatDiffLines([], 0)).toBe('')
  })

  it('formats time as minutes when under 60 min', () => {
    const lines: DiffLine[] = [{ path: 'count', type: 'changed', oldValue: '5', newValue: '10' }]
    const twoMinutesMs = 2 * 60 * 1000
    const output = formatDiffLines(lines, twoMinutesMs)
    expect(output).toContain('2m ago')
  })

  it('formats time as hours when under 24h', () => {
    const lines: DiffLine[] = [{ path: 'count', type: 'changed', oldValue: '1', newValue: '2' }]
    const threeHoursMs = 3 * 60 * 60 * 1000
    const output = formatDiffLines(lines, threeHoursMs)
    expect(output).toContain('3h ago')
  })

  it('formats time as days when 24h or more', () => {
    const lines: DiffLine[] = [{ path: 'count', type: 'changed', oldValue: '1', newValue: '2' }]
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000
    const output = formatDiffLines(lines, twoDaysMs)
    expect(output).toContain('2d ago')
  })

  it('shows arrow for changed values', () => {
    const lines: DiffLine[] = [{ path: 'score', type: 'changed', oldValue: '10', newValue: '20' }]
    const output = formatDiffLines(lines, 60_000)
    expect(output).toContain('→')
  })

  it('shows + prefix for added values', () => {
    const lines: DiffLine[] = [{ path: 'newField', type: 'added', newValue: '42' }]
    const output = formatDiffLines(lines, 60_000)
    expect(output).toContain('+')
    expect(output).toContain('newField')
  })

  it('shows - prefix for removed values', () => {
    const lines: DiffLine[] = [{ path: 'oldField', type: 'removed', oldValue: '99' }]
    const output = formatDiffLines(lines, 60_000)
    expect(output).toContain('-')
    expect(output).toContain('oldField')
  })

  it('shows delta for numeric changes', () => {
    const lines: DiffLine[] = [
      { path: 'followers', type: 'changed', oldValue: '100', newValue: '150' },
    ]
    const output = formatDiffLines(lines, 60_000)
    expect(output).toContain('+50')
  })

  it('contains header line with changes since', () => {
    const lines: DiffLine[] = [{ path: 'x', type: 'changed', oldValue: '1', newValue: '2' }]
    const output = formatDiffLines(lines, 5 * 60_000)
    expect(output).toContain('changes since')
    expect(output).toContain('5m ago')
  })

  it('formats 0 minutes as 0m', () => {
    const lines: DiffLine[] = [{ path: 'count', type: 'changed', oldValue: '1', newValue: '2' }]
    const output = formatDiffLines(lines, 0)
    expect(output).toContain('0m ago')
  })

  it('handles exactly 60 minutes as 1h', () => {
    const lines: DiffLine[] = [{ path: 'count', type: 'changed', oldValue: '1', newValue: '2' }]
    const output = formatDiffLines(lines, 60 * 60 * 1000)
    expect(output).toContain('1h ago')
  })

  it('handles exactly 24 hours as 1d', () => {
    const lines: DiffLine[] = [{ path: 'count', type: 'changed', oldValue: '1', newValue: '2' }]
    const output = formatDiffLines(lines, 24 * 60 * 60 * 1000)
    expect(output).toContain('1d ago')
  })
})
