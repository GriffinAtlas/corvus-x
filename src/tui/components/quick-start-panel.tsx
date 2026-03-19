import React from 'react'
import { Box, Text } from 'ink'
import { relativeTime } from '../utils/relative-time.js'

interface Props {
  recentTopics: { command: string; topic: string; latest: number }[]
}

const TIPS = [
  { cmd: 'scan "AI agents"', desc: 'snapshot X discourse' },
  { cmd: 'pulse bitcoin', desc: 'sentiment analysis' },
  { cmd: 'trace "lab leak"', desc: 'narrative spread' },
  { cmd: 'hooks "typescript"', desc: 'find reply opportunities' },
  { cmd: 'draft "AI agents"', desc: 'draft a post in your voice' },
  { cmd: 'profile @username', desc: 'content strategy analysis' },
  { cmd: 'review', desc: 'what worked this week' },
]

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

export function QuickStartPanel({ recentTopics }: Props) {
  const showRecent = recentTopics.length > 0

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#4A1F8A"
      paddingX={1}
    >
      <Text bold dimColor>{showRecent ? 'Recent activity' : 'Quick start'}</Text>
      {showRecent ? (
        recentTopics.map((t, i) => (
          <Box key={i}>
            <Text color="#7C3AED">{t.command.padEnd(8)}</Text>
            <Text>{truncate(t.topic, 35).padEnd(38)}</Text>
            <Text dimColor>{relativeTime(t.latest)}</Text>
          </Box>
        ))
      ) : (
        TIPS.map((tip, i) => (
          <Box key={i}>
            <Text color="#7C3AED" bold>{tip.cmd.padEnd(26)}</Text>
            <Text dimColor>{tip.desc}</Text>
          </Box>
        ))
      )}
      <Text> </Text>
      <Text dimColor>/help  /cost  /clear  /exit</Text>
    </Box>
  )
}
