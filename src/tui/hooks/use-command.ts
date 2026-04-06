import { useState, useCallback } from 'react'
import { parseInput } from '../router.js'
import { executeStructuredQuery } from '../../core/orchestrator.js'
import { ConfigManager } from '../../infra/config.js'
import { AuthManager } from '../../infra/auth.js'
import { buildScanSnapshot } from '../../core/builders/scan.js'
import { buildPulseSnapshot } from '../../core/builders/pulse.js'
import { buildTraceSnapshot } from '../../core/builders/trace.js'
import { buildProfileSnapshot, resolveIsSelf } from '../../core/builders/profile.js'
import { buildHooksSnapshot } from '../../core/builders/hooks.js'
import { buildDraftSnapshot } from '../../core/builders/draft.js'
import { buildReviewSnapshot } from '../../core/builders/review.js'
import { buildTimingSnapshot } from '../../core/builders/timing.js'
import { agentMulti, AgentPlanner, AgentExecutor, AgentSynthesizer } from '../../core/agent.js'
import { SnapshotStore } from '../../core/snapshots.js'
import { renderScan, renderPulse, renderTrace, renderProfile, renderDraft, renderHooks, renderReview, renderTiming, renderAgentBrief } from '../../cli/output.js'
import { buildContextSummary } from '../../core/context.js'
import { SCAN_MATCH_KEYS, PULSE_MATCH_KEYS, TRACE_MATCH_KEYS, PROFILE_MATCH_KEYS, HOOKS_MATCH_KEYS, REVIEW_MATCH_KEYS, TIMING_MATCH_KEYS } from '../../core/schemas.js'
import { XRateLimitError, XApiError } from '../../core/x-adapter.js'
import type { CorvusDeps } from '../../core/types.js'
import type { Snapshot, MatchKeys } from '../../core/schemas.js'
import type { BuildResult } from '../../core/types.js'
import type { Dispatch } from 'react'
import type { ChatEntry, SessionAction, Session } from './use-session.js'
import { normalizeTopic } from './use-session.js'

const HELP_TEXT = `Commands:
  scan <topic>        Snapshot X discourse on a topic
  pulse <topic>       Sentiment pulse — bull/bear signals
  trace <topic>       Trace how a narrative spreads
  draft <topic>       Draft a post in your voice
  hooks <topic>       Find conversations to reply to
  grow <topic>        Full growth workflow (hooks + draft + timing)
  agent <question>    Deep research — multi-step investigation
  profile <@user>     Analyze content strategy
  review              Review your recent posting
  timing [topic]      Best times to post
  ask <question>      Ask Grok anything

  /help               Show this help
  /brief              Session summary with ref IDs
  /cost               Session spend
  /clear              Clear chat
  /view <N or ref>    Expand a truncated result (e.g., /view 3 or /view scan:1)
  /exit               Quit

Context flows between commands on the same topic.
Run scan first, then draft — the draft will use scan insights.`

function getContextForTopic(session: Session, topic: string): string {
  const entries = session.contextMap[normalizeTopic(topic)]
  if (!entries || entries.length === 0) return ''
  return buildContextSummary(entries)
}

async function runStructured<T extends Snapshot>(
  dispatch: Dispatch<SessionAction>,
  deps: CorvusDeps,
  command: string,
  topic: string,
  matchKeys: MatchKeys,
  buildFn: () => Promise<BuildResult<T>>,
  renderFn: (data: T) => string,
  startTime: number,
  baseDir: string,
) {
  const result = await executeStructuredQuery({
    command, topic, matchKeys, buildSnapshot: buildFn, baseDir,
  })
  dispatch({ type: 'set-grok-status', status: 'connected' })
  if (deps.x) dispatch({ type: 'set-x-status', status: 'connected' })
  dispatch({ type: 'add-cost', cost: result.cost })
  dispatch({
    type: 'add-result',
    entry: {
      type: 'result', command, topic,
      rendered: renderFn(result.data as T),
      cost: result.cost,
      elapsed: Date.now() - startTime,
    },
  })
  dispatch({
    type: 'add-context',
    topic,
    entry: { command, topic, snapshot: result.data as Snapshot, timestamp: Date.now() },
  })
}

