# TUI Polish: Step Progress, Scrollable Chat, Result Truncation

## Goal

Close the three highest-impact UX gaps in the Corvus TUI without architectural rework. After this work, the TUI transitions from "functional MVP" to "usable daily driver" — users get feedback during long operations, can navigate their investigation history, and aren't overwhelmed by verbose output.

## Scope

Three features, independently implementable, composing cleanly:

1. **Step progress** — spinner text shows command-specific labels during execution
2. **Scrollable chat** — viewport with offset tracking, PgUp/PgDn navigation, auto-snap to bottom on new entries
3. **Result truncation** — cap rendered output at 25 lines, `/view N` command to expand

### Out of Scope

- Token streaming (requires GrokAdapter rework — separate effort)
- Agent command in TUI (separate wiring effort)
- Overlay/modal system
- Markdown/syntax highlighting in results
- Watch command in TUI
- Builder/core layer changes of any kind

## Constraints

- **Ink 6 + React 19** — no framework change. Work within Ink's rendering model.
- **No new runtime dependencies** — all three features are implementable with existing packages.
- **Core layer untouched** — no changes to builders, orchestrator, types.ts, or index.ts. Step progress lives entirely in the TUI layer.
- **Existing tests must pass** — no builder signatures change. Only TUI-layer files are modified.

## Architecture

### Data Model Changes

#### Session State (`use-session.ts`)

`ChatEntry` gains an optional `expanded` field on `result` and `prose` types:

```typescript
| { type: 'result'; command: string; topic: string; rendered: string;
    cost: number; elapsed: number; expanded?: boolean }
| { type: 'prose'; text: string; cost: number; expanded?: boolean }
```

`expanded` is optional (defaults to `undefined`, treated as `false`). This avoids breaking existing dispatch callers and test assertions — no code that creates entries needs to change. The field is only set explicitly by the `expand-entry` action.

New session action:

```typescript
| { type: 'expand-entry'; index: number }
```

Reducer maps over history, sets `expanded: true` on the target entry if it's a `result` or `prose` type. No-op if index is out of bounds or entry is another type.

#### useCommand (`use-command.ts`)

New state: `phaseLabel: string | null` — the current phase label shown in the spinner. `null` when idle.

New return value: `{ execute, isLoading, phaseLabel }`.

**Phase labels are set in `useCommand` only — not in builders.** Before each command execution, set a command-specific label that includes the topic. After completion, clear it:

```typescript
const [phaseLabel, setPhaseLabel] = useState<string | null>(null)

// In execute(), per command branch:
setPhaseLabel(`scanning "${args.topic}"...`)
await runStructured(dispatch, deps, 'scan', args.topic, SCAN_MATCH_KEYS,
  () => buildScanSnapshot(deps, args.topic, 50),
  renderScan, startTime, baseDir)
setPhaseLabel(null)
```

**Phase labels per command:**

| Command | Label |
|---|---|
| scan | `scanning "<topic>"...` |
| pulse | `analyzing sentiment for "<topic>"...` |
| trace | `tracing "<topic>"...` |
| gather | `gathering intelligence on "<topic>"...` |
| read | `analyzing tweet...` |
| scope | `profiling @<username>...` |
| ask | `thinking...` |

This is a one-line change per command branch, all within `use-command.ts`. No builder changes. No new types. No public API additions.

**Agent extensibility:** When agent is wired into the TUI later, its executor loop can call `setPhaseLabel` directly at each step (e.g., `scanning "bitcoin"...` → `tracing "ETF narrative"...`). Same mechanism, no rework.

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
- `prose` (truncated): 53 lines (50 cap + border/footer)
- `prose` (expanded): actual rendered line count + 2
- `error`: 1 line
- `system`: rendered line count

This is approximate — the goal is "roughly which entries fit on screen," not pixel precision.

**Why not Ink's `Static` component:** `Static` renders items once and never re-renders them. Since `/view N` changes an entry's `expanded` state (requiring re-render), `Static` is incompatible with feature 3. Manual viewport math is required.

#### Modified: `ChatLog` (`src/tui/components/chat-log.tsx`)

Truncation logic added to `renderEntry`:

- **Result entries:** If `!entry.expanded` and rendered text exceeds 25 lines, slice to 25 lines. Pass hidden line count and entry index to ResultCard.
- **Prose entries:** If `!entry.expanded` and text exceeds 50 lines, slice to 50 lines. Pass hidden line count and entry index to ProseResult.
- No changes for `user`, `error`, `system` entry types.

#### Modified: `ResultCard` (`src/tui/components/result-card.tsx`)

New optional props: `truncated: number` (hidden line count), `index: number`.

When `truncated > 0`, renders a footer:

```
  ... 32 more lines · /view 1
```

#### Modified: `ProseResult` (`src/tui/components/prose-result.tsx`)

Same truncation footer as ResultCard when `truncated > 0`.

#### Modified: `InputBar` (`src/tui/components/input-bar.tsx`)

Receives `phaseLabel: string | null` prop instead of deriving text from `isLoading` alone.

Loading state renders:

