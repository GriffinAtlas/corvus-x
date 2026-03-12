# TUI Polish: Step Progress, Scrollable Chat, Result Truncation

## Goal

Close the three highest-impact UX gaps in the Corvus TUI without architectural rework. After this work, the TUI transitions from "functional MVP" to "usable daily driver" — users get feedback during long operations, can navigate their investigation history, and aren't overwhelmed by verbose output.

## Scope

Three features, independently implementable, composing cleanly:

1. **Step progress** — spinner text swaps through pipeline phase labels during command execution
2. **Scrollable chat** — viewport with offset tracking, PgUp/PgDn navigation, auto-snap to bottom on new entries
3. **Result truncation** — cap rendered output at 25 lines, `/view N` slash command to expand

### Out of Scope

- Token streaming (requires GrokAdapter rework — separate effort)
- Agent command in TUI (separate wiring effort — but progress system is designed for it)
- Overlay/modal system
- Markdown/syntax highlighting in results
- Watch command in TUI

## Constraints

- **Ink 6 + React 19** — no framework change. Work within Ink's rendering model.
- **No new runtime dependencies** — all three features are implementable with existing packages.
- **CLI unaffected** — builder signature changes are additive (optional params). No behavior change for `corvus scan bitcoin` on the command line.
- **Existing tests must pass** — builder signature changes are additive (new optional trailing param). Existing callers that pass `pages` positionally (including builder tests and agent tests) continue to work since `onPhase` comes after `pages`.

## Architecture

### Data Model Changes

#### Session State (`use-session.ts`)

`ChatEntry` gains an `expanded` field on both `result` and `prose` types (both can be truncated):

```typescript
| { type: 'result'; command: string; topic: string; rendered: string;
    cost: number; elapsed: number; expanded: boolean }
| { type: 'prose'; text: string; cost: number; expanded: boolean }
```

**Default handling:** The `add-result` reducer case injects `expanded: false` when adding entries, so dispatch callers don't need to include it:

```typescript
case 'add-result': {
  const entry = action.entry.type === 'result' || action.entry.type === 'prose'
    ? { ...action.entry, expanded: false }
    : action.entry
  return { ...state, history: [...state.history, entry] }
}
```

Full rendered/text content is always stored — truncation is a display concern in ChatLog.

New session action:

```typescript
| { type: 'expand-entry'; index: number }
```

Reducer maps over history, sets `expanded: true` on the target entry if it's a `result` or `prose` type. No-op if index is out of bounds or entry is another type.

#### useCommand (`use-command.ts`)

New state: `phaseLabel: string | null` — the current phase label shown in the spinner. `null` when idle.

New return value: `{ execute, isLoading, phaseLabel }`.

**Threading `onPhase` to builders:** `useCommand` creates `setPhaseLabel` from `useState` and passes it as the `onPhase` callback by closing over it in each builder lambda. The existing `runStructured` helper gains an `onPhase` parameter which it threads into the `buildFn` closure:

```typescript
// In useCommand's execute():
setPhaseLabel('working...')

await runStructured(dispatch, deps, 'scan', args.topic, SCAN_MATCH_KEYS,
  () => buildScanSnapshot(deps, args.topic, 50, 1, setPhaseLabel),
  renderScan, startTime, baseDir)

setPhaseLabel(null)
```

The `runStructured` helper itself doesn't need `onPhase` — the callback is already closed over in the `buildFn` lambda. The `ask` command (which doesn't use `runStructured`) calls `setPhaseLabel('thinking...')` directly before `grok.query()`.

#### Scroll State (`app.tsx`)

Local component state in App:

```typescript
const [scrollOffset, setScrollOffset] = useState(0)
```

`scrollOffset` counts **entries** (not lines). `0` means pinned to bottom (all entries from the end are visible up to viewport capacity). `1` means skip the last entry and show from the second-to-last up. Auto-resets to 0 when `session.history.length` changes (new entry arrives).

PgUp/PgDn increment/decrement by a computed step: `Math.max(1, Math.floor(viewportCapacity / 2))` where `viewportCapacity` is the estimated number of entries that fit in the viewport (using the same height estimation as ChatViewport). This keeps scroll speed proportional to how many entries are visible.

