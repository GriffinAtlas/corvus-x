import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  version: string
  firstRun: boolean
}

const HELP_TEXT = [
  'Commands: scan, pulse, trace, gather, read, scope, ask',
  'Type naturally or use /help for more options.',
]

export function Header({ version, firstRun }: Props) {
  if (!firstRun) {
    return (
      <Box paddingLeft={1} marginBottom={1}>
        <Text bold color="magenta">corvus</Text>
        <Text dimColor>{` v${version}`}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingLeft={1} marginBottom={1}>
      <Text bold color="magenta">corvus</Text>
      <Text dimColor>{`v${version} — X intelligence agent`}</Text>
      <Text> </Text>
      {HELP_TEXT.map((line, i) => (
        <Text key={i} dimColor>{`  ${line}`}</Text>
      ))}
      <Text> </Text>
    </Box>
  )
}