```
⠋ scanning "bitcoin"...
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

### Router Changes (`src/tui/router.ts`)

**Type change:** The `ParsedCommand` slash variant gains optional `args`:

```typescript
export type ParsedCommand =
  | { type: 'command'; command: string; args: Record<string, string> }
  | { type: 'slash'; command: string; args?: Record<string, string> }
  | { type: 'error'; message: string }
  | { type: 'empty' }
```

This is a backwards-compatible change — existing slash handlers that don't check `args` are unaffected. It sets a clean precedent for future slash commands with arguments (e.g., `/export csv`).

`/view N` parsing:

```typescript
if (input.startsWith('/view ') || input === '/view') {
  const rest = input.slice(6).trim()
  const n = parseInt(rest)
  if (isNaN(n) || n < 1) return { type: 'error', message: 'Usage: /view <number>' }
  return { type: 'slash', command: 'view', args: { index: String(n) } }
}
```

This is parsed before the generic `/` slash check. Add `'view'` to `SLASH_COMMANDS` and `'/view'` to `COMMAND_KEYWORDS` for autocomplete.

### `/view` Dispatch Path (`use-command.ts`)

`/view` is handled in useCommand's slash handler:

```typescript
case 'view': {
  const index = parseInt(parsed.args?.index ?? '') - 1
  dispatch({ type: 'expand-entry', index })
  return
}
```

The 1-to-0 index conversion happens here — the reducer always receives 0-based indices. No loading state, no user echo — instant action.

### Keybindings

| Key | Action | Where Handled |
|---|---|---|
| PgUp | Scroll up by half viewport | App `useInput` |
| PgDn | Scroll down by half viewport | App `useInput` |
| Home | Scroll to top (max offset) | App `useInput` |
| End | Scroll to bottom (offset = 0) | App `useInput` |

These are handled in App's `useInput` hook. They don't conflict with TextInput (which consumes character keys, arrows, Tab, Enter, Esc — not PgUp/PgDn/Home/End).

## Edge Cases

- **`/view 0` or `/view -1`** — router returns error: "Usage: /view \<number\>"
- **`/view 99` with 3 entries** — reducer no-ops (index out of bounds)
- **`/view 2` on a non-result entry** — reducer no-ops (type check)
- **Expanding already-expanded result** — no-op
- **`prose` entries** — truncated at a higher threshold (50 lines). Same `/view N` mechanism applies.
- **Terminal resize during scroll** — viewport height recalculated on next render via `useStdout()`. Offset clamped if it now exceeds max.
- **Empty history + scroll keys** — no-op (nothing to scroll)
- **Very narrow terminal (< 40 cols)** — truncation still works (it's line-based, not width-based). Scroll indicators degrade gracefully.
- **`/clear` while scrolled** — history clears, offset resets to 0

## Risks

- **Entry height estimation is approximate.** Line counts depend on terminal width (text wrapping) and Ink's rendering. If estimates are significantly off, the viewport may show too many or too few entries. Mitigation: err on the side of underestimating (show fewer entries) to avoid overflow.
- **Ink's `useInput` and PgUp/PgDn.** Ink maps raw terminal input — PgUp/PgDn may not be consistently reported across all terminal emulators. Mitigation: test on Windows Terminal. If problematic, add alternative keybindings (Shift+Up/Down).
- **`use-session.test.ts` assertions.** If any existing test uses `toEqual` on result/prose entries that are created via `add-result`, the optional `expanded` field won't cause failures (it's `undefined`, not present). But tests that explicitly assert `expanded` absence may need updating. Check during implementation.

## Files Changed

| File | Type | Change |
|---|---|---|
| `src/tui/hooks/use-session.ts` | modify | Add optional `expanded` to result/prose, add `expand-entry` action |
| `src/tui/hooks/use-command.ts` | modify | Add `phaseLabel` state, set command-specific labels |
| `src/tui/router.ts` | modify | Add optional `args` to slash type, add `/view N` |
| `src/tui/app.tsx` | modify | Scroll state, keybindings, viewport wiring |
| `src/tui/components/chat-viewport.tsx` | create | Scroll container component |
| `src/tui/components/chat-log.tsx` | modify | Truncation logic for result and prose entries |
| `src/tui/components/result-card.tsx` | modify | Truncation footer, index prop |
| `src/tui/components/prose-result.tsx` | modify | Truncation footer, index prop |
| `src/tui/components/input-bar.tsx` | modify | Display phaseLabel |
| `src/tui/components/shortcut-bar.tsx` | modify | Add scroll keybinding hints |

**10 files** (1 new, 9 modified). All in `src/tui/`. Zero core layer changes.

## Testing Strategy

- **Session reducer** — unit tests: `expand-entry` action on various entry types and indices (result, prose, user, out-of-bounds)
- **Router** — unit tests: `/view 1`, `/view 0`, `/view abc`, `/view` (no arg), verify slash type with args
- **ChatViewport** — unit tests: entry slicing with various scroll offsets and viewport heights
- **ResultCard truncation** — unit tests: render with `truncated={0}` vs `truncated={32}`, verify footer presence
- **ProseResult truncation** — unit tests: render with and without truncation
- **InputBar phaseLabel** — unit tests: render with `phaseLabel="scanning..."` vs `null`
- **Integration** — manual: run TUI, execute scan, verify phase label in spinner, result is truncated, PgUp/PgDn scrolls, `/view 1` expands
