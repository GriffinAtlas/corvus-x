<p align="center">
  <img src="assets/corvus-logo.png" alt="Corvus" width="200">
</p>

<h3 align="center">AI agent toolkit for X</h3>

<p align="center">
  Investigate discourse. Grow your presence. All from the terminal.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/corvus-x"><img src="https://img.shields.io/npm/v/corvus-x" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/corvus-x" alt="license"></a>
  <a href="package.json"><img src="https://img.shields.io/node/v/corvus-x" alt="node"></a>
</p>

---

Corvus is an open-source CLI that does two things: **investigate** what's happening on X, and **help you grow** on X. It uses Grok's Responses API with `x_search` and `web_search` tools to plan research, chain commands, detect contradictions, and draft posts grounded in real discourse.

```bash
corvus agent "Who's driving the AI regulation debate in the EU?"
```

```
▸ corvus agent · Who's driving the AI regulation debate in the EU?
─────────────────────────────────────────────

[1/5] scanning "AI regulation EU"          ✓ 3.2s
[2/5] pulsing "AI regulation EU"           ✓ 2.8s
[3/5] tracing "EU AI Act enforcement"      ✓ 4.1s
[4/5] profiling @vestaborgs (lead)         ✓ 2.9s
[5/5] synthesizing brief                   ✓ 2.1s

╔══════════════════════════════════════════════════════╗
║  EU AI regulation discourse shifted hawkish (+0.44)  ║
╚══════════════════════════════════════════════════════╝

5 steps · 15.1s · 98 tweets · 1 account profiled · $0.018
```

## What Makes This Different

**It investigates, not just searches.** Corvus plans multi-step research, chains commands, detects contradictions, and computes confidence. Give it a question and it figures out the rest.

**It scores against the actual X algorithm.** Profile analysis uses the real algorithm weights — replies worth 13.5x likes, author reply-backs worth 75x, conversations worth 150x. Not vanity metrics.

**It helps you post, not just consume.** `grow` finds conversations, drafts a post in your voice, and tells you when to post — one command, complete daily workflow. `draft` loads your voice profile so posts sound like you, not generic AI.

**It shows you what changed.** Every command stores a snapshot. Run it again and Corvus diffs the results — which accounts entered/left, which narratives grew/shrank, how sentiment shifted.

**It costs almost nothing.** A full agent investigation runs ~$0.01-0.02 via Grok. The `grow` workflow is ~$0.01-0.02. No monthly subscription.

## Install

```bash
npm install -g corvus-x
```

## Setup

```bash
corvus auth setup
```

You'll need a **Grok API key** from [console.x.ai](https://console.x.ai) (required). An **X API bearer token** from [developer.x.com](https://developer.x.com) is optional — it enriches results with real engagement data but all commands work without it via Grok's `x_search`. You'll also be asked for your **X handle** (used by growth commands to identify your account).

```bash
export CORVUS_GROK_KEY=xai-...
export CORVUS_X_BEARER_TOKEN=AAA...   # optional
export CORVUS_X_HANDLE=RogGriff       # optional
```

## Commands

### Intel — Investigate X discourse

| Command | Description |
|---|---|
| `agent <question>` | Deep research via Grok multi-agent (falls back to step-by-step) |
| `scan <topic>` | Snapshot — narratives, top voices, engagement |
| `pulse <topic>` | Sentiment pulse — bull/bear signals, momentum |
| `trace <narrative>` | Map narrative spread — origin, amplifiers, mutations |
| `watch <topic>` | Live-monitor with periodic updates |

### Growth — Grow your X presence

| Command | Description |
|---|---|
| `grow <topic>` | Daily workflow — hooks + draft + timing in one command |
| `profile <@handle>` | Algorithm-aware content strategy analysis |
| `hooks <topic>` | Find conversations to reply to right now |
| `draft <topic>` | Draft a post or thread in your voice |
| `review` | What worked, what didn't, algorithm health |
| `timing [topic]` | Best times to post based on your audience |

### Utility

