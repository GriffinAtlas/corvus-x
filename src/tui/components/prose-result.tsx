import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  text: string
  cost: number
  truncated?: number
  index?: number
}

export function ProseResult({ text, cost, truncated, index }: Props) {
  return (
    <Box flexDirection="column" marginLeft={1} marginBottom={1}>
      <Box marginLeft={2}>
        <Text>{text}</Text>
      </Box>
      {(truncated ?? 0) > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>{`... ${truncated} more lines · /view ${(index ?? 0) + 1}`}</Text>
        </Box>
      )}
      <Box marginLeft={2} marginTop={0}>
        <Text dimColor>{`$${cost.toFixed(4)}`}</Text>
      </Box>
    </Box>
  )
}
