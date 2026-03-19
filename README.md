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

Corvus is an open-source CLI that does two things: **investigate** what's happening on X, and **help you grow** on X. It uses Grok's native `live_search` via the xAI API to plan research, chain commands, detect contradictions, and draft posts grounded in real discourse.

```bash
corvus agent "Who's driving the AI regulation debate in the EU?"
```

```
agent · investigating...

[1/5] scanning "AI regulation EU"          ✓ 3.2s
[2/5] pulsing "AI regulation EU"           ✓ 2.8s
[3/5] tracing "EU AI Act enforcement"      ✓ 4.1s
[4/5] profiling @vestaborgs (lead)         ✓ 2.9s
[5/5] synthesizing brief                   ✓ 2.1s

┌──────────────────────────────────────────────────────┐
│ EU AI regulation discourse has shifted hawkish        │
│ (+0.44) — driven by enforcement deadlines and 3       │
│ MEPs amplifying compliance urgency narratives.        │
└──────────────────────────────────────────────────────┘

5 steps · 15.1s · 98 tweets · 1 account profiled · $0.018
```

## What Makes This Different

**It investigates, not just searches.** Corvus plans multi-step research, chains commands, detects contradictions, and computes confidence. Give it a question and it figures out the rest.

**It helps you post, not just consume.** The `draft` command writes posts in your voice. `hooks` finds conversations worth replying to. `review` tells you what worked. `timing` tells you when to post. These aren't analytics dashboards — they're CLI tools that fit into a terminal workflow.

**It shows you what changed.** Every command stores a snapshot. Run it again and Corvus diffs the results — which accounts entered/left, which narratives grew/shrank, how sentiment shifted.

**It costs almost nothing.** A full agent investigation runs ~$0.01-0.02 via Grok. Individual commands are $0.003-0.005. No monthly subscription.

## Install

```bash
npm install -g corvus-x
```

## Setup

```bash
corvus auth setup
```

You'll need a **Grok API key** from [console.x.ai](https://console.x.ai) (required). An **X API bearer token** from [developer.x.com](https://developer.x.com) is optional — it enriches results with real engagement data but all commands work without it via Grok's `live_search`. You'll also be asked for your **X handle** (used by growth commands to identify your account).

```bash
export CORVUS_GROK_KEY=xai-...
export CORVUS_X_BEARER_TOKEN=AAA...   # optional
export CORVUS_X_HANDLE=RogGriff       # optional
```

## Commands

### Intel — Investigate X discourse

| Command | Description |
|---|---|
| `agent <question>` | Autonomous multi-step investigation with brief |
| `scan <topic>` | Snapshot — narratives, top voices, engagement |
| `pulse <topic>` | Sentiment pulse — bull/bear signals, momentum |
| `trace <narrative>` | Map narrative spread — origin, amplifiers, mutations |
| `watch <topic>` | Live-monitor with periodic updates |

### Growth — Grow your X presence

| Command | Description |
|---|---|
| `profile <@handle>` | Content strategy analysis — yours or anyone's |
| `hooks <topic>` | Find conversations to reply to right now |
| `draft <topic>` | Draft a post or thread in your voice |
| `review` | What worked, what didn't, patterns, recommendations |
| `timing [topic]` | Best times to post based on your audience |

### Utility

| Command | Description |
|---|---|
| `ask <question>` | Quick prose answer via Grok |
| `export [cmd] [topic]` | Export snapshots as JSON/CSV/JSONL |
| `history` | Browse stored snapshots |
| `auth setup` | Configure API keys and handle |

## Intel Commands

### `agent` — The flagship

Chains multiple commands, follows leads, cross-references results, and produces a BLUF intelligence brief with confidence scoring and contradiction detection.

```bash
corvus agent "what's happening with bitcoin sentiment?"
corvus agent -i "who are the key players in the AI agent space?"
corvus agent -n 12 --budget 0.25 "trace the OpenAI drama timeline"
```

### `trace` — Narrative evolution

Maps how a narrative spreads and mutates across X.

```bash
corvus trace "AI will replace software engineers"
```

### `scan` / `pulse` — Topic intelligence

```bash
corvus scan "quantum computing"        # narratives, voices, engagement
corvus pulse "bitcoin"                 # sentiment, bull/bear signals
```

Run the same command again later and Corvus shows the **diff** — what changed since your last check.

## Growth Commands

### `profile` — Content strategy analysis

Analyze any account's content patterns, posting cadence, engagement distribution, and voice traits. Run on yourself for actionable recommendations.

```bash
corvus profile @RogGriff               # self — includes recommendations
corvus profile @swyx                   # study someone's strategy
```

### `hooks` — Find reply opportunities

Finds trending conversations with high engagement potential. Scores each by reply opportunity and suggests an angle.

```bash
corvus hooks "typescript CLI tools"
corvus hooks "AI agents"
```

### `draft` — Voice-matched post generation

Drafts posts grounded in current X discourse. Loads your voice profile if available, otherwise uses a default developer voice.

```bash
corvus draft "building AI agents in TypeScript"
corvus draft --thread "why I built Corvus"
corvus draft --reply-to https://x.com/user/status/123
```

### `review` — Post performance analysis

Analyzes your recent posts — top/bottom performers, engagement patterns, actionable recommendations. Requires X API token.

```bash
corvus review                          # last 7 days
corvus review --days 30                # last month
```

### `timing` — Optimal posting windows

When to post for maximum reach. Self mode analyzes your engagement patterns. Topic mode analyzes when conversations peak.

```bash
corvus timing                          # your best posting times
corvus timing "AI agents"             # when this topic peaks
```

## Interactive Mode

Run `corvus` with no arguments to launch the interactive TUI:

```bash
corvus
```

Full-screen terminal UI with connection status, command autocomplete, and session history.

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
| `table` | Default — clean terminal output |
| `json` | Machine-readable JSON |
| `csv` | CSV with headers |
| `md` | Markdown |

## Cost

Every command tracks API spend. Use `--cost` on any command to preview pricing.

| Operation | Typical Cost |
|---|---|
| Single command (scan, pulse, etc.) | $0.003 - 0.005 |
| Full agent investigation | $0.010 - 0.025 |
| Draft / hooks / review | $0.003 - 0.008 |
| Watch (per cycle) | $0.002 - 0.004 |

Costs logged to `~/.corvus/cost-ledger.json`.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (ES2022, strict mode) |
| Runtime | Node.js >= 18 |
| AI | Grok API via OpenAI SDK (`grok-4-1-fast`) |
| Data | X API v2 (optional) |
| CLI | Commander |
| TUI | Ink 6 + React 19 |
| Testing | Vitest (912 tests) |

## License

[MIT](LICENSE) — Roger Griffin ([@GriffinAtlas](https://github.com/GriffinAtlas))
