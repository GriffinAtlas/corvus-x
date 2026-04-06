# Changelog

All notable changes to Corvus are documented here.

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

[0.3.0]: https://github.com/GriffinAtlas/corvus-x/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/GriffinAtlas/corvus-x/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/GriffinAtlas/corvus-x/releases/tag/v0.1.0
