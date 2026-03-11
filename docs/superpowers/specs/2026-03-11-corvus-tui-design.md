# Corvus TUI Design

## Overview

Full-screen persistent terminal UI for Corvus, replacing the basic readline REPL with a Claude Code-style interactive experience. Users launch with `corvus` (no args) and interact via natural language or explicit commands. The existing CLI (`corvus <command>`) remains unchanged.

## Framework

**Ink** (React for terminals) with `@inkjs/ui` companion library. Chosen for: 28K GitHub stars, active maintenance, used by GitHub Copilot CLI / Prisma / Shopify, React component model, built-in flexbox layout.

**Dependencies (explicit versions):**
- `ink@^6` -- React renderer for terminals
- `react@^19` -- Peer dep of Ink 6
- `@inkjs/ui` -- TextInput, Spinner components
- `@types/react@^19` (dev) -- TypeScript types for React 19
- `ink-testing-library` (dev) -- Test renderer for Ink components
- `eslint-plugin-react-hooks` (dev) -- Lint React hook dependencies

## Architecture

### Component Tree

```
<App>
  <Header />           -- Logo (first run) or one-line bar (returning)
  <ChatLog />          -- Scrollable history of inputs + outputs
    <UserMessage />        -- What the user typed
    <ProseResult />        -- Complete prose response (spinner then full text)
    <ResultCard />         -- Rendered structured output (scan/pulse/etc.)
    <SystemNotice />       -- Errors, warnings, tips
  <StatusLine />       -- Grok status | X API status | Session cost | Queries
  <InputBar />         -- Text input with tab-complete + history (up/down)
```

### Data Flow

1. User types in `<InputBar>` and presses Enter
2. Router parses input (command keyword or natural language)
3. Routes to builder functions or `GrokAdapter.query()` (see Integration Layer below)
4. Results flow into `<ChatLog>` via React state
5. `<StatusLine>` updates cost after each call

### Integration Layer

**The TUI does NOT call `runCommand()` or `runStructuredCommand()`.** Those runner functions use `process.exit()`, `ora` spinners, and `console.log()` -- all incompatible with Ink's terminal ownership.

Instead, the TUI calls the lower-level functions directly:

- **Structured commands** (`scan`, `pulse`, `trace`, `gather`, `read`, `scope`): Call the `buildSnapshot()` functions from each builder module (`buildScanSnapshot()`, `buildPulseSnapshot()`, etc.). These return pure data. Then pass the snapshot data to the existing renderers (`renderScan()`, `renderPulse()`, etc.) which return formatted strings.
- **Prose commands** (`ask`, natural language): Call `GrokAdapter.query()` directly. Display a spinner during the API call, then render the complete response text. (Streaming is deferred -- see Deferred Features.)
- **Agent command**: Deferred to a follow-up iteration (see Deferred Features).

This pattern already exists in the codebase -- the `agent` command's `AgentExecutor` calls builder functions directly rather than going through the CLI runners.

### Snapshot Orchestration

The snapshot save/load/diff logic currently lives in `runStructuredCommand()`, not in the builders. The TUI needs this same orchestration. To avoid duplication, extract a shared `executeStructuredCommand()` function from `run-command.ts` that:

1. Loads previous snapshot from `SnapshotStore`
2. Calls the builder function
3. Saves new snapshot
4. Computes diff via `differ`
5. Returns `{ snapshot, diff, cost }`

Both the CLI runner and TUI's `use-command.ts` hook call this shared function. The CLI runner adds `console.log()` + `process.exit()` around it; the TUI hook feeds results to React state.

### Dependency Lifecycle

The TUI constructs `CorvusDeps` (`{ grok: GrokAdapter, x: XAdapter | null }`) once at launch via `AuthManager`. These are stored in React context and reused for the session. If auth is missing at launch, `grokStatus` / `xApiStatus` are set accordingly in `Session` state and the status line reflects it. Users can run `corvus auth setup` in a separate terminal and restart the TUI to pick up new credentials.

### Argument Parsing Per Command

The router extracts per-command arguments from the input string:

| Command | Required | Optional | Validation |
|---|---|---|---|
| `scan <topic...>` | topic (1+ words) | -- | Non-empty topic |
| `pulse <topic...>` | topic (1+ words) | -- | Non-empty topic |
| `trace <@handle>` | handle | -- | Must start with @ or be bare username |
| `gather <topic...>` | topic (1+ words) | -- | Non-empty topic |
| `read <id-or-url>` | tweet ID or URL | -- | Numeric ID or valid x.com/twitter.com URL (reuse `extractTweetId()`) |
| `scope <@handle>` | handle | -- | Must start with @ or be bare username |
| `ask <question...>` | question (1+ words) | -- | Non-empty question |

