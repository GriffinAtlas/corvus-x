import React from 'react'
import { Box, Text } from 'ink'
import { CROW_SMALL_LINES, LOGO_LINES } from '../../cli/theme.js'

interface Props {
  version: string
}

export function WelcomeHeader({ version }: Props) {
  return (
    <Box flexDirection="column" paddingLeft={1} paddingTop={1}>
      <Box flexDirection="row" alignItems="flex-start">
        {/* Crow art */}
        <Box flexDirection="column">
          {CROW_SMALL_LINES.map((line, i) => (
            <Text key={i} color="#7C3AED">{line}</Text>
          ))}
        </Box>

        {/* Logo + tagline */}
        <Box flexDirection="column" paddingLeft={3} paddingTop={2}>
          {LOGO_LINES.map((line, i) => (
            <Text key={i} color="#7C3AED">{line}</Text>
          ))}
          <Text> </Text>
          <Text dimColor>      investigate X · grow your presence</Text>
          <Text dimColor>      v{version}</Text>
        </Box>
      </Box>
    </Box>
  )
}
