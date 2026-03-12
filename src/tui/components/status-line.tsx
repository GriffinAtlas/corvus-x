import React from 'react'
import { Box, Text } from 'ink'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  totalCost: number
  queryCount: number
}

const STATUS_DISPLAY: Record<GrokStatus | XApiStatus, { dot: string; color: string; label: string }> = {
  connected: { dot: '●', color: 'green', label: 'ready' },
  error: { dot: '●', color: 'red', label: 'error' },
  optional: { dot: '○', color: 'yellow', label: 'not set' },
  'no-key': { dot: '○', color: 'gray', label: 'no key' },
}

export function StatusLine({ grokStatus, xApiStatus, totalCost, queryCount }: Props) {
  const grok = STATUS_DISPLAY[grokStatus]
  const xApi = STATUS_DISPLAY[xApiStatus]

  return (
    <Box paddingLeft={2} marginBottom={0}>
      <Text dimColor>{'╶ '}</Text>
      <Text color={grok.color}>{grok.dot}</Text>
      <Text dimColor>{' Grok '}</Text>
      <Text color={grok.color}>{grok.label}</Text>
      <Text dimColor>{'  '}</Text>
      <Text color={xApi.color}>{xApi.dot}</Text>
      <Text dimColor>{' X API '}</Text>
      <Text color={xApi.color}>{xApi.label}</Text>
      <Text dimColor>{'  ╴  '}</Text>
      <Text color="#7C3AED">{`$${totalCost.toFixed(3)}`}</Text>
      <Text dimColor>{'  ·  '}</Text>
      <Text dimColor>{`${queryCount} ${queryCount === 1 ? 'query' : 'queries'}`}</Text>
    </Box>
  )
}
