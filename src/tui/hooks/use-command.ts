import { useState, useCallback } from 'react'
import { parseInput } from '../router.js'
import { executeStructuredQuery } from '../../core/orchestrator.js'
import { ConfigManager } from '../../infra/config.js'
import { buildScanSnapshot } from '../../core/builders/scan.js'
import { buildPulseSnapshot } from '../../core/builders/pulse.js'
import { buildTraceSnapshot } from '../../core/builders/trace.js'
import { buildGatherSnapshot } from '../../core/builders/gather.js'
import { buildReadSnapshot, extractTweetId } from '../../core/builders/read.js'
import { buildScopeSnapshot } from '../../core/builders/scope.js'
import { renderScan, renderPulse, renderTrace, renderGather, renderRead, renderScope } from '../../cli/output.js'
import { SCAN_MATCH_KEYS, PULSE_MATCH_KEYS, TRACE_MATCH_KEYS, GATHER_MATCH_KEYS } from '../../core/schemas.js'
import type { CorvusDeps } from '../../core/types.js'
import type { Snapshot, MatchKeys } from '../../core/schemas.js'
import type { BuildResult } from '../../core/types.js'
import type { Dispatch } from 'react'
import type { SessionAction } from './use-session.js'

const HELP_TEXT = `Commands:
  scan <topic>        Snapshot X discourse on a topic
  pulse <topic>       Sentiment pulse — bull/bear signals
  trace <topic>       Trace how a narrative spreads
  gather <topic>      X discourse + web search
  read <id-or-url>    Analyze a single tweet
  scope <@username>   Profile an X account
  ask <question>      Ask Grok anything

  /help               Show this help
  /cost               Session spend
  /clear              Clear chat
  /exit               Quit`

// Helper to reduce repetition across the 6 structured commands
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
export function useCommand(deps: CorvusDeps | null, dispatch: Dispatch<SessionAction>, exit: () => void) {
  const [isLoading, setIsLoading] = useState(false)

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
        const response = await deps.grok.query(args.question, {
          enableXSearch: true,
          systemPrompt: 'You are Corvus, a sharp intelligence analyst. Be concise and direct. Lead with the key insight.',
        })
        dispatch({ type: 'set-grok-status', status: 'connected' })
        dispatch({ type: 'add-cost', cost: response.usage.costUsd })
        dispatch({
          type: 'add-result',
          entry: { type: 'prose', text: response.text, cost: response.usage.costUsd },
        })
      } else if (command === 'scan') {
        await runStructured(dispatch, deps, 'scan', args.topic, SCAN_MATCH_KEYS,
          () => buildScanSnapshot(deps, args.topic, 50), renderScan, startTime, baseDir)
      } else if (command === 'pulse') {
        await runStructured(dispatch, deps, 'pulse', args.topic, PULSE_MATCH_KEYS,
          () => buildPulseSnapshot(deps, args.topic, 50), renderPulse, startTime, baseDir)
      } else if (command === 'trace') {
        await runStructured(dispatch, deps, 'trace', args.topic, TRACE_MATCH_KEYS,
          () => buildTraceSnapshot(deps, args.topic, 50), renderTrace, startTime, baseDir)
      } else if (command === 'gather') {
        await runStructured(dispatch, deps, 'gather', args.topic, GATHER_MATCH_KEYS,
          () => buildGatherSnapshot(deps, args.topic, 50), renderGather, startTime, baseDir)
      } else if (command === 'read') {
        const tweetId = extractTweetId(args.tweetIdOrUrl)
        if (!tweetId) {
          dispatch({ type: 'add-error', message: 'Invalid tweet ID or URL.' })
          return
        }
        await runStructured(dispatch, deps, 'read', tweetId, {},
          () => buildReadSnapshot(deps, tweetId), renderRead, startTime, baseDir)
      } else if (command === 'scope') {
        await runStructured(dispatch, deps, 'scope', args.username, {},
          () => buildScopeSnapshot(deps, args.username, 10), renderScope, startTime, baseDir)
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
      setIsLoading(false)
    }
  }, [deps, dispatch, exit])

  return { execute, isLoading }
}
