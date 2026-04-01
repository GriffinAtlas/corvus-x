import React from 'react'
import { Box, Text } from 'ink'

export function ShortcutBar() {
  return (
    <Box paddingLeft={2}>
      <Text dimColor>
        {'Shift+↑↓ scroll  ·  Alt+↑↓ top/bottom  ·  Tab autocomplete  ·  ↑↓ history  ·  Esc clear  ·  Ctrl+C quit'}
      </Text>
    </Box>
  )
}