### Component Changes

#### New: `ChatViewport` (`src/tui/components/chat-viewport.tsx`)

Wraps ChatLog in a height-constrained container. Responsibilities:

- Calculate viewport height from terminal height minus fixed UI elements (~5 rows for status, input, shortcut bar, padding)
- Slice entries array based on scroll offset and estimated entry heights
- Render scroll indicators (`↑ N more above` / `↓ N more below`)

Entry height estimation by type:
- `user`: 1 line
- `result` (truncated): 28 lines (25 cap + header/border/footer)
- `result` (expanded): actual rendered line count + 3
- `prose`: rendered line count + 2
- `error`: 1 line
- `system`: rendered line count

This is approximate — the goal is "roughly which entries fit on screen," not pixel precision.

#### Modified: `ChatLog` (`src/tui/components/chat-log.tsx`)

Truncation logic added to `renderEntry` for result type:

- If `!entry.expanded` and rendered text exceeds 25 lines, slice to 25 lines
- Pass hidden line count to ResultCard for the truncation footer
- Pass entry index (1-based) to ResultCard for the `/view N` hint

No changes for `user`, `prose`, `error`, `system` entry types.

#### Modified: `ResultCard` (`src/tui/components/result-card.tsx`)

New optional props: `truncated: number` (hidden line count), `index: number`.

When `truncated > 0`, renders a footer:

```
  ... 32 more lines · /view 1
```

#### Modified: `InputBar` (`src/tui/components/input-bar.tsx`)

Receives `phaseLabel: string | null` prop instead of deriving text from `isLoading` alone.

Loading state renders:

```
⠋ analyzing sentiment...
```

instead of:

```
⠋ working...
```

Falls back to `working...` if `phaseLabel` is null (defensive).

#### Modified: `ShortcutBar` (`src/tui/components/shortcut-bar.tsx`)

Update hint line to include scroll keybindings: `PgUp/PgDn scroll · Home/End top/bottom`. Keep the line concise — abbreviate if needed to fit typical terminal widths.

#### Modified: `App` (`src/tui/app.tsx`)

- Adds scroll state and keybinding handler (PgUp, PgDn, Home, End)
- Wraps ChatLog in ChatViewport, passing scroll offset and viewport height
- Auto-snaps scroll to bottom (resets offset to 0) when history length changes via `useEffect`
- Passes `phaseLabel` through to InputBar

### Builder Changes

#### Phase Callback Type

```typescript
export type OnPhase = (label: string) => void
```

Defined once in `src/core/types.ts` and imported by builders.

#### All 6 Builders (`src/core/builders/*.ts`)

Each builder gains an optional `onPhase?: OnPhase` parameter **after** all existing parameters. This preserves positional compatibility with all existing callers — critically including `AgentExecutor.buildArgs()` in `agent.ts`, which spreads positional args via `buildFn(this.deps, ...args)` through a type cast that bypasses compile-time checking.

Example signature for scan:
```typescript
export async function buildScanSnapshot(
  deps: CorvusDeps,
  topic: string,
  maxResults: number,
  pages?: number,        // existing — default 1
  onPhase?: OnPhase,     // new — appended after all existing params
): Promise<BuildResult<ScanSnapshot>>
```

**Caller impact:**
- **CLI callers** — don't pass `pages` or `onPhase`. Unchanged.
- **Agent executor** — passes `[topic, maxResults, pages]` positionally. `onPhase` remains `undefined`. Unchanged.
- **TUI callers** — must pass `pages` explicitly to reach `onPhase`: `buildScanSnapshot(deps, topic, 50, 1, setPhaseLabel)`. Currently they pass only 3 args, so they gain `1, setPhaseLabel`.
- **Test callers** — some tests pass `pages` explicitly (e.g., `buildScanSnapshot(deps, 'test', 10, 1)`). These continue to work — `onPhase` defaults to `undefined`.

For read and scope (which have no `pages` parameter), `onPhase` is simply appended as the last optional argument.

Calls are inserted at natural async boundaries:

