import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { TextInput } from '@inkjs/ui'
import { COMMAND_KEYWORDS } from '../router.js'

interface Props {
  onSubmit: (value: string) => void
  isLoading: boolean
}

const SUGGESTIONS = [
  ...COMMAND_KEYWORDS,
  '/help',
  '/cost',
  '/history',
  '/clear',
  '/exit',
]

export function InputBar({ onSubmit, isLoading }: Props) {
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  // Incrementing mountKey forces TextInput to remount with a new defaultValue
  // when navigating history, since defaultValue is only read on mount.
  const [mountKey, setMountKey] = useState(0)
  const [value, setValue] = useState('')

  useInput((_input, key) => {
    if (isLoading) return

    if (key.upArrow && inputHistory.length > 0) {
      const newIndex = Math.min(historyIndex + 1, inputHistory.length - 1)
      setHistoryIndex(newIndex)
      setValue(inputHistory[inputHistory.length - 1 - newIndex])
      setMountKey((k) => k + 1)
    }

    if (key.downArrow && historyIndex >= 0) {
      if (historyIndex <= 0) {
        setHistoryIndex(-1)
        setValue('')
      } else {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setValue(inputHistory[inputHistory.length - 1 - newIndex])
      }
      setMountKey((k) => k + 1)
    }

    if (key.escape) {
      setValue('')
      setHistoryIndex(-1)
      setMountKey((k) => k + 1)
    }
  })

  function handleSubmit(submitted: string) {
    const trimmed = submitted.trim()
    if (!trimmed) return
    setInputHistory((prev) => [...prev, trimmed])
    setHistoryIndex(-1)
    setValue('')
    setMountKey((k) => k + 1)
    onSubmit(trimmed)
  }

  if (isLoading) {
    return (
      <Box paddingLeft={1}>
        <Text dimColor>{'… '}</Text>
      </Box>
    )
  }

  return (
    <Box paddingLeft={1}>
      <Text color="magenta">{'❯ '}</Text>
      <TextInput
        key={mountKey}
        placeholder="scan, pulse, trace, ask, or just type..."
        suggestions={SUGGESTIONS}
        defaultValue={value}
        onSubmit={handleSubmit}
      />
    </Box>
  )
}
