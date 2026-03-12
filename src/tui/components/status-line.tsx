import React from 'react'
import { Box, Text } from 'ink'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  totalCost: number
  queryCount: number
}

const STATUS_INFO: Record<GrokStatus | XApiStatus, { color: string; label: string }> = {
  connected: { color: 'green', label: 'connected' },
  error: { color: 'red', label: 'error' },
  optional: { color: 'yellow', label: 'optional' },
  'no-key': { color: 'gray', label: 'no key' },
}

export function StatusLine({ grokStatus, xApiStatus, totalCost, queryCount }: Props) {
  const grok = STATUS_INFO[grokStatus]
  const xApi = STATUS_INFO[xApiStatus]

  return (
    <Box paddingLeft={1}>
      <Text dimColor>Grok: </Text>
      <Text color={grok.color}>{grok.label}</Text>
      <Text dimColor>{'  │  X API: '}</Text>
      <Text color={xApi.color}>{xApi.label}</Text>
      <Text dimColor>{'  │  '}</Text>
      <Text dimColor>{`$${totalCost.toFixed(3)}`}</Text>
      <Text dimColor>{'  │  '}</Text>
      <Text dimColor>{`${queryCount} ${queryCount === 1 ? 'query' : 'queries'}`}</Text>
    </Box>
  )
}
