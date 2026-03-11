# Corvus — Design Spec

**Date:** 2026-03-10
**Status:** Approved
**Package:** `corvus-x` (npm)
**License:** MIT

## What Is Corvus

A terminal-native AI agent that gathers and synthesizes intelligence from X (Twitter) using Grok's native `x_search` and `web_search` capabilities. For developers, researchers, and power users who want X data without leaving the terminal.

Named for the genus of crows and ravens — among the most intelligent birds on Earth. In Norse mythology, Odin's ravens Huginn (thought) and Muninn (memory) flew across the world gathering intelligence. Corvus does the same across X.

## Who It's For

**Primary audience:**

- Developers tracking projects, tools, and industry discourse
- AI/ML researchers collecting and analyzing X data
- Open source maintainers monitoring community sentiment

**Secondary audience:**

- OSINT researchers and journalists
- Startup founders doing competitive intelligence
- Crypto/finance sentiment analysis

## Why It Exists

- Every X CLI tool today is a dumb API wrapper — no AI analysis
- Every AI CLI tool today is a coding assistant — none do social intelligence
- OSINT researchers lost their tools (Twint, GetOldTweets3) after X API changes
- Grok's API has native `x_search` — a structural advantage no other LLM has
- The terminal renaissance (2025-2026) proves developers want CLI-first tools
- Social media analytics is a $10-20B+ market with zero terminal-native options

## Architecture

Grok-first design. Grok API is the primary engine (native `x_search` + `web_search`). X API v2 is secondary — used for raw data export, streaming, and actions Grok can't perform.

```
                    USER
                      |
              +-------+-------+
              |   corvus cli   |
              |  (commander)   |
              +-------+-------+
                      |
                 parse intent
                      |
              +-------+-------+
              |  need AI?      |
              +---+-------+---+
                  |       |
              yes |       | no (--raw, gather)
                  |       |
          +-------v--+  +-v----------+
          | Grok API  |  |  X API v2   |
          | grok-4-1  |  | (tweets,    |
          | -fast     |  |  users,     |
          |           |  |  stream)    |
          | tools:    |  |             |
          | x_search  |  +------+-----+
          | web_search|         |
          +-----+-----+        |
                |               |
          +-----v---------------v-----+
          |     format output          |
          |  table / json / csv / md   |
          +-------------+-------------+
                        |
                    +---v---+
                    | cache  |  ~/.corvus/cache.db
                    +-------+
```

**Routing logic (honest version):**

- `--raw` flag or `gather` command → X API only, no AI
- `watch --live` → X API stream + periodic Grok analysis
- Everything else → Grok-first (it has x_search built in)
- Grok API key is the only required key. X API key is optional.

## Tech Stack

| Technology        | Purpose                             |
| ----------------- | ----------------------------------- |
| TypeScript        | Language                            |
| Node.js >= 18     | Runtime                             |
| `openai` npm      | Grok API client (OpenAI-compatible) |
| `twitter-api-sdk` | X API v2 client (optional features) |
| `commander`       | CLI argument parsing                |
| `ink` + `react`   | Terminal UI for REPL mode           |
| `ink-table`       | Formatted tables                    |
| `better-sqlite3`  | Local cache                         |
| `keytar`          | OS keychain credential storage      |
| `chalk`           | Terminal colors                     |
| `ora`             | Loading spinners                    |
| `conf`            | Config management                   |
| `zod`             | Output validation from Grok         |
| `vitest`          | Testing                             |

## Commands

| Command                  | What It Does                   | API                          |
| ------------------------ | ------------------------------ | ---------------------------- |
| `corvus ask "question"`  | Natural language query about X | Grok (x_search)              |
| `corvus scan <query>`    | Search tweets with AI summary  | Grok (x_search)              |
| `corvus scope <@handle>` | Profile analysis               | Grok (x_search) + X API      |
| `corvus read <topic>`    | Sentiment analysis             | Grok (x_search)              |
| `corvus trace <url>`     | Thread pull + summary          | X API + Grok                 |
| `corvus pulse`           | Trending topics with analysis  | Grok (x_search + web_search) |
| `corvus watch <query>`   | Real-time monitoring           | X API stream + Grok          |
| `corvus gather <query>`  | Export raw data                | X API                        |
| `corvus auth`            | API key setup wizard           | Local                        |
| `corvus` (no args)       | Interactive REPL               | Both                         |

**Global flags:**

- `--format table|json|csv|md` (default: table)
- `--raw` — skip AI, return raw X API data
- `--cost` — estimate cost before executing
- `--no-cache` — bypass cache
- `--no-animation` — disable ASCII animation
- `--profile <name>` — use specific API key profile
- `--verbose` / `--quiet`

