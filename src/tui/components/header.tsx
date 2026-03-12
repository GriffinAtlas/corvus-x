import React from 'react'
import { Box, Text } from 'ink'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  version: string
  firstRun: boolean
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
}

const LOGO = [
  '╔═╗╔═╗╦═╗╦  ╦╦ ╦╔═╗',
  '║  ║ ║╠╦╝╚╗╔╝║ ║╚═╗',
  '╚═╝╚═╝╩╚═ ╚╝ ╚═╝╚═╝',
]

const TIPS = [
  { cmd: 'scan bitcoin', desc: 'snapshot a topic' },
  { cmd: 'pulse ethereum', desc: 'sentiment analysis' },
  { cmd: 'agent "your question"', desc: 'autonomous investigation' },
  { cmd: 'scope elonmusk', desc: 'profile an account' },
]

function StatusDot({ status, label }: { status: GrokStatus | XApiStatus; label: string }) {
  const connected = status === 'connected'
  return (
    <Text>
      <Text color={connected ? 'green' : 'gray'}>{connected ? '●' : '○'}</Text>
      <Text dimColor>{` ${label} `}</Text>
    </Text>
  )
}

export function Header({ version, firstRun, grokStatus, xApiStatus }: Props) {
  const needsSetup = grokStatus === 'no-key'

  return (
    <Box flexDirection="column" paddingLeft={1} paddingTop={1}>
      {/* Logo */}
      {LOGO.map((line, i) => (
        <Text key={`l-${i}`} color="#7C3AED" bold>{`  ${line}`}</Text>
      ))}

      {/* Version + status dots on one line */}
      <Box paddingLeft={2} marginTop={0}>
        <Text dimColor>{`v${version}`}</Text>
        <Text dimColor>{'  '}</Text>
        <StatusDot status={grokStatus} label="grok" />
        <StatusDot status={xApiStatus} label="x api" />
      </Box>

      {/* Divider */}
      <Box paddingLeft={2} marginTop={1}>
        <Text dimColor>{'─'.repeat(40)}</Text>
      </Box>

      {/* Welcome / setup message */}
      <Box paddingLeft={2} marginTop={1} marginBottom={1}>
        {needsSetup ? (
          <Box flexDirection="column">
            <Text>Run <Text color="#B48AFF" bold>corvus auth setup</Text> to connect your Grok API key.</Text>
            <Text dimColor>Get one at https://console.x.ai</Text>
          </Box>
        ) : firstRun ? (
          <Box flexDirection="column">
            <Text>Ready. Try one of these:</Text>
            <Text> </Text>
            {TIPS.map((tip, i) => (
              <Box key={i}>
                <Text>  </Text>
                <Text color="#B48AFF">{tip.cmd.padEnd(24)}</Text>
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
