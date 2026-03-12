import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  command: string
  topic: string
  rendered: string
  cost: number
  elapsed: number
}

export function ResultCard({ command, topic, rendered, cost, elapsed }: Props) {
  const elapsedStr = `${(elapsed / 1000).toFixed(1)}s`

  return (
    <Box
      flexDirection="column"
      marginLeft={2}
      marginBottom={1}
      borderStyle="round"
      borderColor="#4A1F8A"
      paddingX={1}
    >
      <Box>
        <Text bold color="#B48AFF">{command}</Text>
        <Text dimColor>{` · ${topic}`}</Text>
        <Text dimColor>{'  '}</Text>
        <Text dimColor>{`${elapsedStr} · $${cost.toFixed(3)}`}</Text>
      </Box>
      <Box marginTop={0}>
        <Text>{rendered}</Text>
      </Box>
    </Box>
  )
}
