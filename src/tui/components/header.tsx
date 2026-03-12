import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  version: string
  firstRun: boolean
}

// Gradient purple palette — dark to bright to dark
const GRAD = [
  '#4A1F8A',
  '#5C29A8',
  '#6E33C6',
  '#7C3AED',
  '#9F67FF',
  '#B48AFF',
  '#9F67FF',
  '#7C3AED',
]

const CROW = [
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⣄⣀⣀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣼⣿⣿⡿⠋⠉⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣴⣿⣿⣿⣿⣿⡿⠁⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⢀⣠⣾⣿⣿⣿⣿⣿⣿⠟⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⢀⣴⣿⣿⣿⠿⠿⣿⣿⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⡪⠕⠋⠉⠉⠀⠀⠀⠫⡻⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⠷⠤⠀⠀⠀⠀⠀⠀⠀⠀⠀',
]

const LOGO = [
  '╔═╗╔═╗╦═╗╦  ╦╦ ╦╔═╗',
  '║  ║ ║╠╦╝╚╗╔╝║ ║╚═╗',
  '╚═╝╚═╝╩╚═ ╚╝ ╚═╝╚═╝',
]

export function Header({ version, firstRun }: Props) {
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1} marginBottom={1}>
      {/* Crow with gradient — each line a different shade */}
      {CROW.map((line, i) => (
        <Text key={`c-${i}`} color={GRAD[i % GRAD.length]}>{line}</Text>
      ))}

      <Text> </Text>

      {/* CORVUS block logo — bright accent */}
      {LOGO.map((line, i) => (
        <Text key={`l-${i}`} color="#B48AFF" bold>{`  ${line}`}</Text>
      ))}

      {/* Version + tagline */}
      <Box paddingLeft={2} marginTop={1}>
        <Text color="#7C3AED" bold>{`v${version}`}</Text>
        <Text dimColor>{' — X intelligence agent'}</Text>
      </Box>

      {firstRun && (
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          <Box marginBottom={0}>
            <Text color="#9F67FF">{'┌─ '}</Text>
            <Text color="#9F67FF" bold>Getting started</Text>
          </Box>
          <Text color="#9F67FF">{'│'}</Text>
          <Box>
            <Text color="#9F67FF">{'│  '}</Text>
            <Text dimColor>{'1. '}</Text>
            <Text>{'corvus auth setup'}</Text>
            <Text dimColor>{'  — set your Grok API key'}</Text>
          </Box>
          <Box>
            <Text color="#9F67FF">{'│  '}</Text>
            <Text dimColor>{'2. '}</Text>
            <Text>{'scan bitcoin'}</Text>
            <Text dimColor>{'          — try a topic scan'}</Text>
          </Box>
          <Box>
            <Text color="#9F67FF">{'│  '}</Text>
            <Text dimColor>{'3. '}</Text>
            <Text>{'agent "your question"'}</Text>
            <Text dimColor>{' — autonomous investigation'}</Text>
          </Box>
          <Text color="#9F67FF">{'│'}</Text>
          <Box>
            <Text color="#9F67FF">{'│  '}</Text>
            <Text dimColor>{'Commands: '}</Text>
            <Text color="#B48AFF">{'scan'}</Text>
            <Text dimColor>{' · '}</Text>
            <Text color="#B48AFF">{'pulse'}</Text>
            <Text dimColor>{' · '}</Text>
            <Text color="#B48AFF">{'trace'}</Text>
            <Text dimColor>{' · '}</Text>
            <Text color="#B48AFF">{'gather'}</Text>
            <Text dimColor>{' · '}</Text>
            <Text color="#B48AFF">{'read'}</Text>
            <Text dimColor>{' · '}</Text>
            <Text color="#B48AFF">{'scope'}</Text>
            <Text dimColor>{' · '}</Text>
            <Text color="#B48AFF">{'ask'}</Text>
            <Text dimColor>{' · '}</Text>
            <Text color="#B48AFF">{'agent'}</Text>
          </Box>
          <Text color="#9F67FF">{'└─'}</Text>
        </Box>
      )}

      {/* Divider */}
      <Box paddingLeft={2} marginTop={1}>
        <Text dimColor>{'─'.repeat(44)}</Text>
      </Box>
    </Box>
  )
}
