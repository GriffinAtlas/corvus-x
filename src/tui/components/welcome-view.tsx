import React from 'react'
import { Box, Text, useStdout } from 'ink'
import { StatusPanel } from './status-panel.js'
import { QuickStartPanel } from './quick-start-panel.js'
import { SetupNotice } from './setup-notice.js'
import { WelcomeHeader } from './welcome-header.js'
import { LOGO_LINES } from '../../cli/theme.js'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  version: string
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  recentTopics: { command: string; topic: string; latest: number }[]
}

const LOGO_COLORS = ['#9F67FF', '#B48AFF', '#C9A5FF']

export function WelcomeView({
  version,
  grokStatus,
  xApiStatus,
  recentTopics,
}: Props) {
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 80
  const rows = stdout?.rows ?? 24
  const isNarrow = columns < 70
  const needsSetup = grokStatus === 'no-key'

  const showBigHeader = rows >= 26

  return (
    <Box flexDirection="column">
      {showBigHeader ? (
        <WelcomeHeader version={version} />
      ) : (
        <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
          <Box>
            {LOGO_LINES.map((line: string, i: number) => (
              <Text key={i} color={LOGO_COLORS[i % LOGO_COLORS.length]}>{i > 0 ? '\n' : ''}{line}</Text>
            ))}
          </Box>
          <Text dimColor>  investigate X · grow your presence · v{version}</Text>
        </Box>
      )}
      <Box paddingLeft={2} paddingTop={1}>
        {needsSetup ? (
          <SetupNotice />
        ) : (
          <Box flexDirection={isNarrow ? 'column' : 'row'} gap={2}>
            <StatusPanel
              grokStatus={grokStatus}
              xApiStatus={xApiStatus}
            />
            <QuickStartPanel recentTopics={recentTopics} />
          </Box>
        )}
      </Box>
    </Box>
  )
}
