import React from 'react'
import { Box, Text, useStdout } from 'ink'
import { StatusPanel } from './status-panel.js'
import { QuickStartPanel } from './quick-start-panel.js'
import { SetupNotice } from './setup-notice.js'
import { CROW_SMALL_LINES, LOGO_LARGE_LINES, LOGO_LINES } from '../../cli/theme.js'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  version: string
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  recentTopics: { command: string; topic: string; latest: number }[]
}

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

  // Show big crow art only if terminal is tall enough
  const showBigHeader = rows >= 30

  return (
    <Box flexDirection="column">
      {showBigHeader ? (
        <BigHeader version={version} columns={columns} />
      ) : (
        <Box paddingLeft={2} paddingTop={1}>
          <Text dimColor>investigate X · grow your presence</Text>
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

function BigHeader({ version, columns }: { version: string; columns: number }) {
  const useLarge = columns >= 80

  const CROW_COLORS = [
    '#3A1078', '#4A1990', '#5522A8', '#602BBF',
    '#6E33C6', '#7C3AED', '#8B4FFF', '#9F67FF',
  ]
  const LOGO_LARGE_COLORS = ['#5C29A8', '#6E33C6', '#7C3AED', '#8B4FFF', '#9F67FF', '#B48AFF']
  const LOGO_SMALL_COLORS = ['#9F67FF', '#B48AFF', '#C9A5FF']

  return (
    <Box flexDirection="column" paddingLeft={1} paddingTop={1}>
      <Box flexDirection="row" alignItems="flex-start">
        <Box flexDirection="column">
          {CROW_SMALL_LINES.map((line: string, i: number) => (
            <Text key={i} color={CROW_COLORS[i % CROW_COLORS.length]}>{line}</Text>
          ))}
        </Box>
        <Box flexDirection="column" paddingLeft={2} paddingTop={useLarge ? 0 : 2}>
          {useLarge ? (
            LOGO_LARGE_LINES.map((line: string, i: number) => (
              <Text key={i} color={LOGO_LARGE_COLORS[i % LOGO_LARGE_COLORS.length]}>{line}</Text>
            ))
          ) : (
            LOGO_LINES.map((line: string, i: number) => (
              <Text key={i} color={LOGO_SMALL_COLORS[i % LOGO_SMALL_COLORS.length]}>{line}</Text>
            ))
          )}
          <Text> </Text>
          <Text dimColor>  investigate X · grow your presence · v{version}</Text>
        </Box>
      </Box>
    </Box>
  )
}
