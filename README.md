# corvus

AI-powered X intelligence in your terminal. Corvus uses Grok's native `x_search` and `web_search` tools combined with the X API v2 to gather and synthesize intelligence from X (Twitter).

## Install

```bash
npm install -g corvus-x
```

Requires Node.js 18+.

## Setup

```bash
corvus auth setup
```

You'll need:
- **Grok API key** from [console.x.ai](https://console.x.ai) (required)
- **X API bearer token** from [developer.x.com](https://developer.x.com) (optional, enables `read` and `scope` commands)

Keys can also be set via environment variables:
```bash
export CORVUS_GROK_KEY=xai-...
export CORVUS_X_BEARER_TOKEN=AAA...
```

## Commands

### ask

Ask a natural language question about X discourse.

```bash
corvus ask "what's the sentiment around AI agents right now?"
corvus ask --format json "who are the key voices in the AI safety debate?"
```

### scan

Scan X discourse on a topic. Returns key voices, narratives, and engagement patterns.

```bash
corvus scan "AI regulation"
corvus scan --cost "quantum computing"
```

### read

Analyze a specific tweet. Requires X API token.

```bash
corvus read https://x.com/user/status/123456789
corvus read 123456789
```

### scope

Profile analysis of an X account. Requires X API token.

```bash
corvus scope @elonmusk
corvus scope -n 25 @naval
```

### trace

Trace the spread of a narrative across X.

```bash
corvus trace "AI will replace software engineers"
```

### pulse

Get the pulse on a topic — sentiment, momentum, key signals.

```bash
corvus pulse "bitcoin"
corvus pulse --format md "election 2026"
```

### gather

Comprehensive intelligence gathering. Uses both X search and web search for thorough analysis.

```bash
corvus gather "OpenAI leadership changes"
```

### watch

Live-monitor a topic with periodic updates.

```bash
corvus watch "breaking news" -i 30          # check every 30 seconds
corvus watch "earnings season" -n 10        # stop after 10 cycles
corvus watch --cost "bitcoin"               # estimate cost before running
```

### repl

Start an interactive intelligence session.

```bash
corvus repl
corvus repl --format json
```

REPL commands: `/help`, `/format <type>`, `/history`, `/cost`, `/clear`, `/exit`

## Output Formats

All commands support `-f` / `--format` with these options:

| Format | Description |
|--------|-------------|
| `table` | Default. Clean terminal output with cost display |
| `json` | Machine-readable JSON |
| `csv` | CSV with headers |
| `md` | Markdown |

## Cost Tracking

Corvus tracks API costs across sessions. Use `--cost` on any command to see estimated costs before executing. The REPL tracks session costs with `/cost`.

Costs are stored in `~/.corvus/cost-ledger.json`.

## Configuration

Config is stored in `~/.corvus/config.json`. Credentials are stored in `~/.corvus/credentials.json`.

## License

MIT
