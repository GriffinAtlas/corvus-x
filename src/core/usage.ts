export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  toolCalls: number
}

export class UsageTracker {
  private turns: TokenUsage[] = []
  private cumulative: TokenUsage = { inputTokens: 0, outputTokens: 0, toolCalls: 0 }

  record(usage: TokenUsage): void {
    this.turns.push(usage)
    this.cumulative.inputTokens += usage.inputTokens
    this.cumulative.outputTokens += usage.outputTokens
    this.cumulative.toolCalls += usage.toolCalls
  }

  get turnCount(): number {
    return this.turns.length
  }

  get totalTokens(): number {
    return this.cumulative.inputTokens + this.cumulative.outputTokens
  }

  get totalInputTokens(): number {
    return this.cumulative.inputTokens
  }

  get totalOutputTokens(): number {
    return this.cumulative.outputTokens
  }

  get totalToolCalls(): number {
    return this.cumulative.toolCalls
  }

  latestTurn(): TokenUsage | null {
    return this.turns.length > 0 ? this.turns[this.turns.length - 1] : null
  }

  allTurns(): readonly TokenUsage[] {
    return this.turns
  }

  toSummary(): string {
    const total = this.totalTokens
    if (total === 0) return '0 tokens'
    if (total < 1000) return `${total} tokens`
    return `${(total / 1000).toFixed(1)}K tokens`
  }
}
