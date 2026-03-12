import type { GrokAdapter } from './grok-adapter.js'
import type { Tweet } from './x-adapter.js'
import type {
  Snapshot,
  GrokTweetScore,
  AgentBrief,
  ScanSnapshot,
  PulseSnapshot,
} from './schemas.js'
import type { BuildResult, CorvusDeps, GrokCitation } from './types.js'
import { parseGrokJson } from './grok-adapter.js'
import { computeConfidence, detectContradictions } from './metrics.js'
import { SnapshotStore } from './snapshots.js'
import { ConfigManager } from '../infra/config.js'

export interface AgentPlan {
  goal: string
  steps: AgentStep[]
}

export interface AgentStep {
  command: 'scan' | 'pulse' | 'trace' | 'gather' | 'read' | 'scope'
  args: {
    topic?: string
    username?: string
    tweetId?: string
    count?: number
  }
  reasoning: string
}

export interface AgentContext {
  goal: string
  question: string
  results: AgentStepResult[]
  totalCost: number
  leads: string[]
}

export interface AgentStepResult {
  step: AgentStep
  command: string
  snapshot: Snapshot
  cost: number
  durationMs: number
  tweets: Tweet[]
  scores: GrokTweetScore[]
  newestTweetAt: number | null
  citations: GrokCitation[]
}

export type ReplanDecision = { action: 'continue' } | { action: 'revise'; steps: AgentStep[] }

export interface AgentOptions {
  maxSteps: number
  budget: number
  replan: boolean
  onStepStart?: (index: number, step: AgentStep) => void
  onStepComplete?: (index: number, step: AgentStep, durationMs: number) => void
  onStepFail?: (index: number, step: AgentStep, error: Error) => void
  onStepSkip?: (index: number, step: AgentStep, reason: string) => void
  onReplan?: (newSteps: AgentStep[]) => void
  onLeadFound?: (label: string, tag: string) => void
}

const PLANNER_SYSTEM_PROMPT = `You are a planning engine for an X intelligence CLI. Given a user's question,
produce a JSON execution plan using only these commands:

- scan <topic> — discourse landscape, narratives, sentiment (default 50 tweets)
- pulse <topic> — sentiment momentum, bull/bear signals, key voices
- trace <narrative> — track how a narrative spread, origin, mutations
- gather <topic> — deep analysis combining X data and web context
- read <tweet-id> — analyze a specific tweet
- scope <username> — profile analysis of an X account

Rules:
- Return ONLY valid JSON matching this schema: { "goal": "string", "steps": [{ "command": "scan|pulse|trace|gather|read|scope", "args": { "topic?": "string", "username?": "string", "tweetId?": "string", "count?": number }, "reasoning": "string" }] }
- Maximum 8 steps.
- Start broad (scan or pulse), then narrow (scope, read, trace).
- Include reasoning for each step — one sentence explaining why.
- Do not include steps that duplicate information.
- If the question names specific accounts, include scope steps for them.
- If the question is about a narrative or claim, include a trace step.`

const REPLAN_SYSTEM_PROMPT = `You are adjusting an investigation plan. Review what has been found so far and decide whether the remaining plan should change.

Return JSON:
- { "action": "continue" } to proceed as planned
- { "action": "revise", "steps": [...] } to replace remaining steps with new ones

Rules:
- Maximum 3 additional steps beyond the original plan.
- Only add scope/read steps for discovered leads — do not repeat scan/pulse.
- If the data is sufficient, you may remove remaining steps.
- Return ONLY valid JSON.`

const SYNTHESIZER_SYSTEM_PROMPT = `You are a senior intelligence analyst writing a wire note.
Synthesize the following investigation results into a brief.

Rules:
- signalLine: one sentence. The conclusion. No hedging, no "it appears."
- summary: 3-7 bullets. Lead with the most important finding.
- contradictions: flag any inconsistencies between data sources. Be specific.
  Example: "Scan consensus bearish (-0.41) but pulse detected 2 high-reach accounts with bullish positions and 8.2K combined engagement."
- keyAccounts: the 3-5 most significant voices. Include their stance in 10 words or less.
- evidence: group findings by source command. State what each source showed.
- No first person. No hedging language. No emoji. No markdown.
- Write like Bloomberg, not like a chatbot.
- If data is thin (few tweets, few authors), say so directly.
- Return ONLY valid JSON matching: { "signalLine": "string", "summary": ["string"], "contradictions": ["string"], "keyAccounts": [{ "handle": "string", "reach": number, "sentiment": number, "stance": "string" }], "evidence": [{ "source": "string", "key": "string", "detail": "string" }] }`

