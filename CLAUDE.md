# Corvus — Project Context

## What This Is

Corvus (`corvus-x` on npm) is an open-source AI agent toolkit for X (Twitter) — investigate discourse and grow your presence, all from the terminal. It uses Grok's Responses API (`client.responses.create()`) with `x_search` and `web_search` tools via the OpenAI SDK, and X API v2 for direct data access.

**Author:** Roger Griffin (roger@griffinatlas.us)
**Repo:** github.com/GriffinAtlas/corvus-x

## Stack

- TypeScript (strict, ES2022, ESM with `"type": "module"`)
- Node.js >= 18
- Grok Responses API at `https://api.x.ai/v1` via OpenAI SDK (model: `grok-4-1-fast`)
- X API v2 at `https://api.x.com/2` via native `fetch`
- Commander (CLI), Vitest (tests), ESLint + Prettier (formatting)
- Ink 6 + React 19 + fullscreen-ink (TUI)
- No semicolons, single quotes, trailing commas, printWidth 100

## Commands

```bash
npm run dev -- <command>     # run without building (tsx)
npm run build                # tsc to dist/
npm test                     # vitest run (916 tests)
npm run lint                 # eslint
npm run format               # prettier
```

## Architecture

```
bin/corvus.ts                # entrypoint — registers commands, launches fullscreen TUI
bin/corvus-mcp.ts            # standalone MCP server entrypoint (stdio)
src/
  cli/
    commands/                # 16 commands: agent, ask, scan, trace, pulse, profile, hooks, draft, grow, review, timing, watch, auth, history, export
    run-command.ts           # shared runner — runCommand() for prose, runStructuredCommand() for data-first
    output.ts                # renderers with percent bars, labeled dividers, sparklines
    theme.ts                 # gradient(), percentBar(), labeledDivider(), sparkline(), sentimentBar()
    progress.ts              # StepProgress — animated step tracker for agent runs
  core/
    agent.ts                 # AgentPlanner, AgentExecutor, AgentSynthesizer
    grok-adapter.ts          # Grok Responses API — client.responses.create(), x_search/web_search tools
    x-adapter.ts             # X API v2 with ID validation (/^\d{1,20}$/)
    builders/                # 8 builders (scan, pulse, trace, profile, hooks, draft, review, timing)
    voice.ts                 # VoiceProfileManager — voice profile extraction for draft command
    orchestrator.ts          # executeStructuredQuery — shared snapshot orchestration
    schemas.ts               # Snapshot types with algorithmScore, match keys
    validators.ts            # Zod v4 schemas — .nullable() not .optional() for strict output
    differ.ts, cache.ts, metrics.ts, snapshots.ts, types.ts
  mcp/server.ts              # MCP server — 5 tools (scan/pulse/trace/profile/agent)
  infra/auth.ts              # AuthManager — grokKey, xBearerToken, xHandle + env var precedence
  tui/
    app.tsx                  # Fullscreen TUI — withFullScreen() + useScreenSize()
    components/              # compact-header (pinned), chat-viewport, input-bar, welcome-view
    hooks/                   # useCommand, useSession
    router.ts                # input parser (16 commands + slash commands)
  index.ts                   # public API surface
tests/                       # 916 tests across 50 files
```

## Key Patterns

- **Dual-mode CLI** — Intel (agent, scan, pulse, trace, watch) + Growth (grow, profile, hooks, draft, review, timing).
- **Responses API** — `client.responses.create()` with `input[]` (not `messages[]`), `output_text` (not `choices[0].message.content`), tools as `{ type: 'x_search' }`.
- **Structured output** — `text.format` with extracted `zodResponseFormat()` fields: `{ type: 'json_schema', name, schema, strict: true }`. All schema fields must use `.nullable()` not `.optional()`.
- **Algorithm scoring** — profile analysis uses X algorithm weights: replies 13.5x, author replies 75x, conversations 150x, bookmarks 10x, likes 0.5x.
- **Voice profile** — `corvus profile @self` generates voice profile (fire-and-forget). `corvus draft` loads it.
- **Fullscreen TUI** — `fullscreen-ink` wraps the app in alternate screen buffer with pinned header/footer.
- **BuildResult<T>** — all builders return `{ data, raw, cost, tweets, scores, newestTweetAt, citations }`.
- **Auth** — env vars first (`CORVUS_GROK_KEY`, `CORVUS_X_BEARER_TOKEN`, `CORVUS_X_HANDLE`), falls back to `~/.corvus/credentials.json`.

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
