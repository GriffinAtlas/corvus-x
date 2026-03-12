import React from 'react'
import { Box, Text } from 'ink'
import Gradient from 'ink-gradient'
import BigText from 'ink-big-text'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  version: string
  firstRun: boolean
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
}

const TIPS = [
  { cmd: 'scan bitcoin', desc: 'snapshot a topic' },
  { cmd: 'pulse ethereum', desc: 'sentiment analysis' },
  { cmd: 'agent "question"', desc: 'autonomous investigation' },
  { cmd: 'scope elonmusk', desc: 'profile an account' },
]

function StatusDot({ status, label }: { status: GrokStatus | XApiStatus; label: string }) {
  const connected = status === 'connected'
  return (
    <Text>
      <Text color={connected ? 'green' : 'gray'}>{connected ? '●' : '○'}</Text>
      <Text dimColor>{` ${label}`}</Text>
    </Text>
  )
}

export function Header({ version, firstRun, grokStatus, xApiStatus }: Props) {
  const needsSetup = grokStatus === 'no-key'

  return (
    <Box flexDirection="column" paddingLeft={1} paddingTop={1}>
      {/* Gradient logo */}
      <Gradient colors={['#4A1F8A', '#7C3AED', '#B48AFF', '#7C3AED', '#4A1F8A']}>
        <BigText text="corvus" font="chrome" space={false} />
      </Gradient>

      {/* Version + status dots */}
      <Box paddingLeft={2}>
        <Text dimColor>{`v${version}`}</Text>
        <Text dimColor>{'   '}</Text>
        <StatusDot status={grokStatus} label="grok" />
        <Text dimColor>{'  '}</Text>
        <StatusDot status={xApiStatus} label="x api" />
      </Box>

      {/* Divider */}
      <Box paddingLeft={2} marginTop={1}>
        <Text dimColor>{'─'.repeat(50)}</Text>
      </Box>

      {/* Context-aware welcome */}
      <Box paddingLeft={2} marginTop={1} marginBottom={1}>
        {needsSetup ? (
          <Box flexDirection="column">
            <Text>
              Run <Text color="#B48AFF" bold>corvus auth setup</Text> to connect your Grok API key.
            </Text>
            <Text dimColor>Get one at https://console.x.ai</Text>
          </Box>
        ) : firstRun ? (
          <Box flexDirection="column">
            <Text>Ready. Try one of these:</Text>
            <Text> </Text>
            {TIPS.map((tip, i) => (
              <Box key={i}>
                <Text>{'  '}</Text>
                <Text color="#B48AFF">{tip.cmd.padEnd(22)}</Text>
                <Text dimColor>{tip.desc}</Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Text dimColor>What are you investigating?</Text>
        )}
      </Box>
    </Box>
  )
}