| Command | Description |
|---|---|
| `ask <question>` | Quick prose answer via Grok |
| `export [cmd] [topic]` | Export snapshots as JSON/CSV/JSONL |
| `history` | Browse stored snapshots |
| `auth setup` | Configure API keys and handle |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                       USER                               │
│  corvus agent "question"    corvus grow "topic"          │
│  corvus scan "topic"        corvus profile @handle       │
└──────────────┬──────────────────────┬───────────────────┘
               │                      │
       ┌───────▼───────┐      ┌──────▼──────┐
       │  AGENT LOOP   │      │  DIRECT CMD │
       │               │      │             │
       │  Plan ────┐   │      │  Builder    │
       │  Execute  │   │      │     ↓       │
       │  Replan ──┘   │      │  Renderer   │
       │  Synthesize   │      │     ↓       │
       └───────┬───────┘      │  Output     │
               │              └──────┬──────┘
               │                     │
       ┌───────▼─────────────────────▼───────┐
       │              BUILDERS                │
       │                                      │
       │  Intel:  scan, pulse, trace          │
       │  Growth: profile, hooks, draft       │
       │  Analytics: review, timing           │
       │                                      │
       │  Each has dual path:                 │
       │    X API (real data) │ Grok (search) │
       └───────┬──────────────────────┬───────┘
               │                      │
       ┌───────▼───────┐      ┌──────▼──────┐
       │   GROK API    │      │   X API v2  │
       │ /v1/responses │      │ /2/tweets   │
       │               │      │ /2/users    │
       │ x_search      │      │ /2/search   │
       │ web_search    │      │             │
       └───────────────┘      └─────────────┘
```

The **agent loop** is the key differentiator. When you run `corvus agent`, Grok plans which commands to run, executes them, discovers leads (accounts, narratives), replans mid-investigation if data is thin, and synthesizes everything into a brief. The agent can now use both intel commands (scan, pulse, trace, profile) and growth commands (hooks, draft).

## The Growth Workflow

The fastest way to use Corvus for growth:

```bash
corvus profile @YourHandle          # analyze your account + save voice profile
corvus grow "your topic"            # find hooks, draft a post, get timing
```

`grow` runs three steps:
1. **Hooks** — finds conversations worth replying to, scored by opportunity
2. **Draft** — writes a post in your voice (uses your voice profile if available)
3. **Timing** — when to post for maximum reach

Run `corvus profile @YourHandle` once to generate a voice profile. After that, `draft` and `grow` use it automatically.

## Algorithm Scoring

Profile analysis scores accounts against the [real X algorithm weights](https://github.com/twitter/the-algorithm):

```
── Algorithm Health  B ────────────
    Reply rate       ██████░░░░░░░░░ 42%  13.5x likes
    Author replies   ███████████░░░░ 71%  75x weight
    Conversations    █████░░░░░░░░░░ 31%  150x a like
    Bookmark/like    ██░░░░░░░░░░░░░ 12%  save-worthy
```

Key insight: a reply is worth 13.5x more than a like. A conversation (reply + author reply) is worth 150x. Most "growth tools" optimize for likes — Corvus optimizes for what the algorithm actually values.

## Interactive Mode

Run `corvus` with no arguments to launch the full-screen interactive TUI:

```bash
corvus
```

Full-screen terminal app with alternate screen buffer, pinned header with connection status, command autocomplete, session history, and keyboard shortcuts.

## Snapshot Diffing

Every structured command stores timestamped snapshots. Re-run a command and Corvus diffs the results:

```
Δ vs 2h ago:  sentiment -0.18 → -0.38  ·  +2 bearish accounts  ·  new narrative: "ETF outflows"
```

## Library Mode

```typescript
import { buildScanSnapshot, buildHooksSnapshot, GrokAdapter } from 'corvus-x'

const deps = {
  grok: new GrokAdapter(process.env.GROK_KEY!),
  x: null,
}

const scan = await buildScanSnapshot(deps, 'bitcoin', 50)
console.log(scan.data.sentiment, scan.data.narratives)
```

## MCP Server

Corvus exposes 5 tools via the Model Context Protocol for use by AI agents:

```bash
corvus mcp    # starts stdio MCP server
```

Tools: `corvus_scan`, `corvus_pulse`, `corvus_trace`, `corvus_profile`, `corvus_agent`

## Output Formats

All commands support `-f` / `--format`:

| Format | Description |
|---|---|
| `table` | Default — rich terminal output with bars and charts |
| `json` | Machine-readable JSON |
| `csv` | CSV with headers |
| `md` | Markdown |

## Cost

Every command tracks API spend. Use `--cost` on any command to preview pricing.

| Operation | Typical Cost |
|---|---|
| Single command (scan, pulse, etc.) | $0.003 - 0.005 |
| Full agent investigation | $0.010 - 0.025 |
| `grow` workflow (hooks + draft + timing) | $0.010 - 0.020 |
| Watch (per cycle) | $0.002 - 0.004 |

Costs logged to `~/.corvus/cost-ledger.json`.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (ES2022, strict mode) |
| Runtime | Node.js >= 18 |
| AI | Grok Responses API via OpenAI SDK |
| Data | X API v2 (optional) |
| CLI | Commander |
| TUI | Ink 6 + React 19 + fullscreen-ink |
| Testing | Vitest (957 tests) |

## License

[MIT](LICENSE) — Roger Griffin ([@GriffinAtlas](https://github.com/GriffinAtlas))
