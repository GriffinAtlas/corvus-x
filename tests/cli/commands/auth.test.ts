import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerAuthCommand } from '../../../src/cli/commands/auth.js'

describe('registerAuthCommand', () => {
  let program: Command
  let logs: string[]

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    registerAuthCommand(program)

    logs = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('registers auth command with setup and status subcommands', () => {
    const auth = program.commands.find((c) => c.name() === 'auth')
    expect(auth).toBeDefined()

    const subNames = auth!.commands.map((c) => c.name())
    expect(subNames).toContain('setup')
    expect(subNames).toContain('status')
  })

  it('auth status shows unconfigured state when no keys', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', '')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', '')
    await program.parseAsync(['node', 'corvus', 'auth', 'status'])

    expect(logs.some((l) => l.includes('corvus auth status'))).toBe(true)
    expect(logs.some((l) => l.includes('Grok API:') && l.includes('✗ not set'))).toBe(true)
    expect(logs.some((l) => l.includes('X API:') && l.includes('✗ not set'))).toBe(true)
  })

  it('auth status shows configured state when env vars set', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'test-token')

    await program.parseAsync(['node', 'corvus', 'auth', 'status'])

    expect(logs.some((l) => l.includes('Grok API:') && l.includes('✓ configured'))).toBe(true)
    expect(logs.some((l) => l.includes('X API:') && l.includes('✓ configured'))).toBe(true)
  })

  it('auth status shows mixed state — grok set, x not set', async () => {
    vi.stubEnv('CORVUS_GROK_KEY', 'test-key')

    await program.parseAsync(['node', 'corvus', 'auth', 'status'])

    expect(logs.some((l) => l.includes('Grok API:') && l.includes('✓ configured'))).toBe(true)
    expect(logs.some((l) => l.includes('X API:') && l.includes('✗ not set'))).toBe(true)
  })
})
