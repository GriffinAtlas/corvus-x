import React from 'react'
import { Box, Text } from 'ink'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  version: string
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  totalCost: number
  queryCount: number
}

export function CompactHeader({ version, grokStatus, xApiStatus, totalCost, queryCount }: Props) {
  const grokDot = grokStatus === 'connected' ? '●' : grokStatus === 'error' ? '●' : '○'
  const grokColor = grokStatus === 'connected' ? '#22C55E' : grokStatus === 'error' ? '#EF4444' : '#6B7280'
  const xDot = xApiStatus === 'connected' ? '●' : xApiStatus === 'error' ? '●' : '○'
  const xColor = xApiStatus === 'connected' ? '#22C55E' : xApiStatus === 'error' ? '#EF4444' : '#6B7280'

  return (
    <Box paddingLeft={2} paddingY={0}>
      <Text color="#7C3AED" bold>corvus</Text>
      <Text dimColor> v{version}  </Text>
      <Text color={grokColor}>{grokDot}</Text>
      <Text dimColor> Grok  </Text>
      <Text color={xColor}>{xDot}</Text>
      <Text dimColor> X API  </Text>
      <Text dimColor>
        {`$${totalCost.toFixed(3)} · ${queryCount} ${queryCount === 1 ? 'query' : 'queries'}`}
      </Text>
    </Box>
  )
}