**scan.ts:**
- `onPhase?.('fetching tweets...')` — before `searchRecent()`
- `onPhase?.('analyzing with Grok...')` — before `grok.query()`
- `onPhase?.('computing metrics...')` — before metric computation

**pulse.ts:**
- `onPhase?.('fetching tweets...')` — before `searchRecent()`
- `onPhase?.('analyzing sentiment...')` — before `grok.query()`
- `onPhase?.('computing signals...')` — before metric computation

**trace.ts:**
- `onPhase?.('fetching tweets...')` — before `searchRecent()`
- `onPhase?.('tracing narrative...')` — before `grok.query()`
- `onPhase?.('mapping spread...')` — before metric computation

**gather.ts:**
- `onPhase?.('fetching tweets...')` — before `searchRecent()`
- `onPhase?.('gathering intelligence...')` — before `grok.query()` (web search happens inside this call via `enableWebSearch: true`, not as a separate step)
- `onPhase?.('computing metrics...')` — before metric computation

**read.ts:**
- `onPhase?.('fetching tweet...')` — before tweet fetch
- `onPhase?.('analyzing tweet...')` — before `grok.query()`

**scope.ts:**
- `onPhase?.('fetching profile...')` — before `getUser()`
- `onPhase?.('analyzing account...')` — before `grok.query()`

**Grok-only path:** When `deps.x` is null, skip the fetch phase label. The first phase becomes the Grok analysis call (since `x_search` happens inside it).

#### Orchestrator (`src/core/orchestrator.ts`)

`StructuredQueryOptions` gains optional `onPhase?: OnPhase`. Passed through to `buildSnapshot()` — but since `buildSnapshot` is a caller-provided function, the caller (useCommand) is responsible for threading it into the builder call.

No orchestrator code changes needed — it's the caller's responsibility to close over `onPhase` in the `buildSnapshot` lambda.

### Router Changes (`src/tui/router.ts`)

**Type change:** The `ParsedCommand` slash variant currently has no `args`. Rather than modifying the slash type (which would affect all existing slash handlers), `/view N` uses the `command` type — it behaves like a command, not a simple slash toggle:

```typescript
// ParsedCommand type unchanged — /view returns a 'command' variant:
if (keyword === '/view') {
  const n = parseInt(rest)
  if (isNaN(n) || n < 1) return { type: 'error', message: 'Usage: /view <number>' }
  return { type: 'command', command: 'view', args: { index: String(n) } }
}
```

This is parsed before the `/` slash check. `/view` is a hybrid — prefixed with `/` for discoverability but returns `command` type because it carries arguments. The args value is stringified to match the existing `Record<string, string>` type.

Add `'/view'` to `COMMAND_KEYWORDS` for autocomplete suggestions.

### `/view` Dispatch Path (`use-command.ts`)

`/view` is handled in useCommand's command handler (not the slash handler), since it returns `command` type:

```typescript
} else if (command === 'view') {
  const index = parseInt(args.index) - 1  // convert 1-based user input to 0-based array index
  dispatch({ type: 'expand-entry', index })
  return  // no loading state, no user echo — instant action
}
```

This runs before the `if (!deps)` guard since `/view` doesn't need API credentials. The 1-to-0 index conversion happens here — the reducer always receives 0-based indices.

### Keybindings

| Key | Action | Where Handled |
|---|---|---|
| PgUp | Scroll up by half viewport | App `useInput` |
| PgDn | Scroll down by half viewport | App `useInput` |
| Home | Scroll to top (max offset) | App `useInput` |
| End | Scroll to bottom (offset = 0) | App `useInput` |

These are handled in App's `useInput` hook. They don't conflict with TextInput (which consumes character keys, arrows, Tab, Enter, Esc — not PgUp/PgDn/Home/End).

### Agent Extensibility

The `OnPhase` callback is generic — it accepts any string label. When agent is wired into the TUI in a future effort, `AgentExecutor` can call:

```typescript
onPhase?.('scanning "bitcoin"...')
onPhase?.('tracing "ETF narrative"...')
onPhase?.('synthesizing brief...')
```

