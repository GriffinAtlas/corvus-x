<h3 align="center">AI growth toolkit for X</h3>

<p align="center">
  Find conversations. Draft posts in your voice. Investigate discourse. All from the terminal.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/corvus-x"><img src="https://img.shields.io/npm/v/corvus-x" alt="npm version"></a>
  <a href="https://github.com/GriffinAtlas/corvus-x/actions/workflows/ci.yml"><img src="https://github.com/GriffinAtlas/corvus-x/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/corvus-x" alt="license"></a>
  <a href="package.json"><img src="https://img.shields.io/node/v/corvus-x" alt="node"></a>
</p>

---

Corvus is an open-source CLI for growing on X. It finds conversations worth replying to, drafts posts in your voice, and tells you when to post, scoring everything against the real X algorithm weights (replies count 13.5x likes, conversations 150x). When you need intel instead of growth, the same tool handles deep research via a multi-agent loop.

```bash
corvus grow "rust async"
```

```
▸ corvus grow · rust async
─────────────────────────────────────────────

  Reply Opportunities
  ─────────────────────
  @someone (4.2k followers): "Why is async Rust so painful?"
  ↳ 87 likes · 4 replies · 2h ago · score 0.91
  ↳ angle: mention your tokio/async-std comparison post. They're missing the runtime tradeoff.

  Your Draft
  ─────────
  Async Rust is painful because you're fighting two languages:
  the sync one you learned and the executor's state machine.
  Once you stop trying to write "async functions" and start
  thinking in tasks + cancellation, it clicks.

  why: opens with a contrarian claim (replies-bait), no jargon
       in line 1, ends on a hook ("it clicks"). Algorithm rewards
       dwell + replies.

  When to Post
  ────────────
  Tue 14:00 UTC · Wed 09:00 UTC · Thu 15:00 UTC

  ─────────────────────────────────────────────
  3 steps · $0.0140
```

## What Makes This Different

**It scores against the actual X algorithm.** Profile analysis uses the real algorithm weights: replies worth 13.5x likes, author reply-backs worth 75x, conversations worth 150x. Most growth tools optimize for likes. Corvus optimizes for what the algorithm actually values.

**It helps you post, not just consume.** `grow` finds conversations, drafts a post in your voice, and tells you when to post. One command, complete daily workflow. `draft` loads your voice profile so posts sound like you, not generic AI.

**It investigates, not just searches.** When you need intel instead of growth, `corvus agent` plans multi-step research, chains commands, detects contradictions, and computes confidence. Give it a question and it figures out the rest.

**It shows you what changed.** Every command stores a snapshot. Re-run it and Corvus diffs the results: which accounts entered or left, which narratives grew or shrank, how sentiment shifted.

**It costs almost nothing.** A `grow` workflow runs ~$0.01-0.02 via Grok. A full agent investigation runs ~$0.01-0.025. No monthly subscription.

## Install

```bash
npm install -g corvus-x
```

## Setup

```bash
corvus auth setup
```

You'll need a **Grok API key** from [console.x.ai](https://console.x.ai) (required). An **X API bearer token** from [developer.x.com](https://developer.x.com) is optional. It enriches results with real engagement data, but every command works without it via Grok's `x_search`. You'll also be asked for your **X handle**, used by the growth commands to identify your account.

```bash
export CORVUS_GROK_KEY=xai-...
export CORVUS_X_BEARER_TOKEN=AAA...   # optional
export CORVUS_X_HANDLE=RogGriff       # optional
```

## Commands

### Growth

| Command | Description |
|---|---|
| `grow <topic>` | Daily workflow: hooks, draft, and timing in one command |
| `profile <@handle>` | Algorithm-aware content strategy analysis |
| `hooks <topic>` | Find conversations to reply to right now |
| `draft <topic>` | Draft a post or thread in your voice |
| `review` | What worked, what didn't, algorithm health |
| `timing [topic]` | Best times to post for your audience or a topic |

### Intel

| Command | Description |
|---|---|
| `agent <question>` | Deep research via Grok multi-agent (falls back to step-by-step) |
| `scan <topic>` | Snapshot a topic: narratives, top voices, engagement |
| `pulse <topic>` | Sentiment pulse: bull/bear signals, momentum |
| `trace <narrative>` | Map narrative spread: origin, amplifiers, mutations |
| `watch <topic>` | Live-monitor a topic with periodic updates |

### Utility

| Command | Description |
|---|---|
| `ask <question>` | Quick prose answer via Grok |
| `export [cmd] [topic]` | Export snapshots as JSON, CSV, or JSONL |
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

When you run `corvus agent`, Grok plans which commands to run, executes them, discovers leads (accounts, narratives), replans mid-investigation if data is thin, and synthesizes everything into a brief. The agent can use both intel commands (scan, pulse, trace, profile) and growth commands (hooks, draft).

## Algorithm Scoring

Profile analysis scores accounts against the [real X algorithm weights](https://github.com/twitter/the-algorithm):

```
── Algorithm Health  B ────────────
    Reply rate       ██████░░░░░░░░░ 42%  13.5x likes
    Author replies   ███████████░░░░ 71%  75x weight
    Conversations    █████░░░░░░░░░░ 31%  150x a like
    Bookmark/like    ██░░░░░░░░░░░░░ 12%  save-worthy
```

A reply is worth 13.5x more than a like. A conversation (reply + author reply) is worth 150x. Most growth tools optimize for likes. Corvus optimizes for what the algorithm actually values.

## Interactive Mode

Run `corvus` with no arguments to launch the full-screen TUI:

```bash
corvus
```

Alternate screen buffer, pinned header with connection status, command autocomplete, session history, and keyboard shortcuts.

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
| `table` | Default. Rich terminal output with bars and charts |
| `json` | Machine-readable JSON |
| `csv` | CSV with headers |
| `md` | Markdown |

## Cost

Every command tracks API spend. Use `--cost` on any command to preview pricing.

| Operation | Typical Cost |
|---|---|
| Single command (scan, pulse, etc.) | $0.003 - 0.005 |
| Full agent investigation | ~$0.010 - 0.025 |
| `grow` workflow (hooks + draft + timing) | $0.010 - 0.020 |
| Watch (per cycle) | $0.002 - 0.004 |

The `~` on the agent row indicates the cost is approximate. The multi-agent model makes internal `x_search` calls that may not all be exposed in usage reporting, so the displayed cost can undercount. All other commands report exact cost.

Costs logged to `~/.corvus/cost-ledger.json`.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (ES2022, strict mode) |
| Runtime | Node.js >= 20 |
| AI | Grok Responses API via OpenAI SDK |
| Data | X API v2 (optional) |
| CLI | Commander |
| TUI | Ink 6 + React 19 + fullscreen-ink |
| Testing | Vitest |

## License

MIT. Roger Griffin ([@GriffinAtlas](https://github.com/GriffinAtlas)). See [LICENSE](LICENSE).
