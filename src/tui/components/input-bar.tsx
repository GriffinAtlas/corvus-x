import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { TextInput } from '@inkjs/ui'
import Spinner from 'ink-spinner'
import { COMMAND_KEYWORDS } from '../router.js'

interface Props {
  onSubmit: (value: string) => void
  isLoading: boolean
  phaseLabel?: string | null
}

const SUGGESTIONS = [
  ...COMMAND_KEYWORDS,
  '/help',
  '/cost',
  '/history',
  '/clear',
  '/exit',
]

const PROMPT_COLORS = ['#7C3AED', '#8B4FFF', '#9F67FF', '#B48AFF', '#9F67FF', '#8B4FFF']

export function InputBar({ onSubmit, isLoading, phaseLabel }: Props) {
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [mountKey, setMountKey] = useState(0)
  const [value, setValue] = useState('')
  const [promptFrame, setPromptFrame] = useState(0)

  useEffect(() => {
    if (isLoading) return
    const timer = setInterval(() => setPromptFrame((f) => (f + 1) % PROMPT_COLORS.length), 400)
    return () => clearInterval(timer)
  }, [isLoading])

  function setInput(text: string, index: number) {
    setValue(text)
    setHistoryIndex(index)
    setMountKey((k) => k + 1)
  }

  useInput((_input, key) => {
    if (isLoading) return

    if (key.upArrow && inputHistory.length > 0) {
      const newIndex = Math.min(historyIndex + 1, inputHistory.length - 1)
      setInput(inputHistory[inputHistory.length - 1 - newIndex], newIndex)
    }

    if (key.downArrow && historyIndex >= 0) {
      if (historyIndex <= 0) {
        setInput('', -1)
      } else {
        const newIndex = historyIndex - 1
        setInput(inputHistory[inputHistory.length - 1 - newIndex], newIndex)
      }
    }

    if (key.escape) {
      setInput('', -1)
    }
  })

  function handleSubmit(submitted: string) {
    const trimmed = submitted.trim()
    if (!trimmed) return
    setInputHistory((prev) => [...prev, trimmed])
    setInput('', -1)
    onSubmit(trimmed)
  }

  if (isLoading) {
    return (
      <Box paddingLeft={2}>
        <Text color="#7C3AED">
          <Spinner type="dots" />
        </Text>
        <Text dimColor>{` ${phaseLabel ?? 'working...'}`}</Text>
      </Box>
    )
  }

  return (
    <Box paddingLeft={2}>
      <Text color={PROMPT_COLORS[promptFrame]} bold>{'❯ '}</Text>
      <TextInput
        key={mountKey}
        placeholder="type a command or question..."
        suggestions={SUGGESTIONS}
        defaultValue={value}
        onSubmit={handleSubmit}
      />
    </Box>
  )
}
