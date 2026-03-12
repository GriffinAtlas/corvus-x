import React from 'react'
import { Text } from 'ink'

interface Props {
  type: 'error' | 'warning' | 'info'
  message: string
}

const PREFIXES = {
  error: '✗',
  warning: '!',
  info: '→',
} as const

const COLORS = {
  error: 'red',
  warning: 'yellow',
  info: 'gray',
} as const

export function SystemNotice({ type, message }: Props) {
  return (
    <Text color={COLORS[type]}>
      {`  ${PREFIXES[type]} ${message}`}
    </Text>
  )
}
