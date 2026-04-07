import React from 'react'
import { Box, Text } from 'ink'
import { relativeTime } from '../utils/relative-time.js'

interface Props {
  recentTopics: { command: string; topic: string; latest: number }[]
}

const TIPS = [
  { cmd: 'grow "topic"', desc: 'daily workflow: hooks, draft, timing' },
  { cmd: 'scan "topic"', desc: 'what\'s being said and what to do' },
  { cmd: 'agent "question"', desc: 'deep research via Grok' },
  { cmd: 'profile @handle', desc: 'algorithm score and strategy' },
]

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

export function QuickStartPanel({ recentTopics }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#4A1F8A" paddingX={1}>
      <Text bold dimColor>Try</Text>
      {TIPS.map((tip, i) => (
        <Box key={`tip-${i}`}>
          <Text color="#7C3AED" bold>{tip.cmd.padEnd(22)}</Text>
          <Text dimColor>{tip.desc}</Text>
        </Box>
      ))}

      {recentTopics.length > 0 && (
        <>
          <Text> </Text>
          <Text bold dimColor>Recent</Text>
          {recentTopics.slice(0, 3).map((t, i) => (
            <Box key={`recent-${i}`}>
              <Text color="#7C3AED">{t.command.padEnd(8)}</Text>
              <Text>{truncate(t.topic, 30).padEnd(33)}</Text>
              <Text dimColor>{relativeTime(t.latest)}</Text>
            </Box>
          ))}
        </>
      )}

      <Text> </Text>
      <Text dimColor>Just type a question. Corvus will figure out the rest.</Text>
    </Box>
  )
}
