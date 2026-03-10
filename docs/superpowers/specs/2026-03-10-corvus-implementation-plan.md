# Corvus — Implementation Plan

**Spec:** `2026-03-10-corvus-design.md`
**Phases:** 10
**Dependency graph below**

## Dependency Graph

```
Phase 1 (Scaffold)
  |
  +---> Phase 2 (Auth/Config)
  |       |
  |       +---> Phase 3 (Grok Adapter)---+
  |       |                               |
  |       +---> Phase 4 (X Adapter)-------+---> Phase 9 (Watch)
  |                                       |
  +---> Phase 5 (Cache)------------------+---> Phase 7 (Commands)
  |                                       |       |
  +---> Phase 6 (Output Formatters)------+       +---> Phase 8 (REPL)
                                                  |       |
                                                  +-------+---> Phase 10 (Launch)
```

**Parallelizable:** Phases 3+4 can run in parallel. Phases 5+6 can run in parallel.

---

## Phase 1: Project Scaffold and Tooling

**Goal:** Empty but runnable project with all tooling configured.

**Steps:**
1. `mkdir corvus && cd corvus && git init`
2. `npm init` — name: `corvus-x`, version: `0.1.0`
3. Install dev dependencies:
   - `typescript`, `@types/node`
   - `vitest` (testing)
   - `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`
   - `prettier`
   - `tsx` (dev runner)
4. Create `tsconfig.json` — target ES2022, module NodeNext, outDir dist/
5. Create directory structure:
   ```
   bin/corvus.ts       — entry point with #!/usr/bin/env node
   src/index.ts        — main export
   src/cli/            — command handlers
   src/core/           — adapters and engine
   src/infra/          — auth, cache, config, rate limiting
   tests/              — mirrors src/
   assets/             — ASCII frames
   docs/               — user docs
   ```
6. Add `bin` field to package.json: `"bin": { "corvus": "./dist/bin/corvus.js" }`
7. Add npm scripts: `build`, `dev`, `test`, `lint`, `format`
8. Create `.gitignore` (node_modules, dist, .env, *.db)
9. Verify: `npm run build && npx . --help` outputs placeholder help text

**Tests:** Build succeeds. `corvus --version` outputs `0.1.0`.

---

## Phase 2: Auth and Config System

**Goal:** Users can store and retrieve API keys securely.

**Files:**
- `src/infra/auth.ts` — key storage and retrieval
- `src/infra/config.ts` — config file management
- `src/cli/commands/auth.ts` — auth wizard command

**Steps:**
1. Define config schema (zod):
   ```typescript
   const ConfigSchema = z.object({
     activeProfile: z.string().default('default'),
     profiles: z.record(z.object({
       grokKey: z.string().optional(),
       xBearerToken: z.string().optional(),
     })),
     cache: z.object({
       enabled: z.boolean().default(true),
       ttlOverrides: z.record(z.number()).optional(),
     }),
     display: z.object({
       animation: z.boolean().default(true),
       defaultFormat: z.enum(['table', 'json', 'csv', 'md']).default('table'),
     }),
     budget: z.object({
       sessionMaxUsd: z.number().default(1.0),
     }),
   })
   ```
2. Implement `ConfigManager` class:
   - Reads/writes `~/.corvus/config.json`
   - Creates directory on first run
   - Merges defaults with user overrides
3. Implement `AuthManager` class:
   - Primary: `keytar` for OS keychain (service: `corvus-x`)
   - Fallback: encrypted JSON at `~/.corvus/credentials.json` (when keytar unavailable)
   - Env var override: `CORVUS_GROK_KEY`, `CORVUS_X_BEARER_TOKEN`
   - Methods: `getGrokKey()`, `getXToken()`, `setGrokKey()`, `setXToken()`
4. Implement `corvus auth` command:
   - Interactive prompts for Grok key (required) and X token (optional)
   - Validates keys by making test API calls
   - `corvus auth add --profile <name>` for multi-profile
   - `corvus auth status` to show current config (keys masked)
5. First-run detection: if no config exists, auto-run auth wizard

**Tests:**
- Config read/write/merge
- Auth store/retrieve (mock keytar)
- Env var override precedence
- First-run detection

