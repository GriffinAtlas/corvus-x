import React from 'react'
import { Box, Text } from 'ink'
import type { GrokStatus, XApiStatus } from '../hooks/use-session.js'

interface Props {
  grokStatus: GrokStatus
  xApiStatus: XApiStatus
  totalCost: number
  queryCount: number
}

const STATUS_COLORS: Record<string, string> = {
  connected: '#22C55E',
  error: '#EF4444',
  optional: '#F59E0B',
  'no-key': '#6B7280',
}

const STATUS_LABELS: Record<string, string> = {
  connected: 'connected',
  error: 'error',
  optional: 'not set',
  'no-key': 'no key',
}

function StatusDot({ status, label }: { status: string; label: string }) {
  const color = STATUS_COLORS[status] ?? '#6B7280'
  const dot = status === 'connected' || status === 'error' ? '●' : '○'
  const statusLabel = STATUS_LABELS[status] ?? 'unknown'
  return (
    <Box>
      <Text color={color}>{dot}</Text>
      <Text dimColor>{` ${label}  `}</Text>
      <Text color={color}>{statusLabel}</Text>
    </Box>
  )
}

export function StatusPanel({ grokStatus, xApiStatus, totalCost, queryCount }: Props) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#4A1F8A"
      paddingX={1}
    >
      <Text bold dimColor>Status</Text>
      <StatusDot status={grokStatus} label="Grok " />
      <StatusDot status={xApiStatus} label="X API" />
      <Text dimColor>
        {`$${totalCost.toFixed(3)} · ${queryCount} ${queryCount === 1 ? 'query' : 'queries'}`}
      </Text>
    </Box>
  )
}
