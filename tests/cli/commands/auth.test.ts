import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerAuthCommand, validateGrokKey } from '../../../src/cli/commands/auth.js'

describe('validateGrokKey', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns "valid" when API responds 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    expect(await validateGrokKey('xai-good-key')).toBe('valid')
  })

  it('returns "invalid" when API responds 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }))
    expect(await validateGrokKey('xai-bad-key')).toBe('invalid')
  })

  it('returns "invalid" when API responds 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Forbidden', { status: 403 }))
    expect(await validateGrokKey('xai-forbidden-key')).toBe('invalid')
  })

  it('returns "unknown" on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await validateGrokKey('xai-any-key')).toBe('unknown')
  })

  it('returns "unknown" on non-auth HTTP error (e.g. 500)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Internal Error', { status: 500 }))
    expect(await validateGrokKey('xai-any-key')).toBe('unknown')
  })

  it('returns "unknown" on timeout (abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('AbortError')), 50)),
    )
    expect(await validateGrokKey('xai-any-key')).toBe('unknown')
  })

  it('sends correct Authorization header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    await validateGrokKey('xai-test-123')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.x.ai/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer xai-test-123' },
      }),
    )
  })
})

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
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', '')

    await program.parseAsync(['node', 'corvus', 'auth', 'status'])

    expect(logs.some((l) => l.includes('Grok API:') && l.includes('✓ configured'))).toBe(true)
    expect(logs.some((l) => l.includes('X API:') && l.includes('✗ not set'))).toBe(true)
  })
})

describe('formatPostSetupHints', () => {
  it('includes Windows credentials warning on win32', async () => {
    const { formatPostSetupHints } = await import('../../../src/cli/commands/auth.js')
    const lines = formatPostSetupHints('win32')
    const joined = lines.join('\n')
    expect(joined).toMatch(/credentials\.json/i)
    expect(joined).toMatch(/Windows/i)
  })

  it('omits Windows warning on non-win32 platforms', async () => {
    const { formatPostSetupHints } = await import('../../../src/cli/commands/auth.js')
    const linuxLines = formatPostSetupHints('linux')
    const darwinLines = formatPostSetupHints('darwin')
    expect(linuxLines.join('\n')).not.toMatch(/credentials\.json/i)
    expect(darwinLines.join('\n')).not.toMatch(/credentials\.json/i)
  })

  it('points the user at corvus grow as the next step on every platform', async () => {
    const { formatPostSetupHints } = await import('../../../src/cli/commands/auth.js')
    expect(formatPostSetupHints('win32').join('\n')).toContain('corvus grow')
    expect(formatPostSetupHints('linux').join('\n')).toContain('corvus grow')
    expect(formatPostSetupHints('darwin').join('\n')).toContain('corvus grow')
  })

  it('does not mention "corvus ask" as the next step', async () => {
    const { formatPostSetupHints } = await import('../../../src/cli/commands/auth.js')
    expect(formatPostSetupHints('linux').join('\n')).not.toContain('corvus ask')
    expect(formatPostSetupHints('win32').join('\n')).not.toContain('corvus ask')
  })
})
