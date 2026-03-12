import { describe, it, expect } from 'vitest'
import { parseInput } from '../../src/tui/router.js'

describe('parseInput', () => {
  describe('explicit commands', () => {
    it('parses scan with topic', () => {
      expect(parseInput('scan AI agents')).toEqual({
        type: 'command',
        command: 'scan',
        args: { topic: 'AI agents' },
      })
    })

    it('parses pulse with topic', () => {
      expect(parseInput('pulse crypto')).toEqual({
        type: 'command',
        command: 'pulse',
        args: { topic: 'crypto' },
      })
    })

    it('parses trace with topic', () => {
      expect(parseInput('trace lab leak narrative')).toEqual({
        type: 'command',
        command: 'trace',
        args: { topic: 'lab leak narrative' },
      })
    })

    it('parses gather with topic', () => {
      expect(parseInput('gather DeFi regulation')).toEqual({
        type: 'command',
        command: 'gather',
        args: { topic: 'DeFi regulation' },
      })
    })

    it('parses read with tweet ID', () => {
      expect(parseInput('read 1234567890')).toEqual({
        type: 'command',
        command: 'read',
        args: { tweetIdOrUrl: '1234567890' },
      })
    })

    it('parses read with URL', () => {
      expect(parseInput('read https://x.com/user/status/123')).toEqual({
        type: 'command',
        command: 'read',
        args: { tweetIdOrUrl: 'https://x.com/user/status/123' },
      })
    })

    it('parses scope with @handle', () => {
      expect(parseInput('scope @elonmusk')).toEqual({
        type: 'command',
        command: 'scope',
        args: { username: 'elonmusk' },
      })
    })

    it('parses scope without @ prefix', () => {
      expect(parseInput('scope elonmusk')).toEqual({
        type: 'command',
        command: 'scope',
        args: { username: 'elonmusk' },
      })
    })

    it('parses ask with question', () => {
      expect(parseInput('ask why is AI booming')).toEqual({
        type: 'command',
        command: 'ask',
        args: { question: 'why is AI booming' },
      })
    })

    it('parses history', () => {
      expect(parseInput('history')).toEqual({
        type: 'command',
        command: 'history',
        args: {},
      })
    })
  })

  describe('slash commands', () => {
    it('parses /help', () => {
      expect(parseInput('/help')).toEqual({ type: 'slash', command: 'help' })
    })

    it('parses /cost', () => {
      expect(parseInput('/cost')).toEqual({ type: 'slash', command: 'cost' })
    })

    it('parses /history', () => {
      expect(parseInput('/history')).toEqual({ type: 'slash', command: 'history' })
    })

    it('parses /clear', () => {
      expect(parseInput('/clear')).toEqual({ type: 'slash', command: 'clear' })
    })

    it('parses /exit', () => {
      expect(parseInput('/exit')).toEqual({ type: 'slash', command: 'exit' })
    })

    it('returns error for unknown slash command', () => {
      expect(parseInput('/foo')).toEqual({
        type: 'error',
        message: 'Unknown command: /foo. Type /help for available commands.',
      })
    })
  })

  describe('/view command', () => {
    it('parses /view 1', () => {
      expect(parseInput('/view 1')).toEqual({
        type: 'slash',
        command: 'view',
        args: { index: '1' },
      })
    })

    it('parses /view 42', () => {
      expect(parseInput('/view 42')).toEqual({
        type: 'slash',
        command: 'view',
        args: { index: '42' },
      })
    })

    it('returns error for /view 0', () => {
      const result = parseInput('/view 0')
      expect(result.type).toBe('error')
    })

    it('returns error for /view -1', () => {
      const result = parseInput('/view -1')
      expect(result.type).toBe('error')
    })

    it('returns error for /view abc', () => {
      const result = parseInput('/view abc')
      expect(result.type).toBe('error')
    })

    it('returns error for /view without argument', () => {
      const result = parseInput('/view')
      expect(result.type).toBe('error')
    })

    it('trims whitespace around number', () => {
      expect(parseInput('/view   3  ')).toEqual({
        type: 'slash',
        command: 'view',
        args: { index: '3' },
      })
    })
  })

  describe('edge cases', () => {
    it('treats /view 1.9 as /view 1 (parseInt behavior)', () => {
      expect(parseInput('/view 1.9')).toEqual({
        type: 'slash',
        command: 'view',
        args: { index: '1' },
      })
    })

    it('returns error for ask without question', () => {
      expect(parseInput('ask')).toEqual({
        type: 'error',
        message: 'Usage: ask <question>',
      })
    })

    it('returns error for pulse without topic', () => {
      expect(parseInput('pulse')).toEqual({
        type: 'error',
        message: 'Usage: pulse <topic>',
      })
    })

    it('returns error for trace without topic', () => {
      expect(parseInput('trace')).toEqual({
        type: 'error',
        message: 'Usage: trace <topic>',
      })
    })

    it('returns error for gather without topic', () => {
      expect(parseInput('gather')).toEqual({
        type: 'error',
        message: 'Usage: gather <topic>',
      })
    })

    it('slash commands are case-insensitive', () => {
      expect(parseInput('/HELP')).toEqual({ type: 'slash', command: 'help' })
      expect(parseInput('/EXIT')).toEqual({ type: 'slash', command: 'exit' })
    })

    it('returns error for /view with non-numeric text', () => {
      const result = parseInput('/view /help')
      expect(result.type).toBe('error')
    })
  })

  describe('natural language fallback', () => {
    it('treats unrecognized input as ask', () => {
      expect(parseInput('why is bitcoin pumping')).toEqual({
        type: 'command',
        command: 'ask',
        args: { question: 'why is bitcoin pumping' },
      })
    })
  })

  describe('validation', () => {
    it('returns error for empty input', () => {
      expect(parseInput('')).toEqual({ type: 'empty' })
    })

    it('returns error for whitespace-only input', () => {
      expect(parseInput('   ')).toEqual({ type: 'empty' })
    })

    it('returns error for scan without topic', () => {
      expect(parseInput('scan')).toEqual({
        type: 'error',
        message: 'Usage: scan <topic>',
      })
    })

    it('returns error for read without argument', () => {
      expect(parseInput('read')).toEqual({
        type: 'error',
        message: 'Usage: read <tweet-id-or-url>',
      })
    })

    it('returns error for scope without username', () => {
      expect(parseInput('scope')).toEqual({
        type: 'error',
        message: 'Usage: scope <@username>',
      })
    })

    it('is case-insensitive for commands', () => {
      expect(parseInput('SCAN bitcoin')).toEqual({
        type: 'command',
        command: 'scan',
        args: { topic: 'bitcoin' },
      })
    })
  })
})
