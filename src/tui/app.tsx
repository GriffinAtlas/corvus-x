import React, { useReducer, useMemo } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { Header } from './components/header.js'
import { ChatLog } from './components/chat-log.js'
import { InputBar } from './components/input-bar.js'
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

interface Props {
  version: string
}

export function App({ version }: Props) {
  const { exit } = useApp()

  const { deps, grokStatus, xApiStatus, firstRun } = useMemo(() => {
    const configExists = ConfigManager.exists()
    const auth = new AuthManager(ConfigManager.defaultDir())
    const grokKey = auth.getGrokKey()
    const xToken = auth.getXToken()

    if (!grokKey) {
      return { deps: null, grokStatus: 'no-key' as const, xApiStatus: 'no-key' as const, firstRun: !configExists }
    }

    return {
      deps: { grok: new GrokAdapter(grokKey), x: xToken ? new XAdapter(xToken) : null },
      grokStatus: 'connected' as const,
      xApiStatus: xToken ? 'connected' as const : 'optional' as const,
      firstRun: !configExists,
    }
  }, [])

  const [session, dispatch] = useReducer(sessionReducer, {
    ...initialSession,
    grokStatus,
    xApiStatus,
  })

  const { execute, isLoading } = useCommand(deps, dispatch, exit)

  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      exit()
    }
  })

  return (
    <SessionContext value={session}>
      <DispatchContext value={dispatch}>
        <Box flexDirection="column">
          <Header
            version={version}
            firstRun={firstRun}
            grokStatus={session.grokStatus}
            xApiStatus={session.xApiStatus}
          />
          <ChatLog entries={session.history} />
          {session.queryCount > 0 && (
            <Box paddingLeft={3} marginBottom={0}>
              <Text dimColor>{`$${session.totalCost.toFixed(3)} · ${session.queryCount} ${session.queryCount === 1 ? 'query' : 'queries'}`}</Text>
            </Box>
          )}
          <InputBar onSubmit={execute} isLoading={isLoading} />
        </Box>
      </DispatchContext>
    </SessionContext>
  )
}