---

## Phase 3: Grok API Adapter

**Goal:** Reliable interface to Grok with x_search and web_search tools.

**Files:**
- `src/core/grok-adapter.ts`
- `src/core/types.ts` — shared interfaces

**Steps:**
1. Install `openai` npm package
2. Create `GrokAdapter` class:
   ```typescript
   class GrokAdapter {
     private client: OpenAI

     constructor(apiKey: string) {
       this.client = new OpenAI({
         apiKey,
         baseURL: 'https://api.x.ai/v1',
       })
     }

     async query(prompt: string, options: QueryOptions): Promise<GrokResponse>
     async *stream(prompt: string, options: QueryOptions): AsyncGenerator<string>
   }
   ```
3. Implement tool configuration:
   ```typescript
   const tools = [
     { type: 'x_search' },   // native X search
     { type: 'web_search' },  // web browsing
   ]
   ```
4. Implement system prompts per command type:
   - Scan: "Search X for tweets about {topic}. Return: summary, key tweets with authors, engagement metrics, sentiment."
   - Read: "Analyze sentiment of X discourse about {topic}. Return: score (-1 to 1), volume, drivers, top bullish signals, top bearish signals."
   - Scope: "Analyze the X profile and recent activity of {handle}. Return: bio summary, posting patterns, influence metrics, key themes."
   - Etc.
5. Implement structured output parsing with zod:
   - Define response schemas per command type
   - Parse Grok's natural language into structured data
   - Fallback to raw text if structured parsing fails
6. Implement streaming for REPL mode
7. Implement cost tracking:
   - Count input/output tokens from API response
   - Calculate cost based on model pricing
   - Return cost alongside response data

**Tests:**
- Mock API responses, verify parsing
- Streaming token assembly
- Error handling (401, 429, 500, network)
- Cost calculation accuracy

---

## Phase 4: X API Adapter

**Goal:** Raw X API access for data export, streaming, and enrichment.

**Files:**
- `src/core/x-adapter.ts`

**Steps:**
1. Install `twitter-api-sdk`
2. Create `XAdapter` class:
   ```typescript
   class XAdapter {
     private client: TwitterApi | null

     constructor(bearerToken?: string) {
       this.client = bearerToken ? new TwitterApi(bearerToken) : null
     }

     isAvailable(): boolean
     async searchTweets(query: string, options: SearchOptions): Promise<Tweet[]>
     async getUser(handle: string): Promise<User>
     async getThread(tweetId: string): Promise<Tweet[]>
     async *stream(query: string): AsyncGenerator<Tweet>
   }
   ```
3. Implement pagination handler — auto-follows `next_token`
4. Implement rate limit tracker:
   - Read `x-rate-limit-remaining` headers
   - Token bucket with configurable limits
   - Backoff when approaching limits
5. All methods return `null` gracefully when no X API key configured
6. Implement filtered stream setup for `watch` command

**Tests:**
- Mock API responses
- Pagination token following
- Rate limit detection and backoff
- Graceful null when unconfigured

---

## Phase 5: Cache Layer

**Goal:** Reduce API calls and costs with local caching.

**Files:**
- `src/infra/cache.ts`

**Steps:**
1. Install `better-sqlite3` and `@types/better-sqlite3`
2. Create `Cache` class:
   ```typescript
   class Cache {
     private db: Database

     constructor(dbPath: string) // default: ~/.corvus/cache.db

     get<T>(key: string): T | null        // returns null if expired
     set(key: string, value: unknown, ttlMs: number): void
     clear(): void
     stats(): { entries: number, sizeBytes: number }
   }
   ```
3. SQLite schema:
   ```sql
   CREATE TABLE cache (
     key TEXT PRIMARY KEY,
     value TEXT,           -- JSON serialized
     created_at INTEGER,
     expires_at INTEGER
   )
   ```
4. Cache key generation: `${command}:${query}:${hash(params)}`
5. TTL defaults (configurable via config.json):
   - search: 900000 (15 min)
   - user: 3600000 (1 hour)
   - sentiment: 900000 (15 min)
   - thread: 86400000 (24 hours)
   - trend: 300000 (5 min)
