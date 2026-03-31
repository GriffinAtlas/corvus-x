import React, { useState, useEffect } from 'react'
import { Box, Text, useStdout } from 'ink'
import { CROW_SMALL_LINES, LOGO_LINES, LOGO_LARGE_LINES } from '../../cli/theme.js'

interface Props {
  version: string
}

const WAVE_COLORS = [
  '#4A1990', '#5C29A8', '#6E33C6', '#7C3AED',
  '#8B4FFF', '#9F67FF', '#B48AFF', '#C9A5FF',
  '#B48AFF', '#9F67FF', '#8B4FFF', '#7C3AED',
  '#6E33C6', '#5C29A8',
]

const LOGO_LARGE_COLORS = [
  '#5C29A8', '#6E33C6', '#7C3AED',
  '#8B4FFF', '#9F67FF', '#B48AFF',
]

const LOGO_SMALL_COLORS = ['#9F67FF', '#B48AFF', '#C9A5FF']

export function WelcomeHeader({ version }: Props) {
  const { stdout } = useStdout()
  const columns = stdout?.columns ?? 80
  const useLarge = columns >= 80
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % WAVE_COLORS.length)
    }, 200)
    return () => clearInterval(timer)
  }, [])

  return (
    <Box flexDirection="column" paddingLeft={1} paddingTop={1}>
      <Box flexDirection="row" alignItems="flex-start">
        {/* Animated crow — wave cycles through gradient */}
        <Box flexDirection="column">
          {CROW_SMALL_LINES.map((line, i) => (
            <Text key={i} color={WAVE_COLORS[(frame + i) % WAVE_COLORS.length]}>{line}</Text>
          ))}
        </Box>

        {/* Logo + tagline */}
        <Box flexDirection="column" paddingLeft={2} paddingTop={useLarge ? 1 : 2}>
          {useLarge ? (
            LOGO_LARGE_LINES.map((line, i) => (
              <Text key={i} color={LOGO_LARGE_COLORS[i % LOGO_LARGE_COLORS.length]}>{line}</Text>
            ))
          ) : (
            LOGO_LINES.map((line, i) => (
              <Text key={i} color={LOGO_SMALL_COLORS[i % LOGO_SMALL_COLORS.length]}>{line}</Text>
            ))
          )}
          <Text> </Text>
          <Text dimColor>  investigate X · grow your presence · v{version}</Text>
        </Box>
      </Box>
    </Box>
  )
}
