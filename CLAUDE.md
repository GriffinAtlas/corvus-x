# Corvus — Project Context

## What This Is

Corvus (`corvus-x` on npm) is an open-source AI agent toolkit for X (Twitter) — investigate discourse and grow your presence, all from the terminal. It uses Grok's native `x_search/web_search` tool via the OpenAI SDK and X API v2 for direct data access.

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
npm test                     # vitest run (912 tests)
npm run lint                 # eslint
npm run format               # prettier
```

## Architecture

```
bin/corvus.ts                # entrypoint — registers all commands, calls program.parse()
bin/corvus-mcp.ts            # standalone MCP server entrypoint (stdio)
src/
  cli/
    commands/                # agent, ask, scan, trace, pulse, profile, hooks, draft, review, timing, watch, auth, history, export
    run-command.ts           # shared runner — runCommand() for prose, runStructuredCommand() for data-first
    output.ts                # formatOutput() for prose, formatStructuredOutput() with per-command renderers
    progress.ts              # StepProgress — multi-line in-place step tracker for agent runs
    theme.ts                 # Color palette (t.*), TTY detection, visual primitives
    repl.ts                  # interactive session with readline (deprecated — use TUI)
  core/
    agent.ts                 # AgentPlanner, AgentExecutor, AgentSynthesizer — autonomous investigation pipeline
    grok-adapter.ts          # GrokAdapter class — wraps OpenAI SDK pointed at x.ai, parseGrokJson, retry/timeout
    x-adapter.ts             # XAdapter class — X API v2 (tweets, users, search, formatTweetsForAnalysis, pagination)
    builders/                # 8 builders (scan, pulse, trace, profile, hooks, draft, review, timing) + grok-only.ts helper
    voice.ts                 # VoiceProfileManager — extract/store writing style from user's posts
    orchestrator.ts          # executeStructuredQuery — shared snapshot orchestration for CLI + TUI
    cache.ts                 # QueryCache — file-based with SHA-256 keys, TTL, cost ledger
    schemas.ts               # Snapshot interfaces, match keys, Grok response shapes
    snapshots.ts             # SnapshotStore — timestamped JSON snapshots with auto-prune
    metrics.ts               # Pure compute functions — baseMetrics, sentiment, topAccounts, confidence, contradictions
    validators.ts            # Zod v4 schemas for Grok response types + agent plan/replan
    differ.ts                # Generic structured diff engine for snapshot comparison
    types.ts                 # GrokResponse, QueryOptions, CorvusDeps, BuildResult
  mcp/
    server.ts                # MCP server — 5 tools (scan/pulse/trace/profile/agent) via McpServer
  infra/
    auth.ts                  # AuthManager — stores grokKey, xBearerToken, xHandle. Env vars take precedence.
    config.ts                # ConfigManager — manages ~/.corvus/ directory
  tui/
    app.tsx                  # TUI root — Ink/React full-screen interactive terminal
    components/              # welcome-view, welcome-header, status-panel, input-bar, chat-log, etc.
    hooks/                   # useCommand (execute + dispatch), useSession (state + reducer)
    router.ts                # parse user input to command + args
  index.ts                   # public API surface for library consumers
tests/                       # mirrors src/ structure 1:1
```

## Key Patterns

- **Dual-mode CLI** — Intel commands (agent, scan, pulse, trace) for investigating X discourse. Growth commands (profile, hooks, draft, review, timing) for growing your X presence.
- **Data-first pipeline** — structured commands use `runStructuredCommand()`: FETCH → ANALYZE → COMPUTE → SNAPSHOT → DIFF. The `ask` command uses `runCommand()` for prose.
- **Dual-path builders** — each builder has X API path (rich engagement data) or Grok-only path (x_search/web_search fallback). `CorvusDeps.x` being null triggers fallback.
- **Agent pipeline** — `corvus agent` uses Grok-as-Planner: PLAN → EXECUTE → REPLAN → SYNTHESIZE. Plans with scan/pulse/trace/profile only.
- **BuildResult<T>** — all builders return `{ data, raw, cost, tweets, scores, newestTweetAt, citations }`.
- **MCP server** — 5 tools via `McpServer`. Lazy-inits deps on first call.
- **Voice profile** — `VoiceProfileManager` extracts writing style, stores at `~/.corvus/voice-profile.json`. Used by `draft` command.
- **Auth** — env vars first (`CORVUS_GROK_KEY`, `CORVUS_X_BEARER_TOKEN`, `CORVUS_X_HANDLE`), falls back to `~/.corvus/credentials.json`.
- **TUI** — `corvus` (no args) launches full-screen Ink/React terminal. Ink 6 + React 19.
- **Tests** mock `openai` and `fetch` globally. Never make real API calls.

## Known Limitations

- **File permissions (0o600) are Unix-only** — no effect on Windows.
- **Grok API pricing is hardcoded** in `MODEL_PRICING`. Must update manually.
- **No `corvus cost` command** — cost ledger exists but no CLI reader.
- **Cache has no max-size limit** — files accumulate until manual clear.
- **eslint-plugin-react-hooks blocked** — peer dep requires ESLint <=9, we're on 10.
- **X username validation assumes 15-char max** — `X_USERNAME_RE` in `x-adapter.ts`.
- **Always smoke-test after build** — `npm run build && node dist/bin/corvus.js --version`.

## Commit Style

```
feat: feature — description
fix: area — what was fixed
test: scope — what was tested
chore: task — description
docs: what changed — context
```
