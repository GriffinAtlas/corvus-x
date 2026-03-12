import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  version: string
  firstRun: boolean
}

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

const HELP_LINES = [
  'Commands: scan, pulse, trace, gather, read, scope, ask, agent',
  'Example:  scan bitcoin  •  pulse ethereum  •  scope elonmusk',
  'Setup:    corvus auth setup  (set API keys)',
]

export function Header({ version, firstRun }: Props) {
  if (!firstRun) {
    return (
      <Box flexDirection="column" paddingLeft={1} marginBottom={1}>
        {LOGO.map((line, i) => (
          <Text key={`logo-${i}`} color="#7C3AED" bold>{`  ${line}`}</Text>
        ))}
        <Text dimColor>{`  v${version}`}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingLeft={1} marginBottom={1}>
      {CROW.map((line, i) => (
        <Text key={`crow-${i}`} color="#7C3AED">{line}</Text>
      ))}
      <Text> </Text>
      {LOGO.map((line, i) => (
        <Text key={`logo-${i}`} color="#7C3AED" bold>{`  ${line}`}</Text>
      ))}
      <Text dimColor>{`  v${version} — X intelligence agent`}</Text>
      <Text> </Text>
      {HELP_LINES.map((line, i) => (
        <Text key={`help-${i}`} dimColor>{`  ${line}`}</Text>
      ))}
      <Text> </Text>
    </Box>
  )
}