Missing or invalid arguments produce a `<SystemNotice>` error (e.g., "Usage: scan <topic>") instead of crashing.

### Error Handling

Builder functions throw raw errors (`Error`, `GrokParseError`, `XApiError`, `XRateLimitError`). The `use-command.ts` hook wraps all builder calls in try/catch and maps errors to user-friendly `<SystemNotice>` entries:

- `XRateLimitError` -> "Rate limited. Resets at {time}."
- `XApiError` -> "X API error: {message}"
- `GrokParseError` -> "Grok returned unexpected data. Try again."
- Generic `Error` -> error message as-is

### Chalk Inside Ink

The existing renderers (`renderScan`, etc.) return chalk-styled strings via the `theme.ts` helpers. Ink passes through raw ANSI escape sequences in `<Text>` components. For v1, we wrap renderer output in a raw `<Text>` pass-through. This is known to work but is fragile; a future iteration could migrate renderers to return structured data rendered via Ink `<Text color="">` components.

## Input Routing

### Explicit Commands

Input starting with a keyword routes directly:

| Input | Route |
|---|---|
| `scan AI agents` | `buildScanSnapshot(...)` -> `renderScan()` |
| `pulse crypto` | `buildPulseSnapshot(...)` -> `renderPulse()` |
| `trace @elonmusk` | `buildTraceSnapshot(...)` -> `renderTrace()` |
| `gather DeFi regulation` | `buildGatherSnapshot(...)` -> `renderGather()` |
| `read 123456` | `buildReadSnapshot(...)` -> `renderRead()` |
| `scope @user` | `buildScopeSnapshot(...)` -> `renderScope()` |
| `ask why is AI booming` | `GrokAdapter.query(...)` |
| `history` | Load from `SnapshotStore` |
| `watch <topic> [interval]` | Deferred (see below) |

### Natural Language Fallback

If no keyword match, treat as `ask` command (routes to `GrokAdapter.query()`).

### Slash Commands

TUI-specific actions (no API calls):

| Command | Action |
|---|---|
| `/help` | Show available commands |
| `/cost` | Session spend so far |
| `/history` | Recent queries from snapshots |
| `/clear` | Clear chat log |
| `/exit` | Quit |

### Tab Completion

Prefix-match on command keywords + slash commands. Built with Ink's `useInput` hook intercepting Tab keypresses -- `@inkjs/ui`'s `TextInput` does not support tab completion or up/down history natively, so `<InputBar>` implements these features custom on top of `useInput`.

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Submit input |
| `Tab` | Cycle tab completion |
| `Up/Down` | Navigate input history |
| `Ctrl+C` | Cancel current operation (if running), or exit TUI (if idle) |
| `Escape` | Clear current input |

## Rendering Strategy

### Prose Commands (`ask`, natural language)

Show Ink `<Spinner>` while `GrokAdapter.query()` executes, then render the complete response as `<ProseResult />`. Token-by-token streaming is deferred to a follow-up (requires adding `GrokAdapter.queryStream()` -- the current `query()` method returns a complete response).

### Structured Commands (`scan`, `pulse`, `trace`, `gather`, `read`, `scope`)

Show Ink `<Spinner>` while builder executes, then render full result card. Reuses existing `renderScan()`, `renderPulse()`, etc. from `output.ts` -- these return chalk-styled strings.

### Result Card Layout

```
+-- scan: AI agents ---------------------------------+
|  [rendered output from renderScan()]               |
|  Sentiment: xxxxxxxx.. 0.72                        |
|  Top accounts: @user1 (1.2K), @user2 (800)         |
+-- $0.003 . 1.2s ----------------------------------+
```

Box wrapper adds command name, topic, cost, and elapsed time around existing renderer output.

### System Notices

Errors, tips, onboarding text. Rendered in `theme.muted` or `theme.warning`.

### Scroll Behavior

Chat log auto-scrolls to bottom on new output. User can scroll up to review history. Deferred: "New output" indicator when scrolled up (non-trivial UX -- address in follow-up).

## Status Line

Persistent single-line bar between chat log and input:

```
Grok: * connected  |  X API: * connected  |  Cost: $0.012  |  3 queries
```

### API States

| State | Meaning |
|---|---|
| `connected` (green) | Key present, last call succeeded |
| `no key` (dim) | Env var / credentials missing |
| `error` (red) | Last call failed (resets on next success) |
| `optional` (yellow) | X API only: no token but Grok-only fallback available |

### Session State

```typescript
interface Session {
  startTime: number
  totalCost: number
  queryCount: number
  grokStatus: 'connected' | 'error' | 'no-key'
  xApiStatus: 'connected' | 'error' | 'no-key' | 'optional'
  history: ChatEntry[]
}
```

No cross-session persistence. Snapshots on disk provide history via `/history`.

## Onboarding

### First Launch (no `~/.corvus/` directory)

