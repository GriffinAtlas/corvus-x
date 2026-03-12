# Corvus — Project Context

## What This Is

Corvus (`corvus-x` on npm) is an open-source CLI agent for gathering and synthesizing intelligence from X (Twitter). It uses Grok's native `x_search`/`web_search` tools via the OpenAI SDK and X API v2 for direct data access.

**Author:** Roger Griffin (roger@griffinatlas.us)
**Repo:** github.com/GriffinAtlas/corvus-x

## Stack

- TypeScript (strict, ES2022, ESM with `"type": "module"`)
- Node.js >= 18
- Grok API at `https://api.x.ai/v1` via OpenAI SDK (model: `grok-4-1-fast`)
- X API v2 at `https://api.x.com/2` via native `fetch`
- Commander (CLI), Vitest (tests), ESLint + Prettier (formatting)
- No semicolons, single quotes, trailing commas, printWidth 100

## Commands

```bash
npm run dev -- <command>     # run without building (tsx)
npm run build                # tsc to dist/
npm test                     # vitest run (819 tests)
npm run lint                 # eslint
npm run format               # prettier
```

## Architecture

```
bin/corvus.ts                # entrypoint — registers all commands, calls program.parse()
bin/corvus-mcp.ts            # standalone MCP server entrypoint (stdio)
src/
  cli/
    commands/                # agent, ask, scan, read, scope, trace, pulse, gather, watch, auth, history, export
    run-command.ts           # shared runner — runCommand() for prose, runStructuredCommand() for data-first
    output.ts                # formatOutput() for prose, formatStructuredOutput() with per-command renderers, renderAgentBrief()
    progress.ts              # StepProgress — multi-line in-place step tracker for agent runs
    theme.ts                 # Color palette (t.*), TTY detection, visual primitives, CROW_SMALL_LINES, LOGO_LINES
    repl.ts                  # interactive session with readline (deprecated — use TUI)
  core/
    agent.ts                 # AgentPlanner, AgentExecutor, AgentSynthesizer — autonomous investigation pipeline
    grok-adapter.ts          # GrokAdapter class — wraps OpenAI SDK pointed at x.ai, parseGrokJson, retry/timeout
    x-adapter.ts             # XAdapter class — X API v2 (tweets, users, search, formatTweetsForAnalysis, pagination)
    builders/                # 6 build functions (scan, pulse, trace, gather, read, scope) + grok-only.ts helper + barrel
    orchestrator.ts          # executeStructuredQuery — shared snapshot orchestration for CLI + TUI
    cache.ts                 # QueryCache — file-based with SHA-256 keys, TTL, cost ledger
    schemas.ts               # Grok JSON response shapes, computed snapshot interfaces, AgentBrief, match keys
    snapshots.ts             # SnapshotStore — timestamped JSON snapshots with auto-prune
    metrics.ts               # Pure compute functions — baseMetrics, sentiment, topAccounts, confidence, contradictions
    validators.ts            # Zod v4 schemas for all 8 Grok response types + agent plan/replan
    differ.ts                # Generic structured diff engine for snapshot comparison
    types.ts                 # GrokResponse, QueryOptions, CorvusDeps, BuildResult
  mcp/
    server.ts                # MCP server — 7 tools (scan/pulse/trace/gather/read/scope/agent) via McpServer
  infra/
    auth.ts                  # AuthManager — env vars take precedence over ~/.corvus/credentials.json
    config.ts                # ConfigManager — manages ~/.corvus/ directory
  tui/
    app.tsx                  # TUI root — Ink/React full-screen interactive terminal
    components/
      welcome-view.tsx       # Welcome screen orchestrator — composes header + panels, responsive layout
      welcome-header.tsx     # Crow braille art + CORVUS block-letter logo + tagline + version
      status-panel.tsx       # API connection status dots (Grok, X API) + cost/query display
      quick-start-panel.tsx  # Example commands (new users) or recent activity (returning users)
      setup-notice.tsx       # API key setup instructions (shown when no Grok key configured)
      input-bar.tsx          # Command input with Tab autocomplete + loading spinner
      chat-log.tsx           # Renders session history entries after first command
      result-card.tsx        # Bordered card for structured command output
      prose-result.tsx       # Streaming prose output for ask/freeform
      status-line.tsx        # Inline cost + timing display
      system-notice.tsx      # System messages (errors, notices)
      shortcut-bar.tsx       # Keyboard shortcut hints bar
    hooks/                   # useCommand (execute + dispatch), useSession (state + reducer)
    utils/
      relative-time.ts       # relativeTime() — "2h ago" formatting for recent activity
    router.ts                # parse user input to command + args
  index.ts                   # public API surface — 27+ exports for library consumers
tests/                       # mirrors src/ structure 1:1
```

