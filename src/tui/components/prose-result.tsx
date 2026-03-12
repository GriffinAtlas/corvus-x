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
    <Box
      flexDirection="column"
      marginLeft={2}
      marginBottom={1}
      borderStyle="round"
      borderColor="#4A1F8A"
      paddingX={1}
    >
      <Text>{text}</Text>
      {truncated && truncated > 0 && (
        <Box>
          <Text dimColor>{`  ... ${truncated} more lines · /view ${(index ?? 0) + 1}`}</Text>
        </Box>
      )}
      <Box marginTop={0}>
        <Text dimColor>{`$${cost.toFixed(4)}`}</Text>
      </Box>
    </Box>
  )
}
