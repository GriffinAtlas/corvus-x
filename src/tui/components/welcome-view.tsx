import React from 'react'
import { Box, useStdout } from 'ink'
import { WelcomeHeader } from './welcome-header.js'
import { StatusPanel } from './status-panel.js'
import { QuickStartPanel } from './quick-start-panel.js'
import { SetupNotice } from './setup-notice.js'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  version: string
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  totalCost: number
  queryCount: number
  recentTopics: { command: string; topic: string; latest: number }[]
}

export function WelcomeView({
  version,
  grokStatus,
  xApiStatus,
  totalCost,
  queryCount,
  recentTopics,
}: Props) {
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 80
  const isNarrow = columns < 70
  const needsSetup = grokStatus === 'no-key'

  return (
    <Box flexDirection="column">
      <WelcomeHeader version={version} />
      <Box paddingLeft={2} paddingTop={1}>
        {needsSetup ? (
          <SetupNotice />
        ) : (
          <Box flexDirection={isNarrow ? 'column' : 'row'} gap={2}>
            <StatusPanel
              grokStatus={grokStatus}
              xApiStatus={xApiStatus}
              totalCost={totalCost}
              queryCount={queryCount}
            />
            <QuickStartPanel recentTopics={recentTopics} />
          </Box>
        )}
      </Box>
    </Box>
  )
}
