import React from 'react'
import { Box, Text } from 'ink'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  totalCost: number
  queryCount: number
}

function statusColor(status: GrokStatus | XApiStatus): string {
  switch (status) {
    case 'connected': return 'green'
    case 'error': return 'red'
    case 'optional': return 'yellow'
    case 'no-key': return 'gray'
  }
}

function statusLabel(status: GrokStatus | XApiStatus): string {
  switch (status) {
    case 'connected': return 'connected'
    case 'error': return 'error'
    case 'optional': return 'optional'
    case 'no-key': return 'no key'
  }
}

export function StatusLine({ grokStatus, xApiStatus, totalCost, queryCount }: Props) {
  return (
    <Box paddingLeft={1}>
      <Text dimColor>Grok: </Text>
      <Text color={statusColor(grokStatus)}>{statusLabel(grokStatus)}</Text>
      <Text dimColor>{'  │  X API: '}</Text>
      <Text color={statusColor(xApiStatus)}>{statusLabel(xApiStatus)}</Text>
      <Text dimColor>{'  │  '}</Text>
      <Text dimColor>{`$${totalCost.toFixed(3)}`}</Text>
      <Text dimColor>{'  │  '}</Text>
      <Text dimColor>{`${queryCount} ${queryCount === 1 ? 'query' : 'queries'}`}</Text>
    </Box>
  )
}
