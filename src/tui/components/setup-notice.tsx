import React from 'react'
import { Box, Text } from 'ink'

export function SetupNotice() {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#4A1F8A"
      paddingX={1}
    >
      <Text>
        Run <Text color="#B48AFF" bold>corvus auth setup</Text> to connect your Grok API key.
      </Text>
      <Text dimColor>Get one at https://console.x.ai</Text>
    </Box>
  )
}