Full ASCII logo + quick start guide showing available commands and setup instructions.

### Returning User

One-line header (`corvus v0.2.0`), straight to input bar. Detection: `~/.corvus/` directory exists.

### Missing API Keys

System notice warning, TUI still launches for `/help` and exploration. Commands fail gracefully with existing error handling.

## File Structure

### New Files

```
src/tui/
  app.tsx              -- <App> root, session context provider
  components/
    header.tsx         -- Logo (first run) or one-line bar
    chat-log.tsx       -- Scrollable message list
    input-bar.tsx      -- Text input with custom tab-complete + history via useInput
    status-line.tsx    -- API status, cost, query count
    result-card.tsx    -- Box wrapper around existing renderer output
    prose-result.tsx   -- Complete prose response display
    system-notice.tsx  -- Errors, warnings, tips
  router.ts            -- Parse input -> command name + args
  hooks/
    use-session.ts     -- Session state context + reducer
    use-command.ts     -- Execute command, update chat log + status
```

### Modified Files

```
bin/corvus.ts          -- Add TUI launch logic (see Entry Point below)
package.json           -- Add ink, react, @inkjs/ui, @types/react dependencies
tsconfig.json          -- JSX support (see exact changes below)
eslint.config.mjs      -- Add .tsx file coverage
```

### tsconfig.json Changes

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "include": ["bin/**/*.ts", "src/**/*.ts", "src/**/*.tsx"]
}
```

### eslint.config.mjs Changes

Add `.tsx` to file matching and add React Hooks linting:

```javascript
// Add to existing config
{ files: ['src/**/*.tsx'], ... }  // extend existing TS rules to .tsx
```

Install `eslint-plugin-react-hooks` (dev) for `useEffect` / `useInput` dependency linting. No need for `eslint-plugin-react` -- Ink's JSX is simple enough that TS strict mode catches most issues.

### Entry Point

The `corvus repl` command is deprecated and replaced by the TUI. The entry point uses Commander's default action:

```typescript
// bin/corvus.ts
program
  .action(() => {
    // No subcommand matched -> launch TUI
    // --version and --help are handled by Commander before this runs
    launchTUI()
  })

program.parse()
```

This avoids the `process.argv.length` check issue. Commander handles `--version` and `--help` flags before the default action runs.

**REPL deprecation strategy:** The `corvus repl` command is kept for one release with a deprecation warning ("corvus repl is deprecated, use corvus to launch the interactive TUI"). It is removed in the following release. This gives users a fallback if the TUI has issues.

## Deferred Features

These are explicitly out of scope for v1, noted here for future iterations:

1. **Token streaming** -- Requires `GrokAdapter.queryStream()` using OpenAI SDK's `stream: true`. V1 shows spinner + complete response.
2. **Agent command in TUI** -- The `agent` command has interactive checkpoint mode, `StepProgress` renderer, and SIGINT handling that need dedicated TUI design. Continue using `corvus agent` via CLI.
3. **Watch command in TUI** -- Long-running `setTimeout` chain with periodic results. Natural TUI fit but needs design for how periodic updates appear in chat log.
4. **Export command in TUI** -- Writes to stdout via `process.stdout.write()`. Needs redirect to file in TUI context.
5. **Scroll-up indicator** -- "New output" indicator when user has scrolled up. Non-trivial UX, defer.
6. **Chalk-to-Ink migration** -- Migrate renderers from returning chalk strings to returning structured data rendered via Ink `<Text color="">` components.

## Testing Strategy

### Unit Tests

- `router.ts` -- Input string -> `{ command, args }` mapping. Keywords, natural language fallback, slash commands, edge cases (empty input, unknown commands, commands with special characters).
- `use-session.ts` -- Reducer state transitions: cost updates, status changes, history append, startTime initialization.
- `result-card.ts` -- Wraps renderer output with box + metadata.
- `input-bar.ts` -- Tab completion logic, history navigation.

### Integration Tests

Using `ink-testing-library`:
- Render `<App>` -> verify header appears
- Simulate input -> verify router dispatches correct command
- Mock command execution -> verify result card in chat log
- Verify status line updates after command
- Verify Ctrl+C behavior (cancel vs exit)

### Not Tested

- Existing renderers -- already covered by 264 tests
- Existing command logic -- already tested
- Visual pixel-perfection -- manual QA

### Estimated New Tests

~50-70 tests on top of existing 264.

## Design References

- **OpenClaw TUI** -- 5-zone layout (Header, Chat log, Status line, Footer, Input) validated our approach. Status line pattern adopted for showing API health + session metrics.
- **Claude Code** -- Full-screen persistent interaction model. Inline results display.
- **Existing Corvus CLI** -- Renderers, adapters, builder functions, and command logic all reused. TUI is a new presentation layer, not a rewrite.
