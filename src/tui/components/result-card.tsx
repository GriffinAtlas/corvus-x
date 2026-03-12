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
    <Box flexDirection="column" paddingLeft={1} marginBottom={1}>
      <Text>
        <Text dimColor>{'── '}</Text>
        <Text bold color="magenta">{command}</Text>
        <Text dimColor>{` · ${topic} `}</Text>
        <Text dimColor>{'──'}</Text>
      </Text>
      <Text>{rendered}</Text>
      <Text dimColor>{`  $${cost.toFixed(3)} · ${elapsedStr}`}</Text>
    </Box>
  )
}
