import { createContext, useContext } from 'react'
import type { Dispatch } from 'react'

export type GrokStatus = 'connected' | 'error' | 'no-key'
export type XApiStatus = 'connected' | 'error' | 'no-key' | 'optional'

export type ChatEntry =
  | { type: 'user'; text: string }
  | { type: 'result'; command: string; topic: string; rendered: string; cost: number; elapsed: number }
  | { type: 'prose'; text: string; cost: number }
  | { type: 'error'; message: string }
  | { type: 'system'; message: string }

export interface Session {
  startTime: number
  totalCost: number
  queryCount: number
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  history: ChatEntry[]
}

export type SessionAction =
  | { type: 'add-query'; entry: ChatEntry }
  | { type: 'add-result'; entry: ChatEntry }
  | { type: 'add-cost'; cost: number }
  | { type: 'add-error'; message: string }
  | { type: 'set-grok-status'; status: GrokStatus }
  | { type: 'set-x-status'; status: XApiStatus }
  | { type: 'clear-history' }

export const initialSession: Session = {
  startTime: Date.now(),
  totalCost: 0,
  queryCount: 0,
  grokStatus: 'no-key',
  xApiStatus: 'no-key',
  history: [],
}

export function sessionReducer(state: Session, action: SessionAction): Session {
  switch (action.type) {
    case 'add-query':
      return {
        ...state,
        history: [...state.history, action.entry],
        queryCount: state.queryCount + 1,
      }
    case 'add-result':
      return {
        ...state,
        history: [...state.history, action.entry],
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
      return { ...state, history: [], queryCount: 0, totalCost: 0 }
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
