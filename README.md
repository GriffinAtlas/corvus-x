<p align="center">
  <img src="assets/corvus-logo.png" alt="Corvus" width="200">
</p>

<h3 align="center">Autonomous X intelligence agent</h3>

<p align="center">
  One question in, full investigation out.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/corvus-x"><img src="https://img.shields.io/npm/v/corvus-x" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/corvus-x" alt="license"></a>
  <a href="package.json"><img src="https://img.shields.io/node/v/corvus-x" alt="node"></a>
</p>

---

Corvus is an open-source CLI agent that investigates X (Twitter) discourse autonomously. Give it a question — it plans its own research, executes across multiple data sources, flags contradictions, and delivers a structured intelligence brief. Built on Grok's native `x_search` via the xAI API.

```bash
corvus agent "Who's driving the AI regulation debate in the EU?"
```

```
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⣄⣀⣀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣼⣿⣿⡿⠋⠉
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⣿⣿⡇
⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣴⣿⣿⣿⣿⣿⡿⠁
⠀⠀⠀⠀⠀⠀⢀⣠⣾⣿⣿⣿⣿⣿⣿⠟
⠀⠀⠀⠀⢀⣴⣿⣿⣿⠿⠿⣿⣿⠋
⠀⠀⠀⡪⠕⠋⠉⠉⠀⠀⠀⠫⡻
⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⠷⠤
  ╔═╗╔═╗╦═╗╦  ╦╦ ╦╔═╗
  ║  ║ ║╠╦╝╚╗╔╝║ ║╚═╗
  ╚═╝╚═╝╩╚═ ╚╝ ╚═╝╚═╝

agent · investigating...

[1/5] scanning "AI regulation EU"          ✓ 3.2s
[2/5] pulsing "AI regulation EU"           ✓ 2.8s
[3/5] tracing "EU AI Act enforcement"      ✓ 4.1s
[4/5] scoping @vestaborgs (lead)           ✓ 2.9s
[5/5] synthesizing brief                   ✓ 2.1s

┌──────────────────────────────────────────────────────┐
│ EU AI regulation discourse has shifted hawkish        │
│ (+0.44) — driven by enforcement deadlines and 3       │
│ MEPs amplifying compliance urgency narratives.        │
└──────────────────────────────────────────────────────┘

5 steps · 15.1s · 98 tweets · 1 account profiled · $0.018
```

## What Makes This Different

**It investigates, not just searches.** Most Twitter tools show you tweets. Corvus plans multi-step research, chains commands, detects when sources contradict each other, and computes confidence in its conclusions.

**It tracks narrative evolution.** The `trace` command maps how a claim mutates as it spreads — origin tweet, amplification phases, how the framing changed. Nobody else does this in a CLI.

**It shows you what changed.** Every command stores a snapshot. Run it again and Corvus diffs the results — which accounts entered/left, which narratives grew/shrank, how sentiment shifted. Temporal intelligence, not just current state.

**It costs almost nothing.** A full agent investigation runs ~$0.01-0.02 via Grok. Individual commands are $0.003-0.005. No monthly subscription.

## Install

```bash
npm install -g corvus-x
```

## Interactive Mode

Run `corvus` with no arguments to launch the interactive TUI:

```bash
corvus
```

You'll see a branded welcome screen with connection status, example commands (or your recent investigation history), and an input prompt. Start typing any command — the welcome screen transitions to a chat view after your first query.

To make `corvus` available globally from any directory:

```bash
npm link          # after cloning and building
# or
npm install -g corvus-x
```

## Setup

```bash
corvus auth setup
```

You'll need a **Grok API key** from [console.x.ai](https://console.x.ai) (required). An **X API bearer token** from [developer.x.com](https://developer.x.com) is optional — it enriches results with real engagement data but all commands work without it via Grok's `x_search`.

```bash
export CORVUS_GROK_KEY=xai-...
export CORVUS_X_BEARER_TOKEN=AAA...   # optional
```

## Commands

### Investigation

| Command | Description |
|---|---|
| `agent <question>` | Autonomous multi-step investigation with brief |
| `trace <narrative>` | Map narrative spread — origin, amplifiers, mutations |
| `gather <topic>` | Deep intelligence — X + web context + outlook |

### Intelligence

