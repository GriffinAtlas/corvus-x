import React, { useReducer, useRef, useState, useEffect } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { WelcomeView } from './components/welcome-view.js'
import { CompactHeader } from './components/compact-header.js'
import { ChatViewport } from './components/chat-viewport.js'
import { InputBar } from './components/input-bar.js'
import { ShortcutBar } from './components/shortcut-bar.js'
import { useCommand } from './hooks/use-command.js'
import {
  sessionReducer,
  initialSession,
  SessionContext,
  DispatchContext,
} from './hooks/use-session.js'
import { AuthManager } from '../infra/auth.js'
import { ConfigManager } from '../infra/config.js'
import { GrokAdapter } from '../core/grok-adapter.js'
import { XAdapter } from '../core/x-adapter.js'
import { SnapshotStore } from '../core/snapshots.js'
import type { CorvusDeps } from '../core/types.js'
import type { GrokStatus, XApiStatus } from './hooks/use-session.js'

export interface AppInit {
  deps: CorvusDeps | null
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  recentTopics: { command: string; topic: string; latest: number }[]
}

export function initApp(): AppInit {
  const auth = new AuthManager(ConfigManager.defaultDir())
  const grokKey = auth.getGrokKey()
  const xToken = auth.getXToken()

  let deps: CorvusDeps | null = null
  let grokStatus: GrokStatus = 'no-key'
  let xApiStatus: XApiStatus = 'no-key'

  if (grokKey) {
    deps = { grok: new GrokAdapter(grokKey), x: xToken ? new XAdapter(xToken) : null }
    grokStatus = 'connected'
    xApiStatus = xToken ? 'connected' : 'optional'
  }

  let recentTopics: AppInit['recentTopics'] = []
  try {
    const store = new SnapshotStore(ConfigManager.defaultDir())
    recentTopics = store.listTopics().slice(0, 5)
  } catch {
    // no snapshots yet
  }

  return { deps, grokStatus, xApiStatus, recentTopics }
}

interface Props {
  version: string
  init: AppInit
}

export function App({ version, init }: Props) {
  const { exit } = useApp()
  const { deps, grokStatus, xApiStatus, recentTopics } = init

  const [session, dispatch] = useReducer(sessionReducer, {
    ...initialSession,
    grokStatus,
    xApiStatus,
  })

  const { execute, isLoading, phaseLabel } = useCommand(deps, dispatch, exit, session.history)

  const [scrollOffset, setScrollOffset] = useState(0)
  const userScrolled = useRef(false)
  const { stdout } = useStdout()
  const terminalHeight = stdout?.rows ?? 24

  // Auto-snap to bottom on new entries — only when user hasn't scrolled away
  const historyLength = session.history.length
  useEffect(() => {
    if (!userScrolled.current) {
      setScrollOffset(0)
    }
  }, [historyLength])

  useInput((_input, key) => {
    const maxOffset = Math.max(0, session.history.length - 1)

    if (key.pageUp) {
      userScrolled.current = true
      setScrollOffset((prev) => Math.min(prev + 3, maxOffset))
    }
    if (key.shift && key.upArrow) {
      userScrolled.current = true
      setScrollOffset((prev) => Math.min(prev + 1, maxOffset))
    }
    if (key.pageDown) {
      setScrollOffset((prev) => {
        const next = Math.max(prev - 3, 0)
        if (next === 0) userScrolled.current = false
        return next
      })
    }
    if (key.shift && key.downArrow) {
      setScrollOffset((prev) => {
        const next = Math.max(prev - 1, 0)
        if (next === 0) userScrolled.current = false
        return next
      })
    }
    if (key.meta && key.upArrow) {
      userScrolled.current = true
      setScrollOffset(maxOffset)
    }
    if (key.meta && key.downArrow) {
      userScrolled.current = false
      setScrollOffset(0)
    }
  })

  return (
    <SessionContext value={session}>
      <DispatchContext value={dispatch}>
        <Box flexDirection="column">
          {session.history.length === 0 ? (
            <WelcomeView
              version={version}
              grokStatus={session.grokStatus}
              xApiStatus={session.xApiStatus}
              totalCost={session.totalCost}
              queryCount={session.queryCount}
              recentTopics={recentTopics}
            />
          ) : (
            <>
              <CompactHeader
                version={version}
                grokStatus={session.grokStatus}
                xApiStatus={session.xApiStatus}
                totalCost={session.totalCost}
                queryCount={session.queryCount}
              />
              <ChatViewport
                entries={session.history}
                scrollOffset={scrollOffset}
                viewportHeight={terminalHeight - 6}
              />
            </>
          )}
          <InputBar onSubmit={execute} isLoading={isLoading} phaseLabel={phaseLabel} />
          <ShortcutBar />
        </Box>
      </DispatchContext>
    </SessionContext>
  )
}
