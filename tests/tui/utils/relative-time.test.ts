import { describe, it, expect } from 'vitest'
import { relativeTime } from '../../../src/tui/utils/relative-time.js'

describe('relativeTime', () => {
  it('formats seconds ago', () => {
    expect(relativeTime(Date.now() - 30_000)).toBe('30s ago')
  })

  it('formats minutes ago', () => {
    expect(relativeTime(Date.now() - 5 * 60_000)).toBe('5m ago')
  })

  it('formats hours ago', () => {
    expect(relativeTime(Date.now() - 3 * 3_600_000)).toBe('3h ago')
  })

  it('formats days ago', () => {
    expect(relativeTime(Date.now() - 2 * 86_400_000)).toBe('2d ago')
  })

  it('formats weeks ago', () => {
    expect(relativeTime(Date.now() - 14 * 86_400_000)).toBe('2w ago')
  })

  it('handles future timestamps gracefully', () => {
    expect(relativeTime(Date.now() + 10_000)).toBe('just now')
  })
})