6. Auto-cleanup: delete expired entries on each `get()` call (lazy)
7. `corvus cache clear` command
8. `corvus cache stats` command

**Tests:**
- Set/get with TTL expiry
- Cache miss returns null
- Clear works
- Key generation is deterministic

---

## Phase 6: Output Formatters

**Goal:** Multiple output formats with a distinctive visual style.

**Files:**
- `src/cli/output.ts`
- `src/cli/ascii.ts` — crow animation frames

**Steps:**
1. Install `chalk`, `ink-table`, `ora`
2. Define `OutputFormatter` interface:
   ```typescript
   interface OutputFormatter {
     format(data: CommandResult, style: 'table' | 'json' | 'csv' | 'md'): string
   }
   ```
3. Implement table formatter:
   - Dense typographic style
   - Indentation-based hierarchy
   - Thin horizontal rules (unicode `───`)
   - No box-drawing around content
   - chalk for subtle color (dim for metadata, bold for key data)
4. Implement JSON formatter:
   - Clean, predictable structure
   - Suitable for `| jq` piping
5. Implement CSV formatter:
   - Headers + rows
   - Proper escaping
6. Implement markdown formatter:
   - Headers, lists, tables
   - Suitable for pasting into docs/issues
7. Create ASCII crow frames in `assets/crow-frames.ts`:
   - Frame 1: wings neutral
   - Frame 2: wings shifted (breathing effect)
   - Static banner with version
   - Startup sequence (3 frames, crow appearing)
8. Implement animation controller:
   - Detect terminal capabilities (NO_COLOR, TERM=dumb, pipe detection)
   - 500ms frame interval for breathing
   - Auto-stop when content starts streaming
   - `--no-animation` flag

**Tests:**
- Each format produces valid output
- JSON is parseable
- CSV handles commas in content
- Animation disabled when piped (process.stdout.isTTY)

---

## Phase 7: Core Commands

**Goal:** All 8 commands working end-to-end.

**Files:**
- `src/cli/commands/ask.ts`
- `src/cli/commands/scan.ts`
- `src/cli/commands/read.ts`
- `src/cli/commands/scope.ts`
- `src/cli/commands/trace.ts`
- `src/cli/commands/pulse.ts`
- `src/cli/commands/gather.ts`
- `src/cli/commands/cache.ts`
- `bin/corvus.ts` — commander setup with all commands registered

**Steps:**
1. Install `commander`
2. Set up commander in `bin/corvus.ts`:
   - Version, description, global flags
   - Register each command
3. Implement each command following the same pattern:
   ```typescript
   async function handleScan(query: string, options: ScanOptions) {
     // 1. Check cache
     // 2. Build Grok prompt with system instructions
     // 3. Call GrokAdapter.query() (or XAdapter if --raw)
     // 4. Parse structured response
     // 5. Cache result
     // 6. Format and output
   }
   ```
4. Implement `--cost` flag:
   - Estimate tokens before calling
   - Display estimated cost
   - Prompt for confirmation if above threshold
5. Implement `--raw` flag:
   - Skip Grok, go directly to X API
   - Requires X API key to be configured
   - Output raw tweet data
6. Wire up routing logic:
   - Most commands → Grok-first
   - `gather` → X API only
   - `trace` → X API for thread data + Grok for summary
   - `watch` → separate (Phase 9)
7. Error handling per command:
   - No Grok key → "Run corvus auth first"
   - No X key + --raw → "X API key required for --raw mode"
   - API error → human-readable message + retry suggestion

**Tests:**
- Each command with mocked APIs
- Flag combinations (--raw, --format, --cost)
- Error cases (no auth, API errors, empty results)
- Cache hit vs cache miss paths

---

## Phase 8: Interactive REPL

**Goal:** Conversational terminal interface with personality.

**Files:**
- `src/cli/repl.tsx` — ink-based REPL app
- `src/cli/components/` — ink components

**Steps:**
1. Install `ink`, `react`, `@types/react`, `ink-text-input`
2. Create REPL app component:
   ```tsx
   function CorvusRepl() {
     // State: messages[], input, loading, animationFrame
     // On submit: parse input, route to command handler, stream response
     // Display: crow banner, message history, current input
   }
   ```
