```
   _____ ___  _______ ___   ____  _______
  / ___// _ \/ __/ | / / | / / / / / ___/
 / /__ / // / _// || / /| |/ / /_/ /\__ \
 \___//____/___/_/|_/_/ |___/\____//____/
```

**AI-powered X intelligence in your terminal.**

[![npm version](https://img.shields.io/npm/v/corvus-x)](https://www.npmjs.com/package/corvus-x)
[![license](https://img.shields.io/npm/l/corvus-x)](LICENSE)
[![node](https://img.shields.io/node/v/corvus-x)](package.json)

Corvus is an open-source CLI agent that gathers and synthesizes intelligence from X (Twitter). It uses Grok's native `x_search` and `web_search` tools combined with the X API v2 to give you real-time analysis of discourse, accounts, narratives, and sentiment — all from your terminal.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ES2022, strict mode) |
| Runtime | Node.js >= 18 |
| AI | Grok API via OpenAI SDK (`grok-4-1-fast`) |
| Data | X API v2 (tweets, users, metrics) |
| CLI | Commander |
| Testing | Vitest (227 tests) |
| Linting | ESLint + Prettier |
| Module System | ESM (`"type": "module"`) |

## Install

```bash
npm install -g corvus-x
```

## Setup

```bash
corvus auth setup
```

You'll need:
- **Grok API key** from [console.x.ai](https://console.x.ai) (required)
- **X API bearer token** from [developer.x.com](https://developer.x.com) (optional — enables `read` and `scope` commands)

Keys can also be set via environment variables:

```bash
export CORVUS_GROK_KEY=xai-...
export CORVUS_X_BEARER_TOKEN=AAA...
```

## Commands

### `ask` — Question X discourse

```bash
corvus ask "what's the sentiment around AI agents right now?"
corvus ask --format json "who are the key voices in the AI safety debate?"
```

### `scan` — Scan a topic

Returns key voices, narratives, and engagement patterns.

```bash
corvus scan "AI regulation"
corvus scan --cost "quantum computing"
```

### `read` — Analyze a tweet

Fetches a tweet via X API and sends it to Grok for analysis. Requires X API token.

```bash
corvus read https://x.com/user/status/123456789
corvus read 123456789
```

### `scope` — Profile an account

Fetches a user's profile and recent tweets, then analyzes their influence and positioning. Requires X API token.

```bash
corvus scope @elonmusk
corvus scope -n 25 @naval
```

### `trace` — Trace a narrative

Track how a narrative is spreading across X.

```bash
corvus trace "AI will replace software engineers"
```

### `pulse` — Sentiment and momentum

Get the pulse on a topic — sentiment, momentum, key signals.

```bash
corvus pulse "bitcoin"
corvus pulse --format md "election 2026"
```

### `gather` — Comprehensive intelligence

Deep intelligence gathering using both X search and web search.

```bash
corvus gather "OpenAI leadership changes"
```

### `watch` — Live monitoring

Monitor a topic with periodic Grok-powered updates.

```bash
corvus watch "breaking news" -i 30       # check every 30 seconds
corvus watch "earnings season" -n 10     # stop after 10 cycles
corvus watch --cost "bitcoin"            # estimate cost first
```

### `repl` — Interactive session

Start an interactive intelligence session with session history and cost tracking.

```bash
corvus repl
corvus repl --format json
```

REPL commands: `/help`, `/format <type>`, `/history`, `/cost`, `/clear`, `/exit`

## Output Formats

All commands support `-f` / `--format`:

| Format | Description |
|--------|-------------|
| `table` | Default. Clean terminal output with cost display |
| `json` | Machine-readable JSON |
| `csv` | CSV with headers |
| `md` | Markdown |

## Cost Tracking

Every command tracks API spend. Use `--cost` on any command to preview pricing before executing. The REPL tracks cumulative session cost with `/cost`.

Costs are persisted to `~/.corvus/cost-ledger.json`.

## Architecture

```
corvus/
  bin/corvus.ts            # CLI entrypoint
  src/
    cli/
      commands/            # ask, scan, read, scope, trace, pulse, gather, watch, auth
      run-command.ts       # shared auth/cache/spinner/error runner
      output.ts            # table, json, csv, md formatters
      repl.ts              # interactive session
    core/
      grok-adapter.ts      # Grok API via OpenAI SDK
      x-adapter.ts         # X API v2 client
      cache.ts             # file-based query cache with TTL
      types.ts             # shared types
    infra/
      auth.ts              # credential storage (env > file)
      config.ts            # config directory management
  tests/                   # mirrors src/ structure, 227 tests
```

## Configuration

All runtime data is stored in `~/.corvus/`:

| File | Purpose |
|------|---------|
| `config.json` | General configuration |
| `credentials.json` | API keys (file permissions: 0600) |
| `cost-ledger.json` | Cumulative API spend tracking |
| `cache/` | Query response cache (TTL-based) |

## License

[MIT](LICENSE) — Roger Griffin ([@GriffinAtlas](https://github.com/GriffinAtlas))
