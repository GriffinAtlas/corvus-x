import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  refId?: string
  command: string
  topic: string
  rendered: string
  cost: number
  elapsed: number
  truncated?: number
  index?: number
}

export function ResultCard({ refId, command, topic, rendered, cost, elapsed, truncated, index }: Props) {
  const elapsedStr = `${(elapsed / 1000).toFixed(1)}s`

  return (
    <Box flexDirection="column" marginLeft={1} marginBottom={1}>
      <Box>
        <Text color="#7C3AED" bold>{'▸ '}</Text>
        {refId && <Text dimColor>{`[${refId}] `}</Text>}
        <Text bold color="#B48AFF">{command}</Text>
        <Text dimColor>{` · ${topic}`}</Text>
        <Text dimColor>{'  '}</Text>
        <Text dimColor>{elapsedStr}</Text>
      </Box>
      <Box marginTop={0} marginLeft={2}>
        <Text>{rendered.endsWith('\n') ? rendered.slice(0, -1) : rendered}</Text>
      </Box>
      {(truncated ?? 0) > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>{`... ${truncated} more lines · /view ${refId ?? (index ?? 0) + 1}`}</Text>
        </Box>
      )}
    </Box>
  )
}
