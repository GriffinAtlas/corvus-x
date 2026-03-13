import React from 'react'
import { Box, Text } from 'ink'

const SHORTCUTS = [
  { key: 'Shift+↑↓', desc: 'scroll' },
  { key: 'Alt+↑↓', desc: 'top/bottom' },
  { key: 'Tab', desc: 'autocomplete' },
  { key: '↑↓', desc: 'history' },
  { key: 'Esc', desc: 'clear' },
  { key: 'Ctrl+C', desc: 'quit' },
]

export function ShortcutBar() {
  return (
    <Box paddingLeft={2} marginTop={0}>
      {SHORTCUTS.map((s, i) => (
        <Text key={i}>
          {i > 0 && <Text dimColor>{'  ·  '}</Text>}
          <Text color="#7C3AED">{s.key}</Text>
          <Text dimColor>{` ${s.desc}`}</Text>
        </Text>
      ))}
    </Box>
  )
}
