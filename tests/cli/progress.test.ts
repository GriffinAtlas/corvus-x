import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock isTTY to false before importing
vi.mock('../../src/cli/theme.js', async () => {
  const actual = await vi.importActual('../../src/cli/theme.js')
  return { ...(actual as object), isTTY: false }
})

import { StepProgress } from '../../src/cli/progress.js'
import { strip } from '../../src/cli/theme.js'

describe('StepProgress', () => {
  let logs: string[]
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logs = []
    consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('constructor initializes steps as pending', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }, { label: 'pulse · bitcoin' }])
    progress.render()

    const output = logs.map(strip).join('\n')
    expect(output).toContain('scan · bitcoin')
    expect(output).toContain('pulse · bitcoin')
    expect(output).toContain('○')
  })

  it('start sets step to running', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    progress.start(0)

    const output = logs.map(strip).join('\n')
    expect(output).toContain('scan · bitcoin')
    progress.cleanup()
  })

  it('complete sets step to done with duration', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    progress.render()
    logs.length = 0

    progress.complete(0, 1500)

    const output = logs.map(strip).join('\n')
    expect(output).toContain('✓')
    expect(output).toContain('1.5s')
  })

  it('fail sets step to failed', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    progress.render()
    logs.length = 0

    progress.fail(0)

    const output = logs.map(strip).join('\n')
    expect(output).toContain('✗')
  })

  it('skip sets step to skipped', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    progress.render()
    logs.length = 0

    progress.skip(0, 'budget exceeded')

    const output = logs.map(strip).join('\n')
    expect(output).toContain('budget exceeded')
  })

  it('addStep appends a new step', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    // addStep before first render so all steps appear in initial output
    progress.addStep('new step', 'lead')

    // The initial render from addStep prints all steps
    const output = logs.map(strip).join('\n')
    expect(output).toContain('new step')
  })

  it('out-of-bounds start is ignored', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    expect(() => progress.start(-1)).not.toThrow()
    expect(() => progress.start(999)).not.toThrow()
    progress.cleanup()
  })

  it('out-of-bounds complete is ignored', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    expect(() => progress.complete(-1, 100)).not.toThrow()
    expect(() => progress.complete(999, 100)).not.toThrow()
  })

  it('out-of-bounds fail is ignored', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    expect(() => progress.fail(-1)).not.toThrow()
    expect(() => progress.fail(999)).not.toThrow()
  })

  it('out-of-bounds skip is ignored', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    expect(() => progress.skip(-1)).not.toThrow()
    expect(() => progress.skip(999)).not.toThrow()
  })

  it('cleanup clears spinner timer', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    progress.start(0)
    expect(() => progress.cleanup()).not.toThrow()
  })

  it('cleanup with no timer does not throw', () => {
    const progress = new StepProgress([{ label: 'scan · bitcoin' }])
    expect(() => progress.cleanup()).not.toThrow()
  })

  it('renders tag labels', () => {
    const progress = new StepProgress([
      { label: 'step one', tag: 'lead' },
      { label: 'step two', tag: 'replan' },
    ])
    progress.render()

    const output = logs.map(strip).join('\n')
    expect(output).toContain('(lead)')
    expect(output).toContain('(replan)')
  })
})