| Command | Description |
|---|---|
| `scan <topic>` | Snapshot — narratives, top voices, engagement |
| `pulse <topic>` | Sentiment pulse — bull/bear signals, momentum |
| `scope <@handle>` | Profile — influence, patterns, signal value |
| `read <tweet>` | Analyze a single tweet |

### Monitoring & Data

| Command | Description |
|---|---|
| `watch <topic>` | Live-monitor with periodic updates |
| `export [cmd] [topic]` | Export snapshots as JSON/CSV/JSONL |
| `history` | Browse stored snapshots |

### `agent` — The flagship

Chains multiple commands, follows leads, cross-references results, and produces a BLUF intelligence brief with confidence scoring and contradiction detection.

```bash
corvus agent "what's happening with bitcoin sentiment?"
corvus agent -i "who are the key players in the AI agent space?"   # interactive mode
corvus agent -n 12 --budget 0.25 "trace the OpenAI drama timeline" # custom limits
```

The agent:
1. **Plans** — Grok selects which commands to run and in what order
2. **Executes** — Runs each step, extracts leads, adds follow-up steps
3. **Replans** — Adapts mid-investigation if data is thin or contradictory
4. **Synthesizes** — Produces a brief with signal line, key findings, top voices, contradictions, and confidence score

### `trace` — Narrative evolution

Maps how a narrative spreads and mutates across X. Shows the origin, amplification phases, key amplifiers, and how the framing changed over time.

```bash
corvus trace "AI will replace software engineers"
corvus trace "bitcoin ETF institutional exit"
```

### `scan` / `pulse` — Topic intelligence

```bash
corvus scan "quantum computing"        # narratives, voices, engagement
corvus pulse "bitcoin"                 # sentiment, bull/bear signals, momentum
```

Run the same command again later and Corvus shows you the **diff** — what changed since your last check.

### `scope` / `read` — Account & tweet analysis

```bash
corvus scope @elonmusk                 # influence, content patterns, signal value
corvus read https://x.com/user/status/123456789   # significance, context, signals
```

### `gather` — Deep intelligence

Combines X discourse analysis with web search for a complete picture.

```bash
corvus gather "OpenAI leadership changes"
```

### `watch` — Live monitoring

```bash
corvus watch "breaking news" -i 30     # check every 30 seconds
corvus watch "earnings season" -n 10   # stop after 10 cycles
```

## Snapshot Diffing

Every structured command stores timestamped snapshots. When you re-run a command, Corvus compares the current snapshot against the previous one and shows exactly what changed:

```
Δ vs 2h ago:  sentiment -0.18 → -0.38  ·  +2 bearish accounts  ·  new narrative: "ETF outflows"
```

Use `corvus export` to dump snapshots as JSON, CSV, or JSONL for downstream processing.

## Library Mode

Corvus exports its builder functions for use in your own applications:

```typescript
import { buildScanSnapshot, buildAgentBrief } from 'corvus-x'
import { GrokAdapter, XAdapter } from 'corvus-x'

const deps = {
  grok: new GrokAdapter(process.env.GROK_KEY),
  x: new XAdapter(process.env.X_TOKEN),  // or null
}

const scan = await buildScanSnapshot(deps, 'bitcoin', 50)
console.log(scan.data.sentiment, scan.data.narratives)
```

## Output Formats

All commands support `-f` / `--format`:

| Format | Description |
|---|---|
| `table` | Default — clean terminal output |
| `json` | Machine-readable JSON |
| `csv` | CSV with headers |
| `md` | Markdown |

## Cost

Every command tracks API spend. Use `--cost` on any command to preview pricing before executing.

| Operation | Typical Cost |
|---|---|
| Single command (scan, pulse, etc.) | $0.003 - 0.005 |
| Full agent investigation | $0.010 - 0.025 |
| Watch (per cycle) | $0.002 - 0.004 |

Costs are logged to `~/.corvus/cost-ledger.json`.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (ES2022, strict mode) |
| Runtime | Node.js >= 18 |
| AI | Grok API via OpenAI SDK (`grok-4-1-fast`) |
| Data | X API v2 (optional — tweets, users, metrics) |
| CLI | Commander |
| Interactive TUI | Ink 6 + React 19 |
| Testing | Vitest (819 tests) |

## License

[MIT](LICENSE) — Roger Griffin ([@GriffinAtlas](https://github.com/GriffinAtlas))
