import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  text: string
  cost: number
}

export function ProseResult({ text, cost }: Props) {
  return (
    <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
      <Text>{text}</Text>
      <Text dimColor>{`  $${cost.toFixed(4)}`}</Text>
    </Box>
  )
}
