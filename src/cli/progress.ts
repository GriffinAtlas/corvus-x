import { t, isTTY, strip } from './theme.js'

interface StepEntry {
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  tag?: string
  durationMs?: number
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export class StepProgress {
  private steps: StepEntry[]
  private rendered = false
  private spinnerFrame = 0
  private spinnerTimer: ReturnType<typeof setInterval> | null = null

  constructor(steps: { label: string; tag?: string }[]) {
    this.steps = steps.map((s) => ({ label: s.label, status: 'pending' as const, tag: s.tag }))
  }

  start(index: number): void {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].status = 'running'
      if (isTTY && !this.spinnerTimer) {
        this.spinnerTimer = setInterval(() => {
          this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length
          this.render()
        }, 80)
      }
      this.render()
    }
  }

  complete(index: number, durationMs: number): void {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].status = 'done'
      this.steps[index].durationMs = durationMs
      this.stopSpinnerIfIdle()
      this.render()
    }
  }

  fail(index: number): void {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].status = 'failed'
      this.stopSpinnerIfIdle()
      this.render()
    }
  }

  skip(index: number, reason?: string): void {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].status = 'skipped'
      if (reason) this.steps[index].tag = reason
      this.stopSpinnerIfIdle()
      this.render()
    }
  }

  addStep(label: string, tag: string): void {
    this.steps.push({ label, status: 'pending', tag })
    this.render()
  }

  cleanup(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer)
      this.spinnerTimer = null
    }
  }

  render(): void {
    const total = this.steps.length
    const lines = this.steps.map((step, i) => {
      const num = `[${i + 1}/${total}]`
      const tag = step.tag ? ` ${this.renderTag(step.tag)}` : ''

      let statusStr: string
      let durationStr = ''

      switch (step.status) {
        case 'pending':
          statusStr = t.muted('○')
          break
        case 'running':
          statusStr = t.accent(SPINNER_FRAMES[this.spinnerFrame])
          break
        case 'done':
          statusStr = t.positive('✓')
          if (step.durationMs !== undefined) {
            durationStr = ' ' + t.muted(`${(step.durationMs / 1000).toFixed(1)}s`)
          }
          break
        case 'failed':
          statusStr = t.negative('✗')
          break
        case 'skipped':
          statusStr = t.warning('○')
          break
      }

      return `  ${t.muted(num)} ${step.label}${tag}  ${statusStr}${durationStr}`
    })

    if (isTTY) {
      if (this.rendered) {
        process.stdout.write(`\x1b[${this.steps.length}A`)
      }
      for (const line of lines) {
        const stripped = strip(line)
        const padding = Math.max(0, (process.stdout.columns ?? 80) - stripped.length)
        process.stdout.write(line + ' '.repeat(padding) + '\n')
      }
      this.rendered = true
    } else {
      if (!this.rendered) {
        for (const line of lines) {
          console.log(strip(line))
        }
        this.rendered = true
      } else {
        const last = this.steps.findIndex(
          (s) => s.status === 'done' || s.status === 'failed' || s.status === 'skipped',
        )
        if (last >= 0) {
          const step = this.steps[last]
          if (step.status !== 'pending' && step.status !== 'running') {
            const line = lines[last]
            console.log(strip(line))
          }
        }
      }
    }
  }

  private renderTag(tag: string): string {
    if (tag === 'lead') return t.accent('(lead)')
    if (tag === 'replan') return t.warning('(replan)')
    if (tag === 'rate-limited') return t.warning('(rate-limited)')
    return t.muted(`(${tag})`)
  }

  private stopSpinnerIfIdle(): void {
    const hasRunning = this.steps.some((s) => s.status === 'running')
    if (!hasRunning && this.spinnerTimer) {
      clearInterval(this.spinnerTimer)
      this.spinnerTimer = null
    }
  }
}
