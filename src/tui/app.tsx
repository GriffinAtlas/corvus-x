import React, { useReducer, useMemo } from 'react'
import { Box, useApp, useInput } from 'ink'
import { Header } from './components/header.js'
import { ChatLog } from './components/chat-log.js'
import { StatusLine } from './components/status-line.js'
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
import type { CorvusDeps } from '../core/types.js'

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

    let d: CorvusDeps | null = null
    let gs: 'connected' | 'no-key' = 'no-key'
    let xs: 'connected' | 'no-key' | 'optional' = 'no-key'

    if (grokKey) {
      d = {
        grok: new GrokAdapter(grokKey),
        x: xToken ? new XAdapter(xToken) : null,
      }
      gs = 'connected'
      xs = xToken ? 'connected' : 'optional'
    }

    return { deps: d, grokStatus: gs, xApiStatus: xs, firstRun: !configExists }
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
        <Box flexDirection="column" height="100%">
          <Header version={version} firstRun={firstRun} />
          <Box flexDirection="column" flexGrow={1}>
            <ChatLog entries={session.history} />
          </Box>
          <StatusLine
            grokStatus={session.grokStatus}
            xApiStatus={session.xApiStatus}
            totalCost={session.totalCost}
            queryCount={session.queryCount}
          />
          <InputBar onSubmit={execute} isLoading={isLoading} />
        </Box>
      </DispatchContext>
    </SessionContext>
  )
}