export function useCommand(deps: CorvusDeps | null, dispatch: Dispatch<SessionAction>, exit: () => void, session: Session) {
  const [isLoading, setIsLoading] = useState(false)
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null)

  const execute = useCallback(async (input: string) => {
    const parsed = parseInput(input)

    if (parsed.type === 'empty') return

    if (parsed.type === 'error') {
      dispatch({ type: 'add-error', message: parsed.message })
      return
    }

    if (parsed.type === 'slash') {
      switch (parsed.command) {
        case 'help':
          dispatch({ type: 'add-result', entry: { type: 'system', message: HELP_TEXT } })
          return
        case 'cost':
          return
        case 'clear':
          dispatch({ type: 'clear-history' })
          return
        case 'history':
          dispatch({
            type: 'add-result',
            entry: { type: 'system', message: 'Session history is displayed above. Use /clear to reset.' },
          })
          return
        case 'exit':
          exit()
          return
        case 'brief': {
          const results = session.history.filter(
            (e): e is Extract<ChatEntry, { type: 'result' }> => e.type === 'result',
          )
          if (results.length === 0) {
            dispatch({ type: 'add-result', entry: { type: 'system', message: 'No results yet. Run a command first.' } })
            return
          }
          const lines = results.map((r) =>
            `  [${r.refId}]  ${r.command} · ${r.topic}  ${(r.elapsed / 1000).toFixed(1)}s`,
          )
          dispatch({
            type: 'add-result',
            entry: { type: 'system', message: `Session brief (${results.length} results):\n\n${lines.join('\n')}` },
          })
          return
        }
        case 'view': {
          // Ref ID mode (e.g., /view scan:1)
          if (parsed.args?.refId) {
            const idx = session.history.findIndex(
              (e) => (e.type === 'result' || e.type === 'prose') && e.refId === parsed.args!.refId,
            )
            if (idx < 0) {
              dispatch({ type: 'add-error', message: `No result with ref ${parsed.args.refId}. Try /brief to see available refs.` })
              return
            }
            const entry = session.history[idx]
            if ((entry.type === 'result' || entry.type === 'prose') && entry.expanded) {
              dispatch({ type: 'add-error', message: `${parsed.args.refId} is already expanded.` })
              return
            }
            dispatch({ type: 'expand-entry', index: idx })
            return
          }
          // Numeric index mode (e.g., /view 3)
          const index = parseInt(parsed.args?.index ?? '') - 1
          if (index < 0 || index >= session.history.length) {
            dispatch({ type: 'add-error', message: `Entry ${index + 1} does not exist.` })
            return
          }
          const entry = session.history[index]
          if (entry.type !== 'result' && entry.type !== 'prose') {
            dispatch({ type: 'add-error', message: `Entry ${index + 1} is not expandable.` })
            return
          }
          if (entry.expanded) {
            dispatch({ type: 'add-error', message: `Entry ${index + 1} is already expanded.` })
            return
          }
          dispatch({ type: 'expand-entry', index })
          return
        }
      }
      return
    }

    if (!deps) {
      dispatch({ type: 'add-error', message: 'No Grok API key. Run: corvus auth setup' })
      return
    }

    // history is instant — no loading state or user echo needed
    if (parsed.command === 'history') {
      dispatch({
        type: 'add-result',
        entry: { type: 'system', message: 'Session history is displayed above. Use /clear to reset.' },
      })
      return
    }

    dispatch({ type: 'add-query', entry: { type: 'user', text: input } })
    setIsLoading(true)
    const startTime = Date.now()

    try {
      const { command, args } = parsed
      const baseDir = ConfigManager.defaultDir()
      const priorContext = getContextForTopic(session, args.topic ?? args.question ?? '')

      if (command === 'ask') {
        setPhaseLabel('thinking...')
        const response = await deps.grok.query(args.question, {
          enableXSearch: true,
          systemPrompt: 'You are a sharp intelligence analyst. Be concise and direct. Lead with the key insight. Filter out spam, scams, and promotional content.',
        })
        dispatch({ type: 'set-grok-status', status: 'connected' })
        dispatch({ type: 'add-cost', cost: response.usage.costUsd })
        const cleanText = response.text.replace(/\[\[(\d+)\]\]\([^)]+\)/g, '[$1]')
        dispatch({
          type: 'add-result',
          entry: { type: 'prose', text: cleanText, cost: response.usage.costUsd },
        })
      } else if (command === 'agent') {
        setPhaseLabel(`investigating "${args.question}"...`)
        try {
          const result = await agentMulti(deps.grok, args.question)
          dispatch({ type: 'set-grok-status', status: 'connected' })
          dispatch({ type: 'add-cost', cost: result.cost })
          const rendered = renderAgentBrief(result.brief, {
            stepCount: result.brief.evidence.length,
            durationMs: result.durationMs,
            tweetCount: result.brief.sampleSize,
            accountCount: result.brief.keyAccounts.length,
            cost: result.cost,
          })
          dispatch({
            type: 'add-result',
            entry: {
              type: 'result', command: 'agent', topic: args.question,
              rendered,
              cost: result.cost,
              elapsed: result.durationMs,
            },
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('rate limit') || msg.includes('429') || msg.includes('authentication') || msg.includes('401')) throw err
          setPhaseLabel(`investigating "${args.question}" (classic)...`)
          const planner = new AgentPlanner(deps.grok)
          const { plan, costUsd: planCost } = await planner.plan(args.question)
          dispatch({
            type: 'add-result',
            entry: { type: 'system', message: `Agent plan: ${plan.goal}\n${plan.steps.map((s, i) => `  ${i + 1}. ${s.command} ${s.args.topic ?? s.args.username ?? ''} — ${s.reasoning}`).join('\n')}` },
          })

          const executor = new AgentExecutor(deps, args.question, plan, {
            maxSteps: 8,
            budget: 1.0,
            replan: true,
            onStepStart: (i, step) => {
              setPhaseLabel(`step ${i + 1}/${plan.steps.length}: ${step.command}...`)
            },
            onStepComplete: (i, step, durationMs) => {
              dispatch({
                type: 'add-result',
                entry: { type: 'system', message: `  step ${i + 1} done: ${step.command} (${(durationMs / 1000).toFixed(1)}s)` },
              })
            },
          })

          const ctx = await executor.execute(planCost)
          const synthesizer = new AgentSynthesizer(deps.grok)
          const brief = await synthesizer.synthesize(ctx)

          const agentStore = new SnapshotStore(ConfigManager.defaultDir())
          agentStore.save('agent', args.question, brief, JSON.stringify(ctx), ctx.totalCost)

          dispatch({ type: 'set-grok-status', status: 'connected' })
          dispatch({ type: 'add-cost', cost: ctx.totalCost })
          const rendered = renderAgentBrief(brief, {
            stepCount: ctx.results.length,
            durationMs: Date.now() - startTime,
            tweetCount: brief.sampleSize,
            accountCount: brief.keyAccounts.length,
            cost: ctx.totalCost,
          })
          dispatch({
            type: 'add-result',
            entry: {
              type: 'result', command: 'agent', topic: args.question,
              rendered,
              cost: ctx.totalCost,
              elapsed: Date.now() - startTime,
            },
          })
        }
      } else if (command === 'scan') {
        setPhaseLabel(`scanning "${args.topic}"...`)
        await runStructured(dispatch, deps, 'scan', args.topic, SCAN_MATCH_KEYS,
          () => buildScanSnapshot(deps, args.topic, 50), renderScan, startTime, baseDir)
      } else if (command === 'pulse') {
        setPhaseLabel(`analyzing sentiment for "${args.topic}"...`)
        await runStructured(dispatch, deps, 'pulse', args.topic, PULSE_MATCH_KEYS,
          () => buildPulseSnapshot(deps, args.topic, 50), renderPulse, startTime, baseDir)
      } else if (command === 'trace') {
        setPhaseLabel(`tracing "${args.topic}"...`)
        await runStructured(dispatch, deps, 'trace', args.topic, TRACE_MATCH_KEYS,
          () => buildTraceSnapshot(deps, args.topic, 50), renderTrace, startTime, baseDir)
      } else if (command === 'draft') {
        setPhaseLabel(`drafting post about "${args.topic}"...`)
        await runStructured(dispatch, deps, 'draft', args.topic, {},
          () => buildDraftSnapshot(deps, args.topic, { priorContext: priorContext || undefined }), renderDraft, startTime, baseDir)
      } else if (command === 'grow') {
        const topic = args.topic
        const draftContext = getContextForTopic(session, topic)
        let hooksContext = ''
        let stepsCompleted = 0

        // Step 1: Hooks
        try {
          setPhaseLabel(`grow "${topic}" — finding hooks...`)
          const hooks = await buildHooksSnapshot(deps, topic, 30, priorContext || undefined)
          dispatch({ type: 'add-cost', cost: hooks.cost })
          dispatch({
            type: 'add-result',
            entry: {
              type: 'result', command: 'hooks', topic,
              rendered: renderHooks(hooks.data),
              cost: hooks.cost,
              elapsed: Date.now() - startTime,
            },
          })
          dispatch({
            type: 'add-context',
            topic,
            entry: { command: 'hooks', topic, snapshot: hooks.data, timestamp: Date.now() },
          })
          hooksContext = hooks.data.opportunities
            .slice(0, 5)
            .map((o) => `@${o.author}: "${o.content}" (${o.engagement.likes} likes, ${o.engagement.replies} replies) — angle: ${o.suggestedAngle}`)
            .join('\n')
          stepsCompleted++
        } catch (err) {
          dispatch({ type: 'add-result', entry: { type: 'system', message: `Hooks skipped: ${err instanceof Error ? err.message : String(err)}` } })
        }

        // Step 2: Draft (with hooks context injected)
        const draftStartTime = Date.now()
        try {
          setPhaseLabel(`grow "${topic}" — drafting...`)
          const draft = await buildDraftSnapshot(deps, topic, { hooksContext: hooksContext || undefined, priorContext: draftContext || undefined })
          dispatch({ type: 'add-cost', cost: draft.cost })
          dispatch({
            type: 'add-result',
            entry: {
              type: 'result', command: 'draft', topic,
              rendered: renderDraft(draft.data),
              cost: draft.cost,
              elapsed: Date.now() - draftStartTime,
            },
          })
          dispatch({
            type: 'add-context',
            topic,
            entry: { command: 'draft', topic, snapshot: draft.data, timestamp: Date.now() },
          })
          stepsCompleted++
        } catch (err) {
          dispatch({ type: 'add-result', entry: { type: 'system', message: `Draft skipped: ${err instanceof Error ? err.message : String(err)}` } })
        }

        // Step 3: Timing
        const timingStartTime = Date.now()
        try {
          setPhaseLabel(`grow "${topic}" — timing...`)
          const timing = await buildTimingSnapshot(deps, { topic })
          dispatch({ type: 'add-cost', cost: timing.cost })
          dispatch({
            type: 'add-result',
            entry: {
              type: 'result', command: 'timing', topic,
              rendered: renderTiming(timing.data),
              cost: timing.cost,
              elapsed: Date.now() - timingStartTime,
            },
          })
          dispatch({
            type: 'add-context',
            topic,
            entry: { command: 'timing', topic, snapshot: timing.data, timestamp: Date.now() },
          })
          stepsCompleted++
        } catch (err) {
          dispatch({ type: 'add-result', entry: { type: 'system', message: `Timing skipped: ${err instanceof Error ? err.message : String(err)}` } })
        }

        dispatch({ type: 'set-grok-status', status: 'connected' })
        if (deps.x) dispatch({ type: 'set-x-status', status: 'connected' })

        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        dispatch({
          type: 'add-result',
          entry: { type: 'system', message: `grow complete — ${stepsCompleted}/3 steps, ${totalElapsed}s` },
        })
      } else if (command === 'hooks') {
        setPhaseLabel(`finding hooks for "${args.topic}"...`)
        await runStructured(dispatch, deps, 'hooks', args.topic, HOOKS_MATCH_KEYS,
          () => buildHooksSnapshot(deps, args.topic, 50, priorContext || undefined), renderHooks, startTime, baseDir)
      } else if (command === 'profile') {
        let handle = args.username
        const storedHandle = new AuthManager(baseDir).getXHandle()
        if (handle.toLowerCase() === 'self') {
          if (!storedHandle) {
            dispatch({ type: 'add-error', message: 'No X handle configured. Run: corvus auth setup' })
            return
          }
          handle = storedHandle
        }
        const isSelf = resolveIsSelf(handle, storedHandle)
        setPhaseLabel(`profiling @${handle}${isSelf ? ' (self)' : ''}...`)
        await runStructured(dispatch, deps, 'profile', `@${handle}`, PROFILE_MATCH_KEYS,
          () => buildProfileSnapshot(deps, handle, 50, isSelf), renderProfile, startTime, baseDir)
      } else if (command === 'review') {
        const auth = new AuthManager(baseDir)
        const handle = auth.getXHandle()
        if (!handle) {
          dispatch({ type: 'add-error', message: 'No X handle configured. Run: corvus auth setup' })
          return
        }
        setPhaseLabel(`reviewing @${handle}...`)
        await runStructured(dispatch, deps, 'review', `@${handle}`, REVIEW_MATCH_KEYS,
          () => buildReviewSnapshot(deps, handle, 7), renderReview, startTime, baseDir)
      } else if (command === 'timing') {
        const auth = new AuthManager(baseDir)
        const handle = auth.getXHandle()
        const topic = args.topic
        if (!topic && !handle) {
          dispatch({ type: 'add-error', message: 'No X handle configured. Provide a topic or run: corvus auth setup' })
          return
        }
        const label = topic ?? `@${handle}`
        setPhaseLabel(`analyzing timing for ${label}...`)
        await runStructured(dispatch, deps, 'timing', label, TIMING_MATCH_KEYS,
          () => buildTimingSnapshot(deps, { handle: topic ? undefined : handle!, topic }), renderTiming, startTime, baseDir)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (err instanceof XRateLimitError) {
        dispatch({ type: 'set-x-status', status: 'error' })
        dispatch({ type: 'add-error', message: `X rate limited until ${err.resetAt.toISOString()}` })
      } else if (err instanceof XApiError) {
        dispatch({ type: 'set-x-status', status: 'error' })
        dispatch({ type: 'add-error', message: `X API error: ${message}` })
      } else if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
        dispatch({ type: 'add-error', message: `Rate limited. ${message}` })
      } else {
        dispatch({ type: 'set-grok-status', status: 'error' })
        dispatch({ type: 'add-error', message })
      }
    } finally {
      setPhaseLabel(null)
      setIsLoading(false)
    }
  }, [deps, dispatch, exit, session])

  return { execute, isLoading, phaseLabel }
}
