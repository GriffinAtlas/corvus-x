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
import { renderScan, renderPulse, renderTrace, renderProfile, renderDraft, renderHooks, renderReview, renderTiming } from '../../cli/output.js'
import { SCAN_MATCH_KEYS, PULSE_MATCH_KEYS, TRACE_MATCH_KEYS, PROFILE_MATCH_KEYS, HOOKS_MATCH_KEYS, REVIEW_MATCH_KEYS, TIMING_MATCH_KEYS } from '../../core/schemas.js'
import type { CorvusDeps } from '../../core/types.js'
import type { Snapshot, MatchKeys } from '../../core/schemas.js'
import type { BuildResult } from '../../core/types.js'
import type { Dispatch } from 'react'
import type { ChatEntry, SessionAction } from './use-session.js'

const HELP_TEXT = `Commands:
  scan <topic>        Snapshot X discourse on a topic
  pulse <topic>       Sentiment pulse — bull/bear signals
  trace <topic>       Trace how a narrative spreads
  draft <topic>       Draft a post in your voice
  hooks <topic>       Find conversations to reply to
  profile <@user>     Analyze content strategy
  review              Review your recent posting
  timing [topic]      Best times to post
  ask <question>      Ask Grok anything

  /help               Show this help
  /cost               Session spend
  /clear              Clear chat
  /exit               Quit`

// Helper to reduce repetition across the structured commands
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
      rendered: renderFn(result.data),
      cost: result.cost,
      elapsed: Date.now() - startTime,
    },
  })
}

// dispatch and exit are passed in rather than read from context,
// because useCommand is called in the same component that provides the context.
export function useCommand(deps: CorvusDeps | null, dispatch: Dispatch<SessionAction>, exit: () => void, history: ChatEntry[] = []) {
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
          return // handled by StatusLine — always visible
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
        case 'view': {
          const index = parseInt(parsed.args?.index ?? '') - 1
          if (index < 0 || index >= history.length) {
            dispatch({ type: 'add-error', message: `Entry ${index + 1} does not exist.` })
            return
          }
          const entry = history[index]
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

      if (command === 'ask') {
        setPhaseLabel('thinking...')
        const response = await deps.grok.query(args.question, {
          enableXSearch: true,
          systemPrompt: 'You are a sharp intelligence analyst. Be concise and direct. Lead with the key insight. Filter out spam, scams, and promotional content.',
        })
        dispatch({ type: 'set-grok-status', status: 'connected' })
        dispatch({ type: 'add-cost', cost: response.usage.costUsd })
        dispatch({
          type: 'add-result',
          entry: { type: 'prose', text: response.text, cost: response.usage.costUsd },
        })
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
          () => buildDraftSnapshot(deps, args.topic, {}), renderDraft, startTime, baseDir)
      } else if (command === 'grow') {
        setPhaseLabel(`growing "${args.topic}" — hooks...`)
        const hooks = await buildHooksSnapshot(deps, args.topic, 30)
        dispatch({ type: 'add-cost', cost: hooks.cost })
        setPhaseLabel(`growing "${args.topic}" — drafting...`)
        const draft = await buildDraftSnapshot(deps, args.topic, {})
        dispatch({ type: 'add-cost', cost: draft.cost })
        setPhaseLabel(`growing "${args.topic}" — timing...`)
        const handle = new AuthManager(baseDir).getXHandle()
        const timing = await buildTimingSnapshot(deps, { handle: handle ?? undefined, topic: args.topic })
        dispatch({ type: 'add-cost', cost: timing.cost })
        dispatch({ type: 'set-grok-status', status: 'connected' })
        const combined = [renderHooks(hooks.data), '', renderDraft(draft.data), '', renderTiming(timing.data)].join('\n')
        dispatch({
          type: 'add-result',
          entry: {
            type: 'result', command: 'grow', topic: args.topic,
            rendered: combined,
            cost: hooks.cost + draft.cost + timing.cost,
            elapsed: Date.now() - startTime,
          },
        })
      } else if (command === 'hooks') {
        setPhaseLabel(`finding hooks for "${args.topic}"...`)
        await runStructured(dispatch, deps, 'hooks', args.topic, HOOKS_MATCH_KEYS,
          () => buildHooksSnapshot(deps, args.topic, 50), renderHooks, startTime, baseDir)
      } else if (command === 'profile') {
        const handle = args.username
        const isSelf = resolveIsSelf(handle, new AuthManager(baseDir).getXHandle())
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
      if (message.includes('rate limit') || message.includes('429')) {
        dispatch({ type: 'add-error', message: `Rate limited. ${message}` })
      } else if (message.includes('X API')) {
        dispatch({ type: 'set-x-status', status: 'error' })
        dispatch({ type: 'add-error', message: `X API error: ${message}` })
      } else {
        dispatch({ type: 'set-grok-status', status: 'error' })
        dispatch({ type: 'add-error', message })
      }
    } finally {
      setPhaseLabel(null)
      setIsLoading(false)
    }
  }, [deps, dispatch, exit, history])

  return { execute, isLoading, phaseLabel }
}
