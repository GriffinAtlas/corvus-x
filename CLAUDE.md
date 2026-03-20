# Corvus — Project Context

## What This Is

Corvus (`corvus-x` on npm) is an open-source AI agent toolkit for X (Twitter) — investigate discourse and grow your presence, all from the terminal. Uses Grok's Responses API (`client.responses.create()`) with `x_search` and `web_search` tools. Multi-agent model for deep research, classic step-by-step as fallback.

**Author:** Roger Griffin (roger@griffinatlas.us)
**Repo:** github.com/GriffinAtlas/corvus-x

## Stack

- TypeScript (strict, ES2022, ESM with `"type": "module"`)
- Node.js >= 18
- Grok Responses API at `https://api.x.ai/v1` via OpenAI SDK
- Default model: `grok-4-1-fast` (commands), `grok-4.20-multi-agent-beta-0309` (agent)
- X API v2 at `https://api.x.com/2` via native `fetch`
- Commander (CLI), Vitest (tests), ESLint + Prettier (formatting)
- Ink 6 + React 19 + fullscreen-ink (TUI)
- No semicolons, single quotes, trailing commas, printWidth 100

## Commands

```bash
npm run dev -- <command>     # run without building (tsx)
npm run build                # tsc to dist/
npm test                     # vitest run (937 tests)
npm run lint                 # eslint
npm run format               # prettier
```

## Architecture

```
bin/corvus.ts                # entrypoint — registers commands, launches fullscreen TUI
src/
  cli/
    commands/                # 16 commands: agent, ask, scan, trace, pulse, profile, hooks,
                             #   draft, grow, review, timing, watch, auth, history, export
    output.ts                # renderers with takeaway/actions, percent bars, competition ratios
    theme.ts                 # gradient(), percentBar(), labeledDivider(), sparkline(), wave animation
    progress.ts              # StepProgress — animated step tracker for agent runs
  core/
    agent.ts                 # agentMulti() (default) + AgentPlanner/Executor/Synthesizer (--classic)
    grok-adapter.ts          # Responses API — client.responses.create(), 60s timeout
    x-adapter.ts             # X API v2 with ID validation (/^\d{1,20}$/)
    builders/                # 8 builders (scan, pulse, trace, profile, hooks, draft, review, timing)
    voice.ts                 # VoiceProfileManager — voice extraction for draft command
    schemas.ts               # Snapshot types with takeaway/actions, algorithmScore
    validators.ts            # Zod v4 schemas — .nullable() not .optional() for strict output
  mcp/server.ts              # 5 MCP tools (scan/pulse/trace/profile/agent)
  infra/auth.ts              # grokKey, xBearerToken, xHandle + env var precedence
  tui/
    app.tsx                  # Fullscreen TUI — withFullScreen() + useScreenSize()
    components/              # Animated crow (wave), breathing prompt, compact header, chat viewport
    hooks/                   # useCommand, useSession
    router.ts                # 16 commands + slash commands
  index.ts                   # public API surface
tests/                       # 937 tests across 50 files
```

## Key Patterns

- **Responses API** — `client.responses.create()` with `input[]`, `output_text`, tools as `{ type: 'x_search' }`. Structured output via `text.format` with `{ type: 'json_schema', name, schema, strict: true }`.
- **Multi-agent default** — `corvus agent` uses `grok-4.20-multi-agent-beta-0309`. Auto-falls back to classic (plan/execute/replan/synthesize) if unavailable.
- **Growth-focused prompts** — scan/hooks/draft optimized for creators, not analysts. Takeaway + actions at top. Competition ratios. No hashtags.
- **X algorithm scoring** — profile analysis uses verified weights from open-source algo: replies 13.5x, author replies 75x, likes 0.5x. replyRate computed from real tweet data. No hashtags (not a ranking signal). No bookmark ranking (not in PhoenixScores).
- **Spam filtering** — all Grok prompts instruct to filter spam, scams, memecoins, bots.
- **No cost displays** — can't calculate accurately with multi-agent internal tool calls.
- **Voice profile** — `profile @self` generates voice profile (fire-and-forget). `draft` loads it.
- **grow wiring** — hooks results feed into draft context for relevant post generation.

## Known Limitations

- **File permissions (0o600) are Unix-only** — no effect on Windows.
- **Grok API pricing is hardcoded** in `MODEL_PRICING`. Must update manually.
- **Cache has no max-size limit** — files accumulate until manual clear.
- **eslint-plugin-react-hooks blocked** — peer dep requires ESLint <=9, we're on 10.
- **TUI header scrolls off** — Ink limitation. fullscreen-ink helps but doesn't fully pin.
- **Multi-agent model is beta** — may not be available on all accounts. Falls back to classic.
- **Always smoke-test after build** — `npm run build && node dist/bin/corvus.js --version`.

## Commit Style

```
feat: feature — description
fix: area — what was fixed
test: scope — what was tested
chore: task — description
docs: what changed — context
```
