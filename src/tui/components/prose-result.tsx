import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  text: string
  cost: number
}

export function ProseResult({ text, cost }: Props) {
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
      <Box marginTop={0}>
        <Text dimColor>{`$${cost.toFixed(4)}`}</Text>
      </Box>
    </Box>
  )
}
