import type { MatchKeys } from './schemas.js'

export interface DiffLine {
  path: string
  type: 'changed' | 'added' | 'removed'
  oldValue?: string
  newValue?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

export function diffSnapshots(
  oldData: object,
  newData: object,
  matchKeys: MatchKeys,
  prefix = '',
): DiffLine[] {
  return diffRecords(oldData as AnyRecord, newData as AnyRecord, matchKeys, prefix)
}

function diffRecords(
  oldData: AnyRecord,
  newData: AnyRecord,
  matchKeys: MatchKeys,
  prefix: string,
): DiffLine[] {
  const lines: DiffLine[] = []

  for (const key of new Set([...Object.keys(oldData), ...Object.keys(newData)])) {
    const oldVal = oldData[key]
    const newVal = newData[key]
    const fullPath = prefix ? `${prefix}.${key}` : key

    if (oldVal === undefined && newVal !== undefined) {
      lines.push({ path: fullPath, type: 'added', newValue: formatValue(newVal) })
      continue
    }
    if (oldVal !== undefined && newVal === undefined) {
      lines.push({ path: fullPath, type: 'removed', oldValue: formatValue(oldVal) })
      continue
    }
    if (oldVal === newVal) continue

    if (typeof newVal === 'number' && typeof oldVal === 'number') {
      if (oldVal !== newVal) {
        lines.push({
          path: fullPath,
          type: 'changed',
          oldValue: formatNum(oldVal),
          newValue: formatNum(newVal),
        })
      }
      continue
    }

    if (typeof newVal === 'string' && typeof oldVal === 'string') {
      if (oldVal !== newVal) {
        lines.push({
          path: fullPath,
          type: 'changed',
          oldValue: oldVal,
          newValue: newVal,
        })
      }
      continue
    }

    if (Array.isArray(newVal) && Array.isArray(oldVal)) {
      const matchKey = matchKeys[key]

      if (newVal.length === 0 && oldVal.length === 0) continue

      if (typeof newVal[0] === 'string' || typeof oldVal[0] === 'string') {
        const oldSet = new Set(oldVal as string[])
        const newSet = new Set(newVal as string[])
        for (const item of newVal as string[]) {
          if (!oldSet.has(item)) {
            lines.push({ path: fullPath, type: 'added', newValue: item })
          }
        }
        for (const item of oldVal as string[]) {
          if (!newSet.has(item)) {
            lines.push({ path: fullPath, type: 'removed', oldValue: item })
          }
        }
        continue
      }

      if (matchKey && typeof newVal[0] === 'object') {
        const oldMap = new Map<string, Record<string, unknown>>()
        for (const item of oldVal) oldMap.set(String(item[matchKey]), item)
        const newMap = new Map<string, Record<string, unknown>>()
        for (const item of newVal) newMap.set(String(item[matchKey]), item)

        for (const [id, newItem] of newMap) {
          const oldItem = oldMap.get(id)
          if (!oldItem) {
            lines.push({
              path: fullPath,
              type: 'added',
              newValue: formatObjectBrief(newItem, matchKey),
            })
          } else {
            const subDiffs = diffObjectFields(oldItem, newItem, fullPath, id)
            lines.push(...subDiffs)
          }
        }
        for (const [id] of oldMap) {
          if (!newMap.has(id)) {
            lines.push({ path: fullPath, type: 'removed', oldValue: id })
          }
        }
        continue
      }

      if (oldVal.length !== newVal.length) {
        lines.push({
          path: fullPath,
          type: 'changed',
          oldValue: `${oldVal.length} items`,
          newValue: `${newVal.length} items`,
        })
      }
      continue
    }

    if (
      typeof newVal === 'object' &&
      newVal !== null &&
      typeof oldVal === 'object' &&
      oldVal !== null &&
      !Array.isArray(newVal)
    ) {
      lines.push(...diffRecords(oldVal, newVal, matchKeys, fullPath))
      continue
    }

    lines.push({
      path: fullPath,
      type: 'changed',
      oldValue: formatValue(oldVal),
      newValue: formatValue(newVal),
    })
  }

  return lines
}

function diffObjectFields(
  oldItem: Record<string, unknown>,
  newItem: Record<string, unknown>,
  parentPath: string,
  id: string,
): DiffLine[] {
  const lines: DiffLine[] = []
  for (const field of Object.keys(newItem)) {
    const oldVal = oldItem[field]
    const newVal = newItem[field]
    if (oldVal === newVal) continue

    if (typeof newVal === 'number' && typeof oldVal === 'number') {
      lines.push({
        path: `${parentPath}[${id}].${field}`,
        type: 'changed',
        oldValue: formatNum(oldVal),
        newValue: formatNum(newVal),
      })
    } else if (typeof newVal === 'string' && typeof oldVal === 'string') {
      lines.push({
        path: `${parentPath}[${id}].${field}`,
        type: 'changed',
        oldValue: oldVal,
        newValue: newVal,
      })
    }
  }
  return lines
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}

function formatValue(val: unknown): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number') return formatNum(val)
  if (Array.isArray(val)) return `${val.length} items`
  return JSON.stringify(val)
}

function formatObjectBrief(obj: Record<string, unknown>, matchKey: string): string {
  const id = String(obj[matchKey])
  const rest = Object.entries(obj)
    .filter(([k]) => k !== matchKey)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? formatNum(v) : v}`)
    .slice(0, 3)
    .join(', ')
  return rest ? `${id} (${rest})` : id
}

export function formatDiffLines(lines: DiffLine[], timeSince: number): string {
  if (lines.length === 0) return ''

  const timeStr = formatTimeSince(timeSince)
  const parts: string[] = ['', `  ── changes since ${timeStr} ago ──`]

  for (const line of lines) {
    const label = simplifyPath(line.path)
    switch (line.type) {
      case 'changed':
        parts.push(
          `  ${label}: ${line.oldValue} → ${line.newValue}${formatDelta(line.oldValue, line.newValue)}`,
        )
        break
      case 'added':
        parts.push(`  + ${label}: ${line.newValue}`)
        break
      case 'removed':
        parts.push(`  - ${label}: ${line.oldValue}`)
        break
    }
  }

  return parts.join('\n')
}

function formatDelta(oldVal?: string, newVal?: string): string {
  if (!oldVal || !newVal) return ''
  const oldNum = parseFloat(oldVal.replace(/,/g, ''))
  const newNum = parseFloat(newVal.replace(/,/g, ''))
  if (isNaN(oldNum) || isNaN(newNum)) return ''
  const delta = newNum - oldNum
  if (delta === 0) return ''
  const sign = delta > 0 ? '+' : ''
  if (Number.isInteger(delta)) return ` (${sign}${delta})`
  return ` (${sign}${delta.toFixed(2)})`
}

function simplifyPath(path: string): string {
  return path.replace(/^metrics\./, '')
}

function formatTimeSince(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
