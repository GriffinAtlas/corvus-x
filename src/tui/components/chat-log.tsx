import React from 'react'
import { Box, Text } from 'ink'
import { ProseResult } from './prose-result.js'
import { ResultCard } from './result-card.js'
import { SystemNotice } from './system-notice.js'
import type { ChatEntry } from '../hooks/use-session.js'

interface Props {
  entries: ChatEntry[]
}

function renderEntry(entry: ChatEntry, index: number) {
  switch (entry.type) {
    case 'user':
      return (
        <Box key={index} paddingLeft={1} marginBottom={0}>
          <Text color="magenta" bold>{'❯ '}</Text>
          <Text>{entry.text}</Text>
        </Box>
      )
    case 'result':
      return (
        <ResultCard
          key={index}
          command={entry.command}
          topic={entry.topic}
          rendered={entry.rendered}
          cost={entry.cost}
          elapsed={entry.elapsed}
        />
      )
    case 'prose':
      return <ProseResult key={index} text={entry.text} cost={entry.cost} />
    case 'error':
      return <SystemNotice key={index} type="error" message={entry.message} />
    case 'system':
      return <SystemNotice key={index} type="info" message={entry.message} />
  }
}

export function ChatLog({ entries }: Props) {
  if (entries.length === 0) return null

  return (
    <Box flexDirection="column">
      {entries.map(renderEntry)}
    </Box>
  )
}