3. Implement startup sequence:
   - Show crow ASCII with frame animation (3 frames over ~600ms)
   - Display version
   - Show "listening." prompt
4. Implement input handling:
   - Natural language → routed to `ask` command
   - Explicit commands (`scan`, `read`, etc.) → routed to respective handlers
   - `help` → show available commands
   - `exit` / Ctrl+C → clean exit
5. Implement streaming display:
   - Grok tokens stream in real-time
   - Crow breathing animation while waiting
   - Animation stops when first token arrives
6. Implement conversation context:
   - Keep last N messages in context
   - Support follow-up queries ("tell me more", "dig deeper")
   - `export last --json` to export last response
7. Command history:
   - Store in `~/.corvus/history`
   - Up/down arrow navigation

**Tests:**
- Render tests with ink-testing-library
- Input routing (natural language vs commands)
- Streaming token assembly
- History persistence

---

## Phase 9: Watch Command (Live Monitoring)

**Goal:** Real-time X stream with periodic AI analysis.

**Files:**
- `src/cli/commands/watch.ts`

**Steps:**
1. Implement using X API filtered stream (requires X API key)
2. Set up stream with filter rules for query
3. Display incoming tweets in real-time (table format)
4. Every N minutes (configurable, default 5):
   - Batch recent tweets
   - Send to Grok for analysis summary
   - Display summary inline
5. Implement session budget:
   - Track cumulative Grok costs
   - Warn at 80% of budget
   - Hard stop at 100%
6. Graceful Ctrl+C: close stream, show session summary (tweets seen, cost)
7. Fallback: if no X API key, use periodic Grok x_search polling instead

**Tests:**
- Mock stream events
- Budget tracking
- Summary trigger timing
- Graceful shutdown

---

## Phase 10: Open Source Packaging and Launch

**Goal:** Published, installable, documented open source tool.

**Files:**
- `README.md` — hero section, install, quickstart, commands, examples
- `LICENSE` — MIT
- `CONTRIBUTING.md` — how to contribute, dev setup, PR process
- `CODE_OF_CONDUCT.md` — Contributor Covenant
- `CHANGELOG.md` — Keep a Changelog format
- `.github/workflows/ci.yml` — lint, test, build on PR
- `.github/workflows/release.yml` — npm publish on git tag
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.npmignore`

**Steps:**
1. Write README:
   - ASCII crow banner at top
   - One-line description
   - Install command
   - Quick demo (terminal recording or screenshot)
   - Command reference table
   - Example use cases (developer-focused)
   - Configuration docs
   - Contributing link
2. Create all community files (LICENSE, CONTRIBUTING, etc.)
3. Set up GitHub Actions:
   - CI: on pull_request → `npm ci && npm run lint && npm run test && npm run build`
   - Release: on tag push `v*` → `npm publish`
4. Configure `.npmignore`: tests, docs, .github, src (only ship dist)
5. `npm pack` dry run — verify only intended files included
6. `npm link` local test — verify global install works
7. Test on fresh machine or clean environment
8. Create GitHub repo, push, verify CI passes
9. `npm publish` — v0.1.0
10. Create GitHub release with changelog

**Tests:**
- CI pipeline passes
- npm pack includes correct files
- `npx corvus-x --version` works after publish
- Global install + `corvus --help` works

---

## Build Order (Critical Path)

```
Week 1:  Phase 1 (scaffold)
         Phase 5 (cache) + Phase 6 (output) — parallel
Week 2:  Phase 2 (auth)
         Phase 3 (Grok adapter) + Phase 4 (X adapter) — parallel
Week 3:  Phase 7 (commands) — depends on 3, 5, 6
Week 4:  Phase 8 (REPL) + Phase 9 (watch) — parallel after 7
Week 5:  Phase 10 (launch)
```

## Pre-Implementation Checklist

- [ ] Create GitHub repo (`corvus-x`)
- [ ] Register npm account (if not already)
- [ ] Get Grok API key from console.x.ai
- [ ] Get X API bearer token from developer.x.com (optional for v1)
- [ ] Decide: `corvus-x` or `@yourorg/corvus` for npm package name
