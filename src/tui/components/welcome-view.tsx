import React from 'react'
import { Box, Text } from 'ink'
import { StatusPanel } from './status-panel.js'
import { QuickStartPanel } from './quick-start-panel.js'
import { SetupNotice } from './setup-notice.js'
import { WelcomeHeader } from './welcome-header.js'
import { LOGO_LINES, LOGO_SMALL_COLORS } from '../../cli/theme.js'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  version: string
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  recentTopics: { command: string; topic: string; latest: number }[]
  columns: number
  rows: number
}


export function WelcomeView({
  version,
  grokStatus,
  xApiStatus,
  recentTopics,
  columns,
  rows,
}: Props) {
  const isNarrow = columns < 70
  const needsSetup = grokStatus === 'no-key'

  const showBigHeader = rows >= 26

  return (
    <Box flexDirection="column">
      {showBigHeader ? (
        <WelcomeHeader version={version} />
      ) : (
        <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
          <Box flexDirection="column">
            {LOGO_LINES.map((line: string, i: number) => (
              <Text key={`logo-${i}`} color={LOGO_SMALL_COLORS[i % LOGO_SMALL_COLORS.length]}>{line}</Text>
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
