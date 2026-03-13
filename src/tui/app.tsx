import React, { useReducer, useMemo, useState, useEffect } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { WelcomeView } from './components/welcome-view.js'
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

interface Props {
  version: string
}

export function App({ version }: Props) {
  const { exit } = useApp()

  const { deps, grokStatus, xApiStatus } = useMemo(() => {
    const auth = new AuthManager(ConfigManager.defaultDir())
    const grokKey = auth.getGrokKey()
    const xToken = auth.getXToken()

    if (!grokKey) {
      return { deps: null, grokStatus: 'no-key' as const, xApiStatus: 'no-key' as const }
    }

    return {
      deps: { grok: new GrokAdapter(grokKey), x: xToken ? new XAdapter(xToken) : null },
      grokStatus: 'connected' as const,
      xApiStatus: xToken ? ('connected' as const) : ('optional' as const),
    }
  }, [])

  const recentTopics = useMemo(() => {
    try {
      const store = new SnapshotStore(ConfigManager.defaultDir())
      return store.listTopics().slice(0, 5)
    } catch {
      return []
    }
  }, [])

  const [session, dispatch] = useReducer(sessionReducer, {
    ...initialSession,
    grokStatus,
    xApiStatus,
  })

  const { execute, isLoading, phaseLabel } = useCommand(deps, dispatch, exit, session.history)

  const [scrollOffset, setScrollOffset] = useState(0)
  const { stdout } = useStdout()
  const terminalHeight = stdout?.rows ?? 24

  // Auto-snap to bottom on new entries
  const historyLength = session.history.length
  useEffect(() => {
    setScrollOffset(0)
  }, [historyLength])

  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      exit()
    }
    if (key.pageUp) {
      const step = Math.max(1, Math.floor((terminalHeight - 5) / 4))
      setScrollOffset((prev) => Math.min(prev + step, Math.max(0, session.history.length - 1)))
    }
    if (key.pageDown) {
      const step = Math.max(1, Math.floor((terminalHeight - 5) / 4))
      setScrollOffset((prev) => Math.max(prev - step, 0))
    }
    if (key.meta && key.upArrow) {
      // Home — scroll to top
      setScrollOffset(Math.max(0, session.history.length - 1))
    }
    if (key.meta && key.downArrow) {
      // End — scroll to bottom
      setScrollOffset(0)
    }
  })

  return (
    <SessionContext value={session}>
      <DispatchContext value={dispatch}>
        <Box flexDirection="column">
          {session.queryCount === 0 ? (
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
              <ChatViewport
                entries={session.history}
                scrollOffset={scrollOffset}
                viewportHeight={terminalHeight - 5}
              />
              <Box paddingLeft={3} marginBottom={0}>
                <Text dimColor>
                  {`$${session.totalCost.toFixed(3)} · ${session.queryCount} ${session.queryCount === 1 ? 'query' : 'queries'}`}
                </Text>
              </Box>
            </>
          )}
          <InputBar onSubmit={execute} isLoading={isLoading} phaseLabel={phaseLabel} />
          <ShortcutBar />
        </Box>
      </DispatchContext>
    </SessionContext>
  )
}