## Identity and Voice

**Personality:** Sharp, knowing, direct. Not cute, not corporate. A crow that's seen everything.

**ASCII mascot:** Braille-dot crow silhouette. Two-frame breathing animation during loading (~500ms per frame, near-zero CPU). Static fallback for dumb terminals and CI. `--no-animation` flag to disable.

**Output style:** Dense, clean, typographic. No box-drawing decorations, no emoji headers. Information hierarchy through indentation, whitespace, and horizontal rules. Respects terminal culture.

**REPL voice:** Conversational but concise. Adds editorial value ("worth watching", "contrarian signal") beyond raw data. Not a chatbot — an informed analyst.

## Authentication

1. First run triggers `corvus auth` wizard
2. Grok API key (required) — stored in OS keychain via `keytar`
3. X API bearer token (optional) — enables streaming, raw export, account actions
4. Environment variable overrides: `CORVUS_GROK_KEY`, `CORVUS_X_BEARER_TOKEN`
5. Multiple profiles: `corvus auth add --profile work`
6. Fallback: encrypted `~/.corvus/credentials.json` when keytar unavailable (Linux servers)

## Caching

SQLite at `~/.corvus/cache.db`. TTLs:

- Search results: 15 min
- User profiles: 1 hour
- Sentiment snapshots: 15 min
- Thread content: 24 hours
- Trend data: 5 min

Cache key: `command:query:params_hash`. `--no-cache` bypasses. `corvus cache clear` flushes.

## Rate Limiting and Cost

- Token bucket per API (X API: 450-500 req/15min depending on tier)
- Cost estimation before expensive queries (via `--cost` flag)
- Session budget cap (configurable in `~/.corvus/config.json`)
- Grok 4.1 Fast default ($0.20/M input, $0.50/M output) — most queries < $0.01

## Error Handling

| Scenario             | Behavior                                 |
| -------------------- | ---------------------------------------- |
| No API keys          | First-run auth wizard                    |
| X API rate limited   | Backoff + use Grok x_search as fallback  |
| Grok API down        | Raw X API data (no AI) with warning      |
| Empty results        | Clear message + broader query suggestion |
| Long threads (500+)  | Paginate + summarize in chunks           |
| Invalid/expired keys | Detect on first call, prompt re-auth     |
| Network offline      | Cache-only mode with stale data warning  |
| Cost overrun         | Session budget hard stop                 |

## Distribution

| Channel         | Method                                                 | Version |
| --------------- | ------------------------------------------------------ | ------- |
| npm             | `npm install -g corvus-x` / `npx corvus-x`             | v0.1.0  |
| GitHub Releases | Standalone binaries via `pkg` or `bun build --compile` | v0.2.0  |
| Homebrew        | Custom tap                                             | v0.3.0  |

## Open Source Setup

- License: MIT
- Repository: GitHub
- CI: GitHub Actions (lint, test, build on PR; npm publish on tag)
- Issue templates: bug report, feature request
- Contributing guide with PR template
- Code of Conduct (Contributor Covenant)
- Changelog (Keep a Changelog format)

## Known Unknowns

| Unknown                       | Impact                     | Action                        |
| ----------------------------- | -------------------------- | ----------------------------- |
| Grok x_search rate limits     | Could throttle heavy usage | Test during prototype         |
| Grok x_search result quality  | Core UX dependency         | Compare vs raw X API search   |
| x_search per-call tool fee    | Affects cost story         | Measure during prototype      |
| X API pay-per-use beta access | Tier recommendation        | Monitor beta rollout          |
| keytar on Linux servers       | Auth UX                    | Build encrypted file fallback |
| ink + Grok streaming perf     | REPL responsiveness        | Benchmark during prototype    |

## Risks

| Risk                         | Severity | Mitigation                                       |
| ---------------------------- | -------- | ------------------------------------------------ |
| xAI changes x_search API     | High     | Adapter pattern — swap to X API + separate LLM   |
| X API pricing increases      | Medium   | Grok-first minimizes direct X API usage          |
| Grok response quality varies | Medium   | Structured prompts, zod validation, raw fallback |
| npm name collision           | Low      | `corvus-x` confirmed available                   |
| X ToS data display rules     | Medium   | Review developer agreement, comply               |

## Scope

**v1 (MVP):** 8 commands, REPL, Grok-first routing, SQLite cache, npm distribution, 2-frame crow animation, MIT license, GitHub CI.

**Future:** Plugin system, multi-LLM support (Claude, GPT, local), webhook alerts, team profiles, Homebrew distribution, standalone binaries, richer animations.