export interface PlanResult {
  plan: AgentPlan
  costUsd: number
}

export class AgentPlanner {
  constructor(private grok: GrokAdapter) {}

  async plan(question: string): Promise<PlanResult> {
    const response = await this.grok.query(question, {
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      maxTokens: 2048,
    })

    const plan = parseGrokJson<AgentPlan>(response.text)

    if (!plan.goal || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw new Error('Planner returned an empty or invalid plan')
    }

    const validCommands = new Set(['scan', 'pulse', 'trace', 'gather', 'read', 'scope'])

    return {
      plan: {
        goal: plan.goal,
        steps: plan.steps
          .filter((s) => validCommands.has(s.command))
          .slice(0, 8)
          .map((s) => ({
            command: s.command,
            args: s.args ?? {},
            reasoning: s.reasoning ?? '',
          })),
      },
      costUsd: response.usage.costUsd,
    }
  }
}

type BuildFn = (deps: CorvusDeps, ...args: unknown[]) => Promise<BuildResult<Snapshot>>

async function resolveBuildFn(command: string): Promise<BuildFn> {
  switch (command) {
    case 'scan': {
      const { buildScanSnapshot } = await import('./builders/scan.js')
      return buildScanSnapshot as unknown as BuildFn
    }
    case 'pulse': {
      const { buildPulseSnapshot } = await import('./builders/pulse.js')
      return buildPulseSnapshot as unknown as BuildFn
    }
    case 'trace': {
      const { buildTraceSnapshot } = await import('./builders/trace.js')
      return buildTraceSnapshot as unknown as BuildFn
    }
    case 'gather': {
      const { buildGatherSnapshot } = await import('./builders/gather.js')
      return buildGatherSnapshot as unknown as BuildFn
    }
    case 'read': {
      const { buildReadSnapshot } = await import('./builders/read.js')
      return buildReadSnapshot as unknown as BuildFn
    }
    case 'scope': {
      const { buildScopeSnapshot } = await import('./builders/scope.js')
      return buildScopeSnapshot as unknown as BuildFn
    }
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

function buildArgs(step: AgentStep): unknown[] {
  switch (step.command) {
    case 'scan':
    case 'pulse':
    case 'trace':
    case 'gather':
      return [step.args.topic ?? '', step.args.count ?? 50, 2]
    case 'read':
      return [step.args.tweetId ?? '']
    case 'scope':
      return [step.args.username ?? '', 20]
    default:
      return []
  }
}

function extractLeads(
  snapshot: Snapshot,
  existingLeads: Set<string>,
  plannedTargets: Set<string>,
): string[] {
  const leads: string[] = []

  if ('topAccounts' in snapshot) {
    for (const acct of (snapshot as ScanSnapshot).topAccounts) {
      if (!existingLeads.has(acct.handle) && !plannedTargets.has(acct.handle)) {
        leads.push(acct.handle)
      }
    }
  }

  if ('keyVoices' in snapshot) {
    for (const voice of (snapshot as PulseSnapshot).keyVoices) {
      if (!existingLeads.has(voice.handle) && !plannedTargets.has(voice.handle)) {
        leads.push(voice.handle)
      }
    }
  }

  return leads
}

function summarizeResult(result: AgentStepResult): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = result.snapshot as any
  const parts: string[] = [`${result.command}:`]

  if (typeof snap.sentiment?.avg === 'number') parts.push(`sentiment ${snap.sentiment.avg}`)
  if (typeof snap.metrics?.tweetCount === 'number') parts.push(`${snap.metrics.tweetCount} tweets`)
  if (Array.isArray(snap.signals) && snap.signals.length > 0) {
    parts.push(`signals: ${snap.signals.slice(0, 2).join('; ')}`)
  }
  if (Array.isArray(snap.bullSignals)) {
    parts.push(`bull(${snap.bullSignals.length}) bear(${snap.bearSignals?.length ?? 0})`)
  }

  return parts.join(' | ')
}

const REPLAN_STEPS = new Set([1, 3, 5])
const MAX_REPLANS = 3

export class AgentExecutor {
  private context: AgentContext
  private deps: CorvusDeps
  private options: AgentOptions
  private store: SnapshotStore
  private replanCount = 0
  private aborted = false

  constructor(
    deps: CorvusDeps,
    question: string,
    private plan: AgentPlan,
    options: AgentOptions,
  ) {
    this.deps = deps
    this.options = options
    this.store = new SnapshotStore(ConfigManager.defaultDir())
    this.context = {
      goal: plan.goal,
      question,
      results: [],
      totalCost: 0,
      leads: [],
    }
  }

  abort(): void {
    this.aborted = true
  }

  async execute(planCost: number): Promise<AgentContext> {
    this.context.totalCost = planCost
    let steps = [...this.plan.steps]
    const maxSteps = Math.min(this.options.maxSteps, steps.length)
    steps = steps.slice(0, maxSteps)

    const plannedTargets = new Set<string>()
    for (const step of steps) {
      if (step.args.username) plannedTargets.add(step.args.username)
      if (step.args.topic) plannedTargets.add(step.args.topic)
    }

    let completedCount = 0

    for (let i = 0; i < steps.length; i++) {
      if (this.aborted) break

      const step = steps[i]

      if (this.context.results.length > 0) {
        const avgCost = this.context.totalCost / (this.context.results.length + 1)
        if (this.context.totalCost + avgCost > this.options.budget) {
          this.options.onStepSkip?.(i, step, 'budget exceeded')
          for (let j = i + 1; j < steps.length; j++) {
            this.options.onStepSkip?.(j, steps[j], 'budget exceeded')
          }
          break
        }
      }

      this.options.onStepStart?.(i, step)
      const startTime = Date.now()

      try {
        const buildFn = await resolveBuildFn(step.command)
        const args = buildArgs(step)
        const result = await buildFn(this.deps, ...args)

        const durationMs = Date.now() - startTime
        const topic = step.args.topic ?? step.args.username ?? step.args.tweetId ?? 'unknown'

        this.store.save(step.command, topic, result.data, result.raw, result.cost)

        const stepResult: AgentStepResult = {
          step,
          command: step.command,
          snapshot: result.data,
          cost: result.cost,
          durationMs,
          tweets: result.tweets,
          scores: result.scores,
          newestTweetAt: result.newestTweetAt,
          citations: result.citations,
        }

        this.context.results.push(stepResult)
        this.context.totalCost += result.cost

        const leadSet = new Set(this.context.leads)
        const newLeads = extractLeads(result.data, leadSet, plannedTargets)
        for (const lead of newLeads) {
          this.context.leads.push(lead)
          this.options.onLeadFound?.(`scope · @${lead}`, 'lead')
        }

        this.options.onStepComplete?.(i, step, durationMs)
        completedCount++

        if (
          this.options.replan &&
          REPLAN_STEPS.has(completedCount) &&
          this.replanCount < MAX_REPLANS &&
          i < steps.length - 1
        ) {
          const remaining = steps.slice(i + 1)
          const revisedSteps = await this.replan(remaining)
          if (revisedSteps) {
            steps = [...steps.slice(0, i + 1), ...revisedSteps]
            for (const rs of revisedSteps) {
              if (rs.args.username) plannedTargets.add(rs.args.username)
              if (rs.args.topic) plannedTargets.add(rs.args.topic)
            }
            this.options.onReplan?.(revisedSteps)
          }
        }
      } catch (err) {
        const isRateLimit = err instanceof Error && err.message.includes('429')
        if (isRateLimit) {
          this.options.onStepSkip?.(i, step, 'rate-limited')
        } else {
          this.options.onStepFail?.(i, step, err instanceof Error ? err : new Error(String(err)))
        }
        completedCount++
      }
    }

    return this.context
  }

  private async replan(remaining: AgentStep[]): Promise<AgentStep[] | null> {
    const summaryLines = this.context.results.map(summarizeResult)
    const remainingLines = remaining.map(
      (s) =>
        `${s.command} ${s.args.topic ?? s.args.username ?? s.args.tweetId ?? ''}: ${s.reasoning}`,
    )
    const leadLines = this.context.leads.filter(
      (l) => !remaining.some((s) => s.args.username === l || s.args.topic === l),
    )

    const prompt = `Investigation so far:\n${summaryLines.join('\n')}\n\nRemaining planned steps:\n${remainingLines.join('\n')}\n\nDiscovered leads not yet investigated:\n${leadLines.length > 0 ? leadLines.join(', ') : 'None'}`

    const response = await this.deps.grok.query(prompt, {
      systemPrompt: REPLAN_SYSTEM_PROMPT,
      maxTokens: 1024,
    })

    this.context.totalCost += response.usage.costUsd
    this.replanCount++

    const decision = parseGrokJson<ReplanDecision>(response.text)

    if (decision.action === 'revise' && 'steps' in decision && Array.isArray(decision.steps)) {
      const validCommands = new Set(['scan', 'pulse', 'trace', 'gather', 'read', 'scope'])
      const maxAdditional = remaining.length + 3
      return decision.steps
        .filter((s) => validCommands.has(s.command))
        .slice(0, maxAdditional)
        .map((s) => ({
          command: s.command,
          args: s.args ?? {},
          reasoning: s.reasoning ?? '',
        }))
    }

    return null
  }
}

export class AgentSynthesizer {
  constructor(private grok: GrokAdapter) {}

  async synthesize(
    context: AgentContext,
    onChunk?: (text: string) => void,
  ): Promise<AgentBrief> {
    const allTweets: Tweet[] = []
    const allScores: GrokTweetScore[] = []
    const allCitations: GrokCitation[] = []
    let newestTweetAt: number | null = null

    for (const result of context.results) {
      if (result.tweets.length > 0) {
        const offset = allTweets.length
        allTweets.push(...result.tweets)
        for (const score of result.scores) {
          allScores.push({ ...score, index: score.index + offset })
        }
      }
      if (result.newestTweetAt !== null) {
        if (newestTweetAt === null || result.newestTweetAt > newestTweetAt) {
          newestTweetAt = result.newestTweetAt
        }
      }
      for (const c of result.citations) {
        if (!allCitations.some((existing) => existing.url === c.url)) {
          allCitations.push(c)
        }
      }
    }

    const confidence = computeConfidence(allTweets, allScores)
    const localContradictions = detectContradictions(
      context.results.map((r) => ({
        command: r.command,
        snapshot: r.snapshot,
        tweets: r.tweets,
        scores: r.scores,
      })),
    )
    const sampleSize = allTweets.length
    const staleness = newestTweetAt !== null ? Date.now() - newestTweetAt : null

    const resultSummaries = context.results
      .map((r) => `## ${r.command}\n${JSON.stringify(r.snapshot, null, 2)}`)
      .join('\n\n')

    const prompt = `Question: ${context.question}\n\nInvestigation results (${context.results.length} steps, ${sampleSize} tweets analyzed):\n\n${resultSummaries}`

    let response
    if (onChunk) {
      response = await this.grok.queryStream(prompt, {
        systemPrompt: SYNTHESIZER_SYSTEM_PROMPT,
        maxTokens: 3072,
      }, onChunk)
    } else {
      response = await this.grok.query(prompt, {
        systemPrompt: SYNTHESIZER_SYSTEM_PROMPT,
        maxTokens: 3072,
      })
    }

    const grokBrief = parseGrokJson<Partial<AgentBrief>>(response.text)

    const sentiment =
      allScores.length > 0
        ? Number((allScores.reduce((sum, s) => sum + s.sentiment, 0) / allScores.length).toFixed(2))
        : 0

    const brief: AgentBrief = {
      signalLine: grokBrief.signalLine ?? 'No signal.',
      sentiment,
      summary: grokBrief.summary ?? [],
      contradictions: mergeContradictions(localContradictions, grokBrief.contradictions ?? []),
      keyAccounts: (grokBrief.keyAccounts ?? []).map((a) => ({
        handle: a.handle ?? '',
        reach: a.reach ?? 0,
        sentiment: a.sentiment ?? 0,
        stance: a.stance ?? '',
      })),
      evidence: (grokBrief.evidence ?? []).map((e) => ({
        source: e.source ?? '',
        key: e.key ?? '',
        detail: e.detail ?? '',
      })),
      confidence,
      sampleSize,
      staleness,
      citations: allCitations,
    }

    return brief
  }
}

function mergeContradictions(local: string[], grok: string[]): string[] {
  const merged = [...local]
  for (const g of grok) {
    const lowerG = g.toLowerCase()
    const isDuplicate = local.some((l) => {
      const lowerL = l.toLowerCase()
      const gWords = new Set(lowerG.split(/\s+/))
      const lWords = lowerL.split(/\s+/)
      const overlap = lWords.filter((w) => gWords.has(w)).length
      return overlap > lWords.length * 0.5
    })
    if (!isDuplicate) merged.push(g)
  }
  return merged
}