## Key Patterns

- **Data-first pipeline** — 6 commands (scan, pulse, trace, gather, read, scope) use `runStructuredCommand()`: FETCH (X API or Grok x_search fallback) → ANALYZE (Grok JSON) → COMPUTE (metrics) → SNAPSHOT (store) → DIFF (compare). The `ask` command uses `runCommand()` for prose output.
- **Dual-path builders** — each builder in `src/core/builders/` has two paths: X API (rich engagement data) or Grok-only (x_search fallback when no X token). `CorvusDeps.x` being null triggers the fallback.
- **Agent pipeline** — `corvus agent` uses Grok-as-Planner: PLAN (Grok JSON) → EXECUTE (chain buildSnapshot calls) → REPLAN (adaptive) → SYNTHESIZE (AgentBrief). Locally-computed confidence and contradiction detection.
- **BuildResult<T>** — all 6 builders return `{ data, raw, cost, tweets, scores, newestTweetAt, citations }`. Agent executor calls these programmatically.
- **MCP server** — 7 tools registered via `McpServer` from `@modelcontextprotocol/sdk`. Tested with SDK's `Client` + `InMemoryTransport`. Lazy-inits `CorvusDeps` on first tool call.
- **Library mode** — `src/index.ts` exports adapters, builders, metrics, schemas, types. `import { buildScanSnapshot } from 'corvus-x'`.
- **Snapshots** — each structured command stores timestamped JSON snapshots in `~/.corvus/snapshots/`. On re-run, the differ compares current vs previous snapshot and shows changes.
- **Theme** — semantic color palette via `t.*` from `theme.ts`. All chalk calls go through theme. `isTTY` for TTY detection.
- **Cache** is wired into prose commands via `runCommand()`. Structured commands use snapshots instead.
- **Auth** checks env vars first (`CORVUS_GROK_KEY`, `CORVUS_X_BEARER_TOKEN`), falls back to `~/.corvus/credentials.json`.
- **watch** uses `setTimeout` chaining (not `setInterval`) to prevent async pile-up.
- **TUI** — `corvus` (no args) launches a full-screen Ink/React interactive terminal. Welcome screen shows crow art + logo, status panel, and quick start tips (or recent activity for returning users). First command transitions to chat view. Uses `useSession` reducer for state, `useCommand` hook for execution, `router.ts` for input parsing. Built on Ink 6 + React 19.
- **Tests** mock `openai` and `fetch` globally. Never make real API calls. MCP tests use SDK's `Client` + `InMemoryTransport`.

## Known Limitations

- **File permissions (0o600) are Unix-only** — no effect on Windows. Credentials at `~/.corvus/credentials.json` are not protected by filesystem permissions on Windows.
- **Grok API pricing is hardcoded** in `MODEL_PRICING` (`grok-adapter.ts`). Must be updated manually when pricing changes.
- **No `corvus cost` command** — cost ledger exists on disk (`~/.corvus/cost-ledger.json`) but no CLI command reads cumulative spend.
- **Cache has no max-size limit** — files accumulate indefinitely until manual `corvus cache clear` or `evictExpired()`.
- **eslint-plugin-react-hooks blocked** — peer dep requires ESLint <=9, we're on ESLint 10. TUI React hooks unlinted until upstream fix.
- **X username validation assumes 15-char max** — `X_USERNAME_RE` in `x-adapter.ts` enforces `[A-Za-z0-9_]{1,15}`. If X/Twitter increases the limit, this regex must be updated.
- **Always smoke-test after build** — `npm run build && node dist/bin/corvus.js --version`. Tests run against source (tsx), not compiled output.

## Commit Style

```
feat: feature — description
fix: area — what was fixed
test: scope — what was tested
chore: task — description
docs: what changed — context
```
