import React from 'react'
import { Box, Text } from 'ink'
import { CROW_SMALL_LINES, LOGO_LINES } from '../../cli/theme.js'

interface Props {
  version: string
}

const CROW_COLORS = [
  '#3A1078', '#4A1990', '#5522A8', '#602BBF',
  '#6E33C6', '#7C3AED', '#8B4FFF', '#9F67FF',
]

const LOGO_COLORS = ['#9F67FF', '#B48AFF', '#C9A5FF']

export function WelcomeHeader({ version }: Props) {
  return (
    <Box flexDirection="column" paddingLeft={1} paddingTop={1}>
      <Box flexDirection="row" alignItems="flex-start">
        {/* Crow art with gradient */}
        <Box flexDirection="column">
          {CROW_SMALL_LINES.map((line, i) => (
            <Text key={i} color={CROW_COLORS[i % CROW_COLORS.length]}>{line}</Text>
          ))}
        </Box>

        {/* Logo + tagline */}
        <Box flexDirection="column" paddingLeft={3} paddingTop={2}>
          {LOGO_LINES.map((line, i) => (
            <Text key={i} color={LOGO_COLORS[i % LOGO_COLORS.length]}>{line}</Text>
          ))}
          <Text> </Text>
          <Text dimColor>      investigate X · grow your presence</Text>
          <Text dimColor>      v{version}</Text>
        </Box>
      </Box>
    </Box>
  )
}
