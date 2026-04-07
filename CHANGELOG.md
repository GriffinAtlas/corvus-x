# Changelog

All notable changes to Corvus are documented here.

## [0.3.1] — 2026-04-06

First public release — Corvus ships to npm as an AI growth toolkit for X.

### Added

- **OSS metadata** — CHANGELOG, GitHub Actions CI workflow (Node 20/22), CODE_OF_CONDUCT, `.env.example`, `package.json` homepage and bugs fields
- **CI smoke-tests the built binary** after `tsc`, and runs `npm run lint` on `prepublishOnly`
- **Windows credentials warning** on `corvus auth setup` — surfaces the `credentials.json` file-permissions gap documented in SECURITY.md
- **Public API type exports** — `AgentPlan`, `XApiError`, `VoiceProfile` and others now exported from the main entry point; `exports` field includes the `types` condition for bundler resolution

### Changed

- **Front door is growth.** `corvus --help` leads with the Growth command group and `grow` as the first command. TUI welcome subtitle reordered. README opens with a `corvus grow` example. `package.json` description and `CLAUDE.md` intro now read "AI growth toolkit for X — find conversations, draft posts in your voice, investigate discourse"
- **Multi-agent cost shown with `~` prefix** — the `grok-4.20-multi-agent-0309` model may not expose all internal tool calls in `response.output[]`, so its cost is marked approximate. Classic mode and direct commands still show exact cost.
- **Node.js minimum bumped to 20** — Ink 6 and its dependency tree require it (regex `v` flag crashes on Node 18)
- **`corvus auth setup` ends with `Try: corvus grow "your topic"`** (was `corvus ask`)
- **`grow` timing analyzes topic activity**, not user history — cleaner behavior when running the daily workflow
- **Model IDs no longer use the `-beta-` suffix** — `grok-4.20-multi-agent-0309` everywhere; `MODEL_PRICING` keys updated

### Fixed

- **8 bugs from pre-release review:**
  - Stream abort signal in wrong position (timeout never fired)
  - CSV export crash on `ProfileSnapshot` sentiment
  - `x_handles` → `allowed_x_handles` (handle filtering silently ignored by Grok)
  - Agent hooks args leaking into `priorContext`
  - `profile @self` now resolves to the stored handle
  - Sentiment thresholds aligned (0.3 in both paths)
  - `newestTweetAt` NaN guard via `computeNewestTweetAt`
  - `StepProgress.skip()` negative counter
