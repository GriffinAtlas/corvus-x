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
npm test                     # vitest run (200 tests)
npm run lint                 # eslint
npm run format               # prettier
```

## Architecture

```
bin/corvus.ts                # entrypoint — registers all commands, calls program.parse()
src/
  cli/
    commands/                # ask, scan, read, scope, trace, pulse, gather, watch, auth
    run-command.ts           # IMPORTANT: shared runner — auth, cache, spinner, error handling
    output.ts                # formatOutput() — table, json, csv, md
    repl.ts                  # interactive session with readline
  core/
    grok-adapter.ts          # GrokAdapter class — wraps OpenAI SDK pointed at x.ai
    x-adapter.ts             # XAdapter class — X API v2 (tweets, users, search)
    cache.ts                 # QueryCache — file-based with SHA-256 keys, TTL, cost ledger
    types.ts                 # GrokResponse, QueryOptions, CommandResult, etc.
  infra/
    auth.ts                  # AuthManager — env vars take precedence over ~/.corvus/credentials.json
    config.ts                # ConfigManager — manages ~/.corvus/ directory
tests/                       # mirrors src/ structure 1:1
```

## Key Patterns

- **All 7 query commands** (ask, scan, read, scope, trace, pulse, gather) use `runCommand()` from `run-command.ts`. To add a new command: create the file, define a system prompt, pick tool flags, call `runCommand()`, register in `bin/corvus.ts`.
- **Cache** is wired into all commands via `runCommand()`. Tests mock it with a no-op class.
- **Auth** checks env vars first (`CORVUS_GROK_KEY`, `CORVUS_X_BEARER_TOKEN`), falls back to `~/.corvus/credentials.json`.
- **watch** uses `setTimeout` chaining (not `setInterval`) to prevent async pile-up.
- **Tests** mock `openai` and `fetch` globally. Never make real API calls.

## Known Limitations

- **File permissions (0o600) are Unix-only** — no effect on Windows. Credentials at `~/.corvus/credentials.json` are not protected by filesystem permissions on Windows.
- **Grok API pricing is hardcoded** in `MODEL_PRICING` (`grok-adapter.ts`). Must be updated manually when pricing changes.
- **No `corvus cost` command** — cost ledger exists on disk (`~/.corvus/cost-ledger.json`) but no CLI command reads cumulative spend. Only per-session cost visible via REPL `/cost`.
- **Cache has no max-size limit** — files accumulate indefinitely until manual `corvus cache clear` or `evictExpired()`.
- **Always smoke-test after build** — `npm run build && node dist/bin/corvus.js --version`. Tests run against source (tsx), not compiled output.

## Commit Style

```
feat: feature — description
fix: area — what was fixed
test: scope — what was tested
chore: task — description
docs: what changed — context
```
