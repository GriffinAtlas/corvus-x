import React from 'react'
import { Box, Text } from 'ink'
import { ProseResult } from './prose-result.js'
import { ResultCard } from './result-card.js'
import { SystemNotice } from './system-notice.js'
import type { ChatEntry } from '../hooks/use-session.js'

export const RESULT_MAX_LINES = 25
export const PROSE_MAX_LINES = 50

interface Props {
  entries: ChatEntry[]
  startIndex?: number
}

function renderEntry(entry: ChatEntry, index: number) {
  switch (entry.type) {
    case 'user':
      return (
        <Box key={index} paddingLeft={1} marginTop={1}>
          <Text color="#B48AFF" bold>{'❯ '}</Text>
          <Text bold>{entry.text}</Text>
        </Box>
      )
    case 'result': {
      const lines = entry.rendered.split('\n')
      const shouldTruncate = !entry.expanded && lines.length > RESULT_MAX_LINES
      const rendered = shouldTruncate ? lines.slice(0, RESULT_MAX_LINES).join('\n') : entry.rendered
      const truncated = shouldTruncate ? lines.length - RESULT_MAX_LINES : 0
      return (
        <ResultCard
          key={index}
          command={entry.command}
          topic={entry.topic}
          rendered={rendered}
          cost={entry.cost}
          elapsed={entry.elapsed}
          truncated={truncated}
          index={index}
        />
      )
    }
    case 'prose': {
      const lines = entry.text.split('\n')
      const shouldTruncate = !entry.expanded && lines.length > PROSE_MAX_LINES
      const text = shouldTruncate ? lines.slice(0, PROSE_MAX_LINES).join('\n') : entry.text
      const truncated = shouldTruncate ? lines.length - PROSE_MAX_LINES : 0
      return (
        <ProseResult
          key={index}
          text={text}
          cost={entry.cost}
          truncated={truncated}
          index={index}
        />
      )
    }
    case 'error':
      return <SystemNotice key={index} type="error" message={entry.message} />
    case 'system':
      return <SystemNotice key={index} type="info" message={entry.message} />
  }
}

export function ChatLog({ entries, startIndex = 0 }: Props) {
  if (entries.length === 0) return null

  return (
    <Box flexDirection="column">
      {entries.map((entry, i) => renderEntry(entry, startIndex + i))}
    </Box>
  )
}
