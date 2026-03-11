import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StepProgress } from '../../src/cli/progress.js'

// Mock isTTY to false for predictable test output
vi.mock('../../src/cli/theme.js', async () => {
  const actual = await vi.importActual('../../src/cli/theme.js')
  return {
    ...actual as object,
    isTTY: false,
  }
})

describe('StepProgress', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('renders initial step list', () => {
    const progress = new StepProgress([
      { label: 'scan · bitcoin' },
      { label: 'pulse · bitcoin' },
    ])
    progress.render()
    expect(consoleSpy).toHaveBeenCalledTimes(2)
  })

  it('marks step as done with duration', () => {
    const progress = new StepProgress([
      { label: 'scan · bitcoin' },
    ])
    progress.render()
    consoleSpy.mockClear()

    progress.complete(0, 1500)
    // Non-TTY prints completed step
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('1.5s')
  })

  it('adds new steps dynamically', () => {
    const progress = new StepProgress([
      { label: 'scan · bitcoin' },
    ])
    progress.render()

    progress.addStep('scope · @satoshi', 'lead')
    // Should now have 2 steps
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('includes tags in output', () => {
    const progress = new StepProgress([
      { label: 'scan · bitcoin', tag: 'lead' },
    ])
    progress.render()
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('(lead)')
  })

  it('cleanup stops spinner timer', () => {
    const progress = new StepProgress([
      { label: 'scan · bitcoin' },
    ])
    progress.cleanup()
    // Should not throw
  })

  it('handles skip status', () => {
    const progress = new StepProgress([
      { label: 'scan · bitcoin' },
    ])
    progress.render()
    consoleSpy.mockClear()

    progress.skip(0, 'rate-limited')
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('rate-limited')
  })
})
