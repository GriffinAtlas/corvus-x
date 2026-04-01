import React from 'react'
import { Box, Text, useStdout } from 'ink'
import {
  CROW_SMALL_LINES, LOGO_LINES, LOGO_LARGE_LINES,
  CROW_COLORS, LOGO_LARGE_COLORS, LOGO_SMALL_COLORS,
} from '../../cli/theme.js'

interface Props {
  version: string
}

export function WelcomeHeader({ version }: Props) {
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 80
  const useLarge = columns >= 80

  return (
    <Box flexDirection="column" paddingLeft={1} paddingTop={1}>
      <Box flexDirection="row" alignItems="flex-start">
        <Box flexDirection="column">
          {CROW_SMALL_LINES.map((line, i) => (
            <Text key={`crow-${i}`} color={CROW_COLORS[i % CROW_COLORS.length]}>{line}</Text>
          ))}
        </Box>

        <Box flexDirection="column" paddingLeft={2} paddingTop={useLarge ? 0 : 2}>
          {useLarge ? (
            LOGO_LARGE_LINES.map((line, i) => (
              <Text key={`logo-lg-${i}`} color={LOGO_LARGE_COLORS[i % LOGO_LARGE_COLORS.length]}>{line}</Text>
            ))
          ) : (
            LOGO_LINES.map((line, i) => (
              <Text key={`logo-sm-${i}`} color={LOGO_SMALL_COLORS[i % LOGO_SMALL_COLORS.length]}>{line}</Text>
            ))
          )}
          <Text> </Text>
          <Text dimColor>  investigate X · grow your presence · v{version}</Text>
        </Box>
      </Box>
    </Box>
  )
}
