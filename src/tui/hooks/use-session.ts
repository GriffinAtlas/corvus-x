import { createContext, useContext } from 'react'
import type { Dispatch } from 'react'
import type { Snapshot } from '../../core/schemas.js'

export type GrokStatus = 'connected' | 'error' | 'no-key'
export type XApiStatus = 'connected' | 'error' | 'no-key' | 'optional'

export interface ContextEntry {
  command: string
  topic: string
  snapshot: Snapshot
  timestamp: number
}

export type ChatEntry =
  | { type: 'user'; text: string }
  | { type: 'result'; refId: string; command: string; topic: string; rendered: string;
      cost: number; elapsed: number; expanded?: boolean }
  | { type: 'prose'; refId: string; text: string; cost: number; expanded?: boolean }
  | { type: 'error'; message: string }
  | { type: 'system'; message: string }

export interface Session {
  startTime: number
  totalCost: number
  queryCount: number
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  history: ChatEntry[]
  refCounter: number
  contextMap: Record<string, ContextEntry[]>
}

export type SessionAction =
  | { type: 'add-query'; entry: ChatEntry }
  | { type: 'add-result'; entry: ChatEntry }
  | { type: 'add-cost'; cost: number }
  | { type: 'add-error'; message: string }
  | { type: 'set-grok-status'; status: GrokStatus }
  | { type: 'set-x-status'; status: XApiStatus }
  | { type: 'clear-history' }
  | { type: 'expand-entry'; index: number }
  | { type: 'add-context'; topic: string; entry: ContextEntry }

export const initialSession: Session = {
  startTime: Date.now(),
  totalCost: 0,
  queryCount: 0,
  grokStatus: 'no-key',
  xApiStatus: 'no-key',
  history: [],
  refCounter: 0,
  contextMap: {},
}

function normalizeTopic(topic: string): string {
  return topic.toLowerCase().trim()
}

export function sessionReducer(state: Session, action: SessionAction): Session {
  switch (action.type) {
    case 'add-query':
      return {
        ...state,
        history: [...state.history, action.entry],
      }
    case 'add-result': {
      const isApiResult = action.entry.type === 'result' || action.entry.type === 'prose'
      let entry = action.entry
      if (isApiResult) {
        const nextRef = state.refCounter + 1
        const label = entry.type === 'result' ? entry.command : 'ask'
        entry = { ...entry, refId: `${label}:${nextRef}` } as ChatEntry
      }
      return {
        ...state,
        history: [...state.history, entry],
        queryCount: state.queryCount + (isApiResult ? 1 : 0),
        refCounter: isApiResult ? state.refCounter + 1 : state.refCounter,
      }
    }
    case 'add-cost':
      return { ...state, totalCost: state.totalCost + action.cost }
    case 'add-error':
      return {
        ...state,
        history: [...state.history, { type: 'error', message: action.message }],
      }
    case 'set-grok-status':
      return { ...state, grokStatus: action.status }
    case 'set-x-status':
      return { ...state, xApiStatus: action.status }
    case 'clear-history':
      return { ...state, history: [], queryCount: 0, totalCost: 0, refCounter: 0, contextMap: {} }
    case 'expand-entry': {
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.history.length) return state
      const entry = state.history[action.index]
      if (entry.type !== 'result' && entry.type !== 'prose') return state
      if (entry.expanded) return state
      return {
        ...state,
        history: state.history.map((e, i) => {
          if (i !== action.index) return e
          if (e.type === 'result' || e.type === 'prose') return { ...e, expanded: true }
          return e
        }),
      }
    }
    case 'add-context': {
      const key = normalizeTopic(action.topic)
      const existing = state.contextMap[key] ?? []
      return {
        ...state,
        contextMap: {
          ...state.contextMap,
          [key]: [...existing, action.entry],
        },
      }
    }
  }
}

const SessionContext = createContext<Session>(initialSession)
const DispatchContext = createContext<Dispatch<SessionAction>>(() => {})

export function useSession(): Session {
  return useContext(SessionContext)
}

export function useSessionDispatch(): Dispatch<SessionAction> {
  return useContext(DispatchContext)
}

export { SessionContext, DispatchContext }
