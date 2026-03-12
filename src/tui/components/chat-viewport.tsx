import React from 'react'
import { Box, Text } from 'ink'
import { ChatLog, RESULT_MAX_LINES, PROSE_MAX_LINES } from './chat-log.js'
import type { ChatEntry } from '../hooks/use-session.js'

interface Props {
  entries: ChatEntry[]
  scrollOffset: number
  viewportHeight: number
}

// Estimate how many lines each entry type takes
function estimateEntryHeight(entry: ChatEntry): number {
  switch (entry.type) {
    case 'user':
      return 1
    case 'result': {
      const lines = entry.rendered.split('\n').length
      const cap = entry.expanded ? lines : Math.min(lines, RESULT_MAX_LINES)
      return cap + 3 // header + border + footer
    }
    case 'prose': {
      const lines = entry.text.split('\n').length
      const cap = entry.expanded ? lines : Math.min(lines, PROSE_MAX_LINES)
      return cap + 3 // border-top + border-bottom + cost footer
    }
    case 'error':
      return 1
    case 'system':
      return entry.message.split('\n').length
  }
}

export function ChatViewport({ entries, scrollOffset, viewportHeight }: Props) {
  if (entries.length === 0) return null

  // Clamp offset
  const maxOffset = Math.max(0, entries.length - 1)
  const offset = Math.min(Math.max(0, scrollOffset), maxOffset)

  // Work backwards from the end, skipping `offset` entries
  const endIndex = entries.length - offset
  let startIndex = endIndex
  let totalHeight = 0

  for (let i = endIndex - 1; i >= 0; i--) {
    const h = estimateEntryHeight(entries[i])
    if (totalHeight + h > viewportHeight && startIndex < endIndex) break
    totalHeight += h
    startIndex = i
  }

  const visibleEntries = entries.slice(startIndex, endIndex)
  const hiddenAbove = startIndex
  const hiddenBelow = offset

  return (
    <Box flexDirection="column">
      {hiddenAbove > 0 && (
        <Box paddingLeft={3}>
          <Text dimColor>{`  ↑ ${hiddenAbove} more above`}</Text>
        </Box>
      )}
      <ChatLog entries={visibleEntries} startIndex={startIndex} />
      {hiddenBelow > 0 && (
        <Box paddingLeft={3}>
          <Text dimColor>{`  ↓ ${hiddenBelow} more below`}</Text>
        </Box>
      )}
    </Box>
  )
}