- **3 dependency vulnerabilities patched**
- **Zod v4 runtime validation** — `parseGrokJson` now accepts an optional Zod schema and validates when provided, wired through scan/pulse/trace/profile/voice builders
- **Error handling at boundaries** — `AbortError` shows "timed out after 60s" instead of a cryptic message; X API null-data guard for deleted tweets and suspended users; `ask.ts` validation exits cleanly instead of dumping a stack trace; snapshot save failure no longer crashes the command; X API network errors wrapped in `XApiError`; CLI agent fallback re-throws auth and rate-limit errors
- **Stale test counts and model names** across README, CHANGELOG, CLAUDE.md, CONTRIBUTING.md
- **README example output** now matches what `corvus grow` actually prints (previously inherited the `agent` command's shape)
- **TUI `grow` has per-step error handling** matching the CLI

### Removed

- **Dead code** — `repl.ts`, `status-line.tsx` and its tests, `AgentPlanSchema`, `ReplanDecisionSchema`, `resultBox`, `sparkline`, `LOGO`, `ConfigManager.exists`, unused `validCommands` aliases
- **Unused dependencies** — `ora`, `@pppp606/ink-chart`

## [0.3.0] — 2026-03-20

Growth pivot — Corvus shifts from pure intel to helping creators grow on X.

### Added

- **Growth commands** — `profile`, `hooks`, `draft`, `review`, `timing`, `grow` (daily workflow)
- **Voice profile system** — `profile @self` extracts your writing style; `draft` and `grow` use it automatically
- **Algorithm-aware scoring** — profile analysis uses verified X algorithm weights (replies 13.5x, author replies 75x, conversations 150x)
- **Multi-agent model** — `grok-4.20-multi-agent-0309` as default agent engine with auto-fallback to classic step-by-step
- **Responses API** — migrated from Chat Completions (410 Gone) to `client.responses.create()` with `x_search` and `web_search` tools
- **Growth-focused prompts** — competition ratios, reply windows, hook-first drafts, takeaway + actions at top
- **Spam filtering** — all Grok prompts filter spam, scams, memecoins, bots
- **Context compaction** — token usage tracking for agent runs, result compaction for long investigations
- **Actionable output** — scan and pulse now lead with takeaway + action items
- **Agent growth support** — agent can now plan hooks + draft steps alongside intel commands
- **Animated TUI** — wave crow animation, breathing prompt, fullscreen-ink integration
- **Usability** — command aliases, grouped help, key validation, examples on every command

### Fixed

- Responses API structured output (`.nullable()` not `.optional()` for strict mode)
- Grow command routing in TUI (was falling through to `ask`)
- Algorithm alignment — removed hashtags (not a ranking signal), corrected signal weights
- 20+ bugs from code review — parser, timers, cost tracking, rate-limit detection, exports
- 7 security issues — input validation, credential hardening, data truncation
- Agent timeout increased to 60s, auto-fallback when multi-agent unavailable
- TUI animation flicker, hooks order violation, content truncation
- Multi-agent cost shown with `~` prefix to indicate possible undercount of internal tool calls

### Removed

- `gather`, `read`, `scope` commands (replaced by growth commands)

## [0.2.0] — 2026-03-12

Data-first architecture rewrite — structured pipeline, TUI, agent engine, library mode.

### Added

- **Agent engine** — `AgentPlanner`, `AgentExecutor`, `AgentSynthesizer` with confidence scoring and contradiction detection
- **Full-screen TUI** — Ink 6 + React 19 interactive terminal with chat-style layout, viewport scrolling, keyboard shortcuts
- **Library mode** — public API surface via `corvus-x` imports (adapters, builders, types, validators)
- **MCP server** — 5 tools over stdio for AI agent integration (`corvus_scan`, `corvus_pulse`, `corvus_trace`, `corvus_profile`, `corvus_agent`)
- **Export command** — JSON, CSV, JSONL output for stored snapshots
- **Structured output** — Zod schemas for all Grok response types, `text.format` with `json_schema`
- **Engagement scoring** — weighted metrics using X algorithm research
- **Streaming** — `queryStream()` for progressive prose output
- **Citations** — Grok citations aggregated and rendered on agent briefs
- **Core infrastructure** — schemas, snapshots, metrics engine, snapshot diffing
- **X API optional** — all builders fall back to Grok-only when no bearer token configured
- **Step progress** — command-specific spinner labels in TUI

### Fixed

- ESLint v10 migration (flat config, unified typescript-eslint)
- Security hardening — replan command validation, username sanitization, directory permissions
- 17 bugs — agent budget, JSON parsing, metrics, differ, snapshots, TUI, CLI
- Auth stdin state conflict between `promptSecret` and readline
- Grok API tool format migrations (`live_search` → `x_search` + `web_search`)

## [0.1.0] — 2026-03-10

Initial release — CLI toolkit for investigating X discourse.

### Added

- **Core commands** — `ask`, `scan`, `pulse`, `trace`, `gather`, `read`, `scope`
- **Watch command** — live topic monitoring with periodic updates
- **Interactive REPL** — caching, session history, cost tracking
- **Grok adapter** — OpenAI SDK wrapper for xAI API
- **X API v2 adapter** — tweets, users, search, timeline endpoints with ID validation
- **File-based cache** — query cache with TTL and cost ledger
- **Auth system** — credential storage with env var overrides (`~/.corvus/credentials.json`)
- **Output formatters** — table, JSON, CSV, markdown
- **Open source packaging** — MIT license, README, SECURITY.md, CONTRIBUTING.md

### Fixed

- Security hardening — file permissions (0o600), error truncation, cache validation
- Error handling at external boundaries
- Critical startup crash and cache resilience

[0.3.1]: https://github.com/GriffinAtlas/corvus-x/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/GriffinAtlas/corvus-x/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/GriffinAtlas/corvus-x/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/GriffinAtlas/corvus-x/releases/tag/v0.1.0
