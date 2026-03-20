import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  refId?: string
  text: string
  cost: number
  truncated?: number
  index?: number
}

export function ProseResult({ refId, text, truncated, index }: Props) {
  return (
    <Box flexDirection="column" marginLeft={1} marginBottom={1}>
      {refId && (
        <Box marginLeft={2}>
          <Text dimColor>{`[${refId}]`}</Text>
        </Box>
      )}
      <Box marginLeft={2}>
        <Text>{text}</Text>
      </Box>
      {(truncated ?? 0) > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>{`... ${truncated} more lines · /view ${refId ?? (index ?? 0) + 1}`}</Text>
        </Box>
      )}
    </Box>
  )
}