No changes to the progress system needed. The design accommodates agent's multi-step pipeline without modification.

## Edge Cases

- **`/view 0` or `/view -1`** — router returns error: "Usage: /view \<number\>"
- **`/view 99` with 3 entries** — reducer no-ops (index out of bounds)
- **`/view 2` on a non-result entry** — reducer no-ops (type check)
- **Expanding already-expanded result** — no-op
- **`prose` entries** — truncated at a higher threshold (50 lines) since AI prose answers can occasionally be long. Same `/view N` mechanism applies. The higher threshold avoids truncating typical short answers while still protecting against verbose responses.
- **Terminal resize during scroll** — viewport height recalculated on next render via `useStdout()`. Offset clamped if it now exceeds max.
- **Empty history + scroll keys** — no-op (nothing to scroll)
- **Very narrow terminal (< 40 cols)** — truncation still works (it's line-based, not width-based). Scroll indicators degrade gracefully.
- **`/clear` while scrolled** — history clears, offset resets to 0

## Risks

- **Entry height estimation is approximate.** Line counts depend on terminal width (text wrapping) and Ink's rendering. If estimates are significantly off, the viewport may show too many or too few entries. Mitigation: err on the side of underestimating (show fewer entries) to avoid overflow.
- **Ink's `useInput` and PgUp/PgDn.** Ink maps raw terminal input — PgUp/PgDn may not be consistently reported across all terminal emulators. Mitigation: test on Windows Terminal, iTerm2, and basic xterm. If problematic, add alternative keybindings (Shift+Up/Down).
- **Builder signature change is additive but touches 6 files.** All existing callers (CLI commands, MCP server, tests) pass fewer args and are unaffected. But if any builder is called with positional args in a confusing order, TypeScript will catch it at compile time.

## Files Changed

| File | Type | Change |
|---|---|---|
| `src/core/types.ts` | modify | Add `OnPhase` type export |
| `src/index.ts` | modify | Export `OnPhase` type for library consumers |
| `src/core/builders/scan.ts` | modify | Add `onPhase` param, insert phase calls |
| `src/core/builders/pulse.ts` | modify | Add `onPhase` param, insert phase calls |
| `src/core/builders/trace.ts` | modify | Add `onPhase` param, insert phase calls |
| `src/core/builders/gather.ts` | modify | Add `onPhase` param, insert phase calls |
| `src/core/builders/read.ts` | modify | Add `onPhase` param, insert phase calls |
| `src/core/builders/scope.ts` | modify | Add `onPhase` param, insert phase calls |
| `src/tui/hooks/use-session.ts` | modify | Add `expanded` field, `expand-entry` action |
| `src/tui/hooks/use-command.ts` | modify | Add `phaseLabel` state, pass `onPhase` |
| `src/tui/router.ts` | modify | Add `/view N` slash command |
| `src/tui/app.tsx` | modify | Scroll state, keybindings, viewport wiring |
| `src/tui/components/chat-viewport.tsx` | create | Scroll container component |
| `src/tui/components/chat-log.tsx` | modify | Truncation logic |
| `src/tui/components/result-card.tsx` | modify | Truncation footer, index prop |
| `src/tui/components/input-bar.tsx` | modify | Display phaseLabel |
| `src/tui/components/shortcut-bar.tsx` | modify | Add PgUp/PgDn hint |

## Testing Strategy

- **Builder phase callbacks** — unit tests: pass a mock `onPhase`, verify it's called with expected labels in order
- **Session reducer** — unit tests: `expand-entry` action on various entry types and indices
- **Router** — unit tests: `/view 1`, `/view 0`, `/view abc`, `/view` (no arg)
- **ChatViewport** — unit tests: entry slicing with various scroll offsets and viewport heights
- **ResultCard truncation** — unit tests: render with `truncated={0}` vs `truncated={32}`, verify footer presence
- **InputBar phaseLabel** — unit tests: render with `phaseLabel="analyzing..."` vs `null`
- **Integration** — manual: run TUI, execute scan, verify phase labels swap in spinner, result is truncated, PgUp/PgDn scrolls, `/view 1` expands
