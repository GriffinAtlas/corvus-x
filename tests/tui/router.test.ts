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

    it('parses hooks with topic', () => {
      expect(parseInput('hooks typescript CLI')).toEqual({
        type: 'command',
        command: 'hooks',
        args: { topic: 'typescript CLI' },
      })
    })

    it('parses profile with @handle', () => {
      expect(parseInput('profile @elonmusk')).toEqual({
        type: 'command',
        command: 'profile',
        args: { username: 'elonmusk' },
      })
    })

    it('parses profile without @ prefix', () => {
      expect(parseInput('profile elonmusk')).toEqual({
        type: 'command',
        command: 'profile',
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

    it('parses agent with question', () => {
      expect(parseInput('agent what is the discourse on AI')).toEqual({
        type: 'command',
        command: 'agent',
        args: { question: 'what is the discourse on AI' },
      })
    })

    it('returns error for agent without question', () => {
      expect(parseInput('agent')).toEqual({
        type: 'error',
        message: 'Usage: agent <question>',
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

    it('parses /brief', () => {
      expect(parseInput('/brief')).toEqual({ type: 'slash', command: 'brief' })
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

    it('parses /view with ref ID', () => {
      expect(parseInput('/view scan:1')).toEqual({
        type: 'slash',
        command: 'view',
        args: { refId: 'scan:1' },
      })
    })

    it('parses /view with hooks ref ID', () => {
      expect(parseInput('/view hooks:3')).toEqual({
        type: 'slash',
        command: 'view',
        args: { refId: 'hooks:3' },
      })
    })

    it('parses /view with ask ref ID', () => {
      expect(parseInput('/view ask:5')).toEqual({
        type: 'slash',
        command: 'view',
        args: { refId: 'ask:5' },
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

    it('removed commands fall through to natural language', () => {
      // gather, read, scope are no longer recognized — they become ask queries
      expect(parseInput('gather DeFi')).toEqual({
        type: 'command',
        command: 'ask',
        args: { question: 'gather DeFi' },
      })
      expect(parseInput('read 1234')).toEqual({
        type: 'command',
        command: 'ask',
        args: { question: 'read 1234' },
      })
      expect(parseInput('scope elonmusk')).toEqual({
        type: 'command',
        command: 'ask',
        args: { question: 'scope elonmusk' },
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

    it('returns error for profile without username', () => {
      expect(parseInput('profile')).toEqual({
        type: 'error',
        message: 'Usage: profile <@username>',
      })
    })

    it('is case-insensitive for commands', () => {
      expect(parseInput('SCAN bitcoin')).toEqual({
        type: 'command',
        command: 'scan',
        args: { topic: 'bitcoin' },
      })
    })

    it('profile is case-insensitive', () => {
      expect(parseInput('PROFILE alice')).toEqual({
        type: 'command',
        command: 'profile',
        args: { username: 'alice' },
      })
    })

    it('profile strips @ from handle', () => {
      expect(parseInput('profile @alice')).toEqual({
        type: 'command',
        command: 'profile',
        args: { username: 'alice' },
      })
    })

    it('profile handles username with underscores and numbers', () => {
      expect(parseInput('profile alice_123')).toEqual({
        type: 'command',
        command: 'profile',
        args: { username: 'alice_123' },
      })
    })

    it('profile preserves multi-word input after keyword as username', () => {
      // "profile some user" — rest is "some user", treated as username
      const result = parseInput('profile some user')
      expect(result).toEqual({
        type: 'command',
        command: 'profile',
        args: { username: 'some user' },
      })
    })
  })
})
