# Corvus Agent Command — Design Specification

**Date:** 2026-03-11
**Author:** Roger Griffin / Claude
**Status:** Reviewed
**Scope:** Pipeline hardening + `corvus agent` command + presentation layer

---

## 1. Overview

Add an autonomous intelligence agent to Corvus that chains multiple commands, follows leads, cross-references results, and produces a BLUF (Bottom Line Up Front) intelligence brief. Before building the agent, harden the existing pipeline to eliminate bugs and fragility that would compound during multi-step agent runs.

### Goals

- Fix 4 pipeline defects that affect data quality
- Add a `corvus agent <question>` command with Grok-as-Planner architecture
- Support fire-and-forget (default) and interactive (`--interactive`) modes
- Produce a structured intelligence brief with signal line, executive summary, contradiction detection, and locally-computed confidence scoring
- Establish a presentation layer: color theme, multi-line progress, TTY detection, CLI branding
- Enforce anti-boilerplate standards across all CLI output

### Non-Goals

- No framework adoption (Ink, Bubble Tea, React). String-based rendering with ANSI cursor control.
- No new runtime dependencies. chalk + ora + commander remain the only UI deps.
- No refactoring of existing command logic beyond the four targeted fixes.
- No development-time agent (deferred to future milestone).

---

## 2. Pipeline Hardening

Four fixes applied before agent work begins. Each is independently testable.

### 2a. JSON Parse Safety

**File:** `src/core/grok-adapter.ts`

New exported function `parseGrokJson<T>(raw: string): T`:

- Strip leading/trailing whitespace
- Strip markdown fences: detect ` ```json ` or ` ``` ` prefix/suffix, remove them
- Strip any text before the first `{` or `[` character (handles Grok preambles like "Sure, here is the JSON:")
- Strip any text after the last `}` or `]` character
- Call `JSON.parse` on the cleaned string
- On parse failure, throw `GrokParseError` with: the original raw string (first 300 chars), the cleaned string (first 300 chars), and the underlying `SyntaxError` message
- `GrokParseError` extends `Error` with a `rawPreview` property for diagnostics

All six `buildSnapshot` functions in `scan.ts`, `pulse.ts`, `trace.ts`, `gather.ts`, `read.ts`, `scope.ts` replace their bare `JSON.parse(response.text)` with `parseGrokJson<GrokXxxResponse>(response.text)`.

### 2b. Retry and Timeout on Grok

**File:** `src/core/grok-adapter.ts`

Modify `GrokAdapter.query()`:

- Create an `AbortController` with a 30-second timeout via `setTimeout`
- Pass `signal` in the OpenAI SDK's request options (second argument): `this.client.chat.completions.create({ model, messages, ... }, { signal })`
- On transient errors (HTTP 429, 500, 502, 503, or network errors with code `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`), retry once after a 2-second delay
- On 429 specifically, if a `Retry-After` header is present and <= 10 seconds, wait that duration instead of 2s. If > 10s, do not retry — throw immediately with the reset time in the error message.
- On non-transient errors (400, 401, 403, 404), throw immediately with no retry
- Clear the abort timeout on success or final failure

No external retry library. The retry is a single `for` loop with `maxAttempts = 2`.

### 2c. Fix `computeTopAccounts` Sentiment Bug

**File:** `src/core/metrics.ts`, line ~67

Current (broken):

```typescript
const score = scores.find(
  (s) => s.index < tweets.length && tweets[s.index]?.authorId === tweet.authorId,
)
```

This finds the first score whose indexed tweet belongs to the current author — not the score for the current tweet. For multi-tweet authors, all iterations find the same score.

Fixed:

```typescript
const tweetIndex = tweets.indexOf(tweet)
const score = scores.find((s) => s.index === tweetIndex)
```

This matches how `computeKeyVoices` already works correctly at `metrics.ts:~154` (the `scores.find((s) => s.index === i)` pattern).

### 2d. Include Impressions in Engagement Metrics

**File:** `src/core/metrics.ts`

`computeBaseMetrics`: add `tweet.metrics.impressions` to the `totalEngagement` sum alongside likes + retweets + replies. Update `engagementPerTweet` accordingly.

`computeTopPosts`: include impressions in the engagement score used for sorting.

**File:** `src/core/x-adapter.ts`

`formatTweetsForAnalysis`: update the per-tweet format string to include impressions so Grok sees the same engagement model:

```
[0] @handle (12L 3RT 1R 450V): tweet text here
```

Where `V` = impressions/views. This keeps Grok's analysis consistent with the local engagement metric.

All tests that assert specific engagement totals must be updated to include impressions.

### 2e. Refactor `buildSnapshot` to Named Exports

**Files:** `src/cli/commands/scan.ts`, `pulse.ts`, `trace.ts`, `gather.ts`, `read.ts`, `scope.ts`

Each command's `buildSnapshot` is currently an inline closure inside the `.action()` callback, closing over CLI-parsed variables (`topic`, `maxResults`, `handle`, etc.). Refactor each into a named exported function with explicit parameters:

```typescript
// scan.ts
export async function buildScanSnapshot(
  deps: CommandDeps,
  topic: string,
  maxResults: number,
  pages?: number,
): Promise<BuildResult<ScanSnapshot>>

// pulse.ts
export async function buildPulseSnapshot(
  deps: CommandDeps,
  topic: string,
  maxResults: number,
  pages?: number,
): Promise<BuildResult<PulseSnapshot>>

// trace.ts
export async function buildTraceSnapshot(
  deps: CommandDeps,
  topic: string,
  maxResults: number,
  pages?: number,
): Promise<BuildResult<TraceSnapshot>>

// gather.ts
export async function buildGatherSnapshot(
  deps: CommandDeps,
  topic: string,
  maxResults: number,
  pages?: number,
): Promise<BuildResult<GatherSnapshot>>

// read.ts
export async function buildReadSnapshot(
  deps: CommandDeps,
  tweetId: string,
): Promise<BuildResult<ReadSnapshot>>

// scope.ts
export async function buildScopeSnapshot(
  deps: CommandDeps,
  handle: string,
  tweetCount: number,
): Promise<BuildResult<ScopeSnapshot>>
```

The shared return type:

```typescript
// types.ts
interface BuildResult<T extends Snapshot> {
  data: T
  raw: string
  cost: number
  tweets: Tweet[] // raw tweets fetched (empty for read/scope single-tweet)
  scores: GrokTweetScore[] // Grok's per-tweet scores (empty for read/scope)
  newestTweetAt: number | null // epoch ms of newest tweet's createdAt
}
```

Each command's `.action()` callback becomes a thin wrapper that calls the exported function and passes the result to `runStructuredCommand`. The `runStructuredCommand` interface changes to accept `BuildResult<T>` instead of `{ data, raw, cost }`.

Commands that use `tweetAnalysis` (scan, pulse, trace, gather) populate `tweets` and `scores`. Commands that don't (read, scope) return empty arrays — the agent executor checks `result.tweets.length > 0` before aggregating.

---

## 3. Agent Architecture

### 3.1 Module Structure

```
src/
  core/
    agent.ts              # AgentPlanner, AgentExecutor, AgentSynthesizer
                          # Also contains orchestration types: AgentPlan, AgentStep,
                          # AgentContext, AgentStepResult, ReplanDecision
                          # (these are internal to the agent, not Grok schemas)
  cli/
    commands/agent.ts     # Commander registration, CLI options, rendering
    progress.ts           # StepProgress — multi-line in-place step tracker
    theme.ts              # Color palette, visual primitives, TTY detection
```

Type placement:

- `AgentPlan`, `AgentStep`, `AgentContext`, `AgentStepResult`, `ReplanDecision` → `src/core/agent.ts` (internal orchestration)
- `AgentBrief`, `BriefAccount`, `BriefEvidence`, `ConfidenceScore` → `src/core/schemas.ts` (output shapes, part of `Snapshot` union)
- `BuildResult<T>` → `src/core/types.ts` (shared across all commands)

### 3.2 Interfaces

```typescript
// ── Plan ──

interface AgentPlan {
  goal: string
  steps: AgentStep[]
}

interface AgentStep {
  command: 'scan' | 'pulse' | 'trace' | 'gather' | 'read' | 'scope'
  args: {
    topic?: string
    username?: string
    tweetId?: string
    count?: number
  }
  reasoning: string
}

// ── Execution ──

interface AgentContext {
  goal: string
  question: string
  results: AgentStepResult[]
  totalCost: number
  leads: string[]
}

interface AgentStepResult {
  step: AgentStep
  command: string
  snapshot: Snapshot
  cost: number
  durationMs: number
  tweets: Tweet[] // raw tweets from this step (empty for read/scope)
  scores: GrokTweetScore[] // per-tweet Grok scores (empty for read/scope)
  newestTweetAt: number | null // epoch ms of newest tweet in this step
}

// ── Replan ──

type ReplanDecision = { action: 'continue' } | { action: 'revise'; steps: AgentStep[] }
// Any unrecognized `action` value is treated as 'continue'.

// ── Brief ──

interface AgentBrief {
  signalLine: string
  sentiment: number
  summary: string[]
  contradictions: string[]
  keyAccounts: BriefAccount[]
  evidence: BriefEvidence[]
  confidence: ConfidenceScore
  sampleSize: number
  staleness: number | null // ms since newest tweet, null if fresh
}

interface BriefAccount {
  handle: string
  reach: number
  sentiment: number
  stance: string // one-line position summary
}

interface BriefEvidence {
  source: string // "scan", "pulse", etc.
  key: string // what this evidence shows
  detail: string
}

interface ConfidenceScore {
  overall: number // 0-1
  volume: 'low' | 'moderate' | 'high'
  consistency: number // sentiment std dev (lower = more confident)
  diversity: number // unique authors / total tweets
}
```

### 3.3 AgentPlanner

Single Grok call. System prompt:

```
You are a planning engine for an X intelligence CLI. Given a user's question,
produce a JSON execution plan using only these commands:

- scan <topic> — discourse landscape, narratives, sentiment (default 50 tweets)
- pulse <topic> — sentiment momentum, bull/bear signals, key voices
- trace <narrative> — track how a narrative spread, origin, mutations
- gather <topic> — deep analysis combining X data and web context
- read <tweet-id> — analyze a specific tweet
- scope <username> — profile analysis of an X account

Rules:
- Return ONLY valid JSON matching the AgentPlan schema.
- Maximum 8 steps.
- Start broad (scan or pulse), then narrow (scope, read, trace).
- Include reasoning for each step — one sentence explaining why.
- Do not include steps that duplicate information.
- If the question names specific accounts, include scope steps for them.
- If the question is about a narrative or claim, include a trace step.
```

User message is the raw question. Response parsed with `parseGrokJson<AgentPlan>`.

### 3.4 AgentExecutor

Iterates `plan.steps` sequentially. For each step:

1. Resolve the step to a `buildSnapshot` call by importing the relevant command module's build function. Each data-first command exports its `buildSnapshot` as a named export (requires adding exports to scan.ts, pulse.ts, etc.).
2. Construct `CommandDeps` (shared across all steps — one GrokAdapter, one XAdapter instance for the entire run).
3. Call `buildSnapshot(deps)` and capture `{ data, raw, cost }`.
4. Save snapshot via `SnapshotStore` (same as normal command execution — agent steps produce real snapshots).
5. Record in `AgentContext.results`.
6. Extract leads: after each step, scan the snapshot for account handles that appear with high engagement or are referenced by Grok. Add to `context.leads` if not already targeted by a planned step.

**Adaptive replanning** — after steps 1, 3, and 5 (not every step), send a condensed context summary to Grok:

```
You are adjusting an investigation plan. Here is what has been found so far:

[condensed summary of results — topic, sentiment, key accounts found, signals]

Remaining planned steps:
[list]

Discovered leads not yet investigated:
[list]

Should the remaining plan change? Return JSON:
- { "action": "continue" } to proceed as planned
- { "action": "revise", "steps": [...] } to replace remaining steps

Rules:
- Maximum 3 additional steps beyond the original plan.
- Only add scope/read steps for discovered leads — do not repeat scan/pulse.
- If the data is sufficient, you may remove remaining steps.
```

Maximum 3 replan calls per run. Replan is skipped if `--no-replan` flag is set.

### 3.5 AgentSynthesizer

Final Grok call after all steps complete. Receives the full `AgentContext` serialized as a structured prompt.

System prompt:

```
You are a senior intelligence analyst writing a wire note.
Synthesize the following investigation results into a brief.

Rules:
- signalLine: one sentence. The conclusion. No hedging, no "it appears."
- summary: 3-7 bullets. Lead with the most important finding.
- contradictions: flag any inconsistencies between data sources. Be specific.
  Example: "Scan consensus bearish (-0.41) but pulse detected 2 high-reach
  accounts with bullish positions and 8.2K combined engagement."
- keyAccounts: the 3-5 most significant voices. Include their stance in
  10 words or less.
- evidence: group findings by source command. State what each source showed.
- No first person. No hedging language. No emoji. No markdown.
- Write like Bloomberg, not like a chatbot.
- If data is thin (few tweets, few authors), say so directly.
```

Response parsed with `parseGrokJson<Partial<AgentBrief>>`. The synthesizer fills in Grok-generated fields. Locally-computed fields are set by the executor:

**Confidence** — computed locally in `metrics.ts`. Uses only tweets and scores from steps that produce `tweetAnalysis` (scan, pulse, trace, gather). Steps from `read` and `scope` return empty `tweets`/`scores` arrays and are excluded from confidence computation. Read/scope results still contribute to the brief's qualitative analysis (via Grok's synthesizer) but not to the quantitative confidence score.

Implementation in `metrics.ts`:

```typescript
function computeConfidence(allTweets: Tweet[], allScores: GrokTweetScore[]): ConfidenceScore {
  const volume = allTweets.length < 30 ? 'low' : allTweets.length < 100 ? 'moderate' : 'high'
  const sentiments = allScores.map((s) => s.sentiment)
  const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length
  const consistency = Math.sqrt(
    sentiments.reduce((sum, s) => sum + (s - mean) ** 2, 0) / sentiments.length,
  )
  const uniqueAuthors = new Set(allTweets.map((t) => t.authorId)).size
  const diversity = uniqueAuthors / allTweets.length

  const volumeScore = allTweets.length < 30 ? 0.3 : allTweets.length < 100 ? 0.6 : 0.9
  const consistencyScore = Math.max(0, 1 - consistency)
  const diversityScore = Math.min(1, diversity * 2)
  const overall = Number(
    (volumeScore * 0.4 + consistencyScore * 0.3 + diversityScore * 0.3).toFixed(2),
  )

  return {
    overall,
    volume,
    consistency: Number(consistency.toFixed(3)),
    diversity: Number(diversity.toFixed(3)),
  }
}
```

**Contradiction detection** — computed in `metrics.ts`:

```typescript
function detectContradictions(results: AgentStepResult[]): string[] {
  const contradictions: string[] = []

  // 1. Cross-step sentiment divergence: if two steps targeting overlapping
  //    topics have sentiment averages differing by > 0.3, flag it.
  //    Compare scan vs pulse, scan vs gather, pulse vs gather.
  //    Example output: "Scan sentiment (-0.41) diverges from pulse (+0.08)
  //    on the same topic"

  // 2. Top accounts vs crowd: if the top 3 accounts by reach have an
  //    average sentiment that differs from the overall crowd sentiment
  //    by > 0.3, flag it.
  //    Example: "Top 3 accounts bullish (+0.52 avg) against bearish
  //    crowd consensus (-0.28)"

  // 3. Bull/bear signal strength: if a pulse step has both bullSignals
  //    and bearSignals with >= 3 entries each, flag the mixed signals.
  //    Example: "Strong bull signals (4) and bear signals (3) both
  //    present — market is contested"

  // 4. Narrative vs sentiment mismatch: if the dominant narrative by
  //    tweet count has sentiment opposite to the overall average
  //    (signs differ), flag it.
  //    Example: "Dominant narrative 'ETF outflows' is bearish (-0.52)
  //    but overall sentiment is positive (+0.12)"

  return contradictions
}
```

**Staleness** — computed from the newest `createdAt` across all tweets in all steps.

**Sample size** — sum of `metrics.tweetCount` across all structured command results.

### 3.6 Pagination Support

**File:** `src/core/x-adapter.ts`

`searchRecent` gains an optional `pages` parameter (default 1):

```typescript
async searchRecent(
  query: string,
  maxResults: number = 50,
  pages: number = 1,
): Promise<XSearchResult>
```

When `pages > 1`, after the first response, if `nextToken` is present, make additional requests (up to `pages - 1` more) passing `next_token` as a query parameter. Concatenate all tweet and user arrays. Deduplicate by tweet ID and user ID before returning (the X API can return overlapping results between pages if the index shifts during pagination).

Individual commands keep `pages: 1` (no behavior change). Agent steps use `pages: 2` by default (200 tweets). A future `--deep` flag could set `pages: 3`.

---

## 4. CLI Interface

### 4.1 Command Registration

```
corvus agent <question...> [options]
```

Options:

- `-i, --interactive` — checkpoint mode
- `-n, --max-steps <n>` — step cap (default 8, min 2, max 12)
- `-f, --format <type>` — `table` (default), `json`, `md`
- `--no-replan` — disable adaptive replanning
- `--budget <amount>` — cost cap in USD (default 0.10). Agent aborts if cumulative cost exceeds this.
- `--cost` — show pricing info and exit

### 4.2 Fire-and-Forget Mode

The default. User runs the command, sees step progress update in-place, receives the brief when done.

Progress display uses `StepProgress` class (Section 5.2) — each step gets its own line that transitions from pending to running to complete. Steps added by replanning are tagged `(lead)`. Steps that replaced original plan steps are tagged `(replan)`.

No interaction. No prompts.

**Cost budget enforcement:** Before each step, the executor checks `context.totalCost` against the `--budget` value (default $0.10). If the next step would likely exceed the budget (estimated from average cost of completed steps), the executor stops, skips synthesis, and prints a cost summary of completed steps. The `--budget` flag accepts a decimal USD value (e.g., `--budget 0.05`).

**Rate limit handling for X API:** If an X API call returns 429 (`XRateLimitError`), the executor pauses until `resetAt` (already available from the error object), then retries the same step. If `resetAt` is more than 60 seconds in the future, the executor skips the step and continues with remaining steps rather than blocking indefinitely. The skipped step is marked as `(rate-limited)` in the progress display.

**Graceful shutdown (SIGINT):** On Ctrl+C, the executor stops after the current in-flight step completes (does not abort mid-API-call). It skips synthesis and prints a summary of completed steps with their individual costs and total cost. The `StepProgress` display clears its ANSI cursor state before printing the summary. Individual step snapshots already saved to disk are retained. No partial `AgentBrief` is produced — the user reruns the full agent or uses individual command snapshots.

### 4.3 Interactive Mode

Activated by `--interactive` or `-i`.

1. Plan is displayed with numbered steps and reasoning.
2. User prompted: `Proceed? [Y/n/edit]`
   - `Y` or Enter: execute as planned
   - `n`: abort
   - `edit`: display steps as a numbered list. User can type `remove 3` or `add scope @handle` or `reorder 2 4 1 3`. Simple text parsing, not a TUI editor.
3. After each replan trigger, the agent shows what it found and what it wants to do. User prompted: `[Y/n]`
4. If the agent wants to skip steps, user prompted: `Skip remaining? [y/N]`

Interactive prompts use `readline` (already a dependency via repl.ts). No new deps.

### 4.4 Snapshot Storage

Agent runs store a composite snapshot at `~/.corvus/snapshots/agent-<hash>/`:

```json
{
  "command": "agent",
  "topic": "<question>",
  "data": {
    /* AgentBrief */
  },
  "raw": "{ /* full AgentContext as JSON string */ }",
  "timestamp": 1741651234567,
  "cost": 0.021
}
```

Individual command steps also store their own snapshots in their normal locations (e.g., `scan-<hash>/`). This means:

- `corvus history` shows agent runs
- Re-running the same agent question produces a diff of the brief
- Individual command snapshots are available for standalone re-use

---

## 5. Presentation Layer

### 5.1 Theme (`src/cli/theme.ts`)

```typescript
import chalk from 'chalk'

export const t = {
  accent: chalk.hex('#7C3AED'),
  positive: chalk.green,
  negative: chalk.red,
  warning: chalk.yellow,
  muted: chalk.dim,
  heading: chalk.bold,
  error: chalk.red.bold,
}

export const isTTY = process.stdout.isTTY ?? false

export function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

export function out(s: string): void {
  console.log(isTTY ? s : strip(s))
}

export function sentimentBar(val: number, width: number = 20): string {
  // val from -1 to +1. Bar fills from center.
  // Negative fills left in red, positive fills right in green.
}

export function confidenceBar(val: number, width: number = 20): string {
  // val from 0 to 1. Simple left-to-right green fill.
}

export function divider(width: number = 45): string {
  return t.muted('─'.repeat(width))
}

export function box(lines: string[]): string {
  // Single-line border box using ╔═╗║╚═╝ characters
  // Auto-sizes to longest line
  // Used for BLUF signal line only
}

export const LOGO = t.accent(`  ╔═╗╔═╗╦═╗╦  ╦╦ ╦╔═╗
  ║  ║ ║╠╦╝╚╗╔╝║ ║╚═╗
  ╚═╝╚═╝╩╚═ ╚╝ ╚═╝╚═╝`)
```

**Migration:** All existing `chalk.red(...)`, `chalk.green(...)`, `chalk.bold(...)`, `chalk.dim(...)` calls across `output.ts`, `run-command.ts`, and `repl.ts` are replaced with `t.negative(...)`, `t.positive(...)`, `t.heading(...)`, `t.muted(...)` respectively. This is a mechanical find-and-replace with no behavior change (the colors are identical). The purpose is a single source of truth for the palette.

**`--no-color` flag:** Added to the root Commander program in `bin/corvus.ts`. When set, `chalk.level = 0` which disables all color. Combined with TTY detection: if `!isTTY`, chalk level is also set to 0 automatically. This means piping output (e.g., `corvus agent "question" | less`) strips colors by default — this is intentional and matches the behavior of tools like `ls` and `git`. Users who want color in a pipe can set `FORCE_COLOR=1` (supported natively by chalk 5.x).

### 5.2 Step Progress (`src/cli/progress.ts`)

Multi-line in-place progress tracker for agent runs.

```typescript
export class StepProgress {
  private steps: {
    label: string
    status: 'pending' | 'running' | 'done' | 'failed'
    tag?: string
    durationMs?: number
  }[]
  private rendered: boolean = false

  constructor(steps: { label: string; tag?: string }[])

  start(index: number): void // mark step as running, re-render
  complete(index: number, durationMs: number): void // mark done, re-render
  fail(index: number): void // mark failed, re-render
  addStep(label: string, tag: string): void // append a new step (replan)
  render(): void // write all lines, using ANSI cursor-up to overwrite previous render
}
```

Rendering:

- Each step is one line: `  [n/total] command · target                status`
- Status symbols: `○` pending, spinner character running, `✓` done (green), `✗` failed (red)
- Duration shown after checkmark: `✓ 3.2s` (muted)
- Tags shown after target: `(lead)` in accent, `(replan)` in warning
- On non-TTY: no ANSI cursor control. Steps print sequentially as they complete (one line per step, no overwriting).
- Windows note: Windows Terminal (the default on Windows 11) has full ANSI support including cursor movement. Legacy conhost does not. The `isTTY` check from `theme.ts` is sufficient — legacy conhost users who pipe output or run in non-TTY contexts get the fallback automatically. No special Windows detection needed beyond `isTTY`.

### 5.3 Agent Brief Renderer

Located in `src/cli/output.ts` as `renderAgentBrief(brief: AgentBrief, previousSentiment?: number): string`.

The `previousSentiment` parameter is populated from the previous agent snapshot's `sentiment` field (loaded via `SnapshotStore.loadLatest` in the agent command, same pattern as other structured commands). If no previous snapshot exists, the "(was +0.12)" display is omitted.

Structure:

```
  ╔═══════════════════════════════════════════════════╗
  ║  [signal line — one sentence, the conclusion]     ║
  ╚═══════════════════════════════════════════════════╝

  Sentiment  -0.38 avg  ████████░░░░░░░░░░░░  (was +0.12)

  Key Findings
    · [bullet 1]
    · [bullet 2]
    · [bullet 3 — up to 7]

  Top Voices
    @handle  reach  sentiment  "stance quote"
    @handle  reach  sentiment  "stance quote"

  ⚠ Contradictions
    [contradiction 1]
    [contradiction 2]

  Confidence  ██████████████░░░░░░  0.72  moderate — [reason]
  Sample: 147 tweets from 38 authors
  [stale: newest tweet 8h ago]           ← only if staleness detected

  ─────────────────────────────────────────────────
  N steps · Ns · N tweets · N accounts · $N.NNN
```

If `--format json`, output the raw `AgentBrief` object. If `--format md`, output a markdown version with headers and bullet lists.

### 5.4 CLI Branding

The `LOGO` constant renders on:

- `corvus --help` (above the command list)
- `corvus repl` startup (above the prompt)
- `corvus agent` runs (above the progress tracker)

Not rendered on: individual commands (scan, pulse, etc.), `--version`, error output.

Help output is reorganized into categories:

```
Intelligence    agent, ask, scan, pulse, trace, gather
Analysis        read, scope
Session         repl, watch, history
Setup           auth
```

`agent` is highlighted in accent color in the help listing.

### 5.5 Spinner Text Replacement

All existing spinner text is replaced across every command:

| File        | Old                         | New                              |
| ----------- | --------------------------- | -------------------------------- |
| `ask.ts`    | `scanning X...`             | `ask · {truncated question}`     |
| `scan.ts`   | `scanning X...`             | `scan · {topic}`                 |
| `pulse.ts`  | `reading pulse...`          | `pulse · {topic}`                |
| `trace.ts`  | `tracing narrative...`      | `trace · {topic}`                |
| `gather.ts` | `gathering intelligence...` | `gather · {topic}`               |
| `read.ts`   | `reading tweet...`          | `read · {id}`                    |
| `scope.ts`  | `scoping @{handle}...`      | `scope · @{handle}`              |
| `repl.ts`   | `thinking...`               | (empty — spinner animation only) |

---

## 6. Anti-Boilerplate Standards

Hard constraints enforced across the entire CLI.

### Banned Patterns

- No gerund spinner text ("analyzing...", "thinking...", "gathering intelligence...")
- No AI self-reference in any output ("I found", "Let me analyze", "Here's what I detected")
- No hedging language in briefs ("It appears that", "Based on my analysis")
- No emoji in any CLI output — enforced in Grok system prompts with explicit "No emoji" instruction
- No celebration text ("Done!", "Complete!", "Success!")
- No "powered by AI" or "AI-generated" attribution in output
- No exclamation marks in any CLI text
- No ALL CAPS except the logo

### Brief Tone

The Grok synthesizer system prompt enforces:

- Bloomberg wire note style, not chatbot conversation
- No first person
- Lead with conclusion, evidence follows
- Flag uncertainty as data quality ("small sample: 47 tweets") not as politeness ("I should note that the sample size is limited")
- Terse. Every word earns its place.

### Silence Principle

- Successful commands print their data and nothing else
- No wrapper text around output ("Here are the results for...")
- The footer line is data (step count, duration, tweet count, cost), not narration
- Errors print the error message. No apology, no suggestion to "try again later."

---

## 7. Test Strategy

### Pipeline hardening tests

- `parseGrokJson`: markdown-fenced JSON, preamble text, trailing text, empty string, valid JSON, completely invalid input
- Retry/timeout: mock 429 then success, mock 500 then success, mock timeout, mock 401 (no retry), mock Retry-After header
- `computeTopAccounts`: multi-tweet authors with different sentiments (the bug case)
- `computeBaseMetrics`: verify impressions are included in totals

### Agent tests

- `AgentPlanner`: mock Grok to return a plan, verify structure
- `AgentExecutor`: mock buildSnapshot for each command type, verify context accumulation, verify lead extraction, verify replan triggers at correct step indices
- `AgentSynthesizer`: mock Grok to return a brief, verify locally-computed fields (confidence, contradictions, staleness, sample size) override/supplement Grok's output
- `computeConfidence`: known inputs → known outputs for volume, consistency, diversity
- `detectContradictions`: known divergent results → expected contradiction strings
- Command registration: `corvus agent` appears in program.commands
- Auth guard: exits 1 with no grok key
- `--cost` flag: shows pricing
- `--format json`: valid JSON output
- Interactive mode: mock readline, verify plan display and prompt sequence

### Presentation tests

- `theme.ts`: `strip()` removes ANSI codes, `sentimentBar()` and `confidenceBar()` produce correct-length strings, `box()` wraps content correctly
- `StepProgress`: verify rendered output for pending/running/done/failed states, verify non-TTY fallback
- `renderAgentBrief`: verify all sections present, verify staleness warning appears when applicable, verify contradiction section omitted when empty

### Existing test updates

- All 6 command tests: update mock data to include impressions in expected engagement totals
- `metrics.test.ts`: update `computeBaseMetrics` assertions, add multi-tweet-author test for `computeTopAccounts`

---

## 8. File Change Summary

### New files

- `src/core/agent.ts` — AgentPlanner, AgentExecutor, AgentSynthesizer
- `src/cli/commands/agent.ts` — Commander registration, rendering
- `src/cli/progress.ts` — StepProgress class
- `src/cli/theme.ts` — Color palette, TTY detection, visual primitives
- `tests/core/agent.test.ts` — Agent unit tests
- `tests/cli/commands/agent.test.ts` — Agent command tests
- `tests/cli/progress.test.ts` — StepProgress tests
- `tests/cli/theme.test.ts` — Theme utility tests

### Modified files

- `src/core/grok-adapter.ts` — add `parseGrokJson`, `GrokParseError`, retry/timeout logic
- `src/core/x-adapter.ts` — add pagination to `searchRecent`
- `src/core/metrics.ts` — fix `computeTopAccounts`, add impressions to engagement, add `computeConfidence`, `detectContradictions`
- `src/core/schemas.ts` — add `AgentBrief` to the `Snapshot` union type, add `ConfidenceScore`, `BriefAccount`, `BriefEvidence` interfaces, export `AGENT_MATCH_KEYS`
- `src/cli/output.ts` — add `renderAgentBrief`, migrate all chalk calls to theme, add `sentimentBar` to existing renderers
- `src/cli/run-command.ts` — migrate chalk calls to theme
- `src/cli/repl.ts` — migrate chalk calls to theme, remove spinner text
- `src/cli/commands/scan.ts` — refactor to named `buildScanSnapshot` export, use `parseGrokJson`, return `BuildResult`, update spinner text
- `src/cli/commands/pulse.ts` — refactor to named `buildPulseSnapshot` export, use `parseGrokJson`, return `BuildResult`, update spinner text
- `src/cli/commands/trace.ts` — refactor to named `buildTraceSnapshot` export, use `parseGrokJson`, return `BuildResult`, update spinner text
- `src/cli/commands/gather.ts` — refactor to named `buildGatherSnapshot` export, use `parseGrokJson`, return `BuildResult`, update spinner text
- `src/cli/commands/read.ts` — refactor to named `buildReadSnapshot` export, use `parseGrokJson`, return `BuildResult`, update spinner text
- `src/cli/commands/scope.ts` — refactor to named `buildScopeSnapshot` export, use `parseGrokJson`, return `BuildResult`, update spinner text
- `bin/corvus.ts` — register agent command, add `--no-color` flag, add logo to help, reorganize help categories
- `tests/core/metrics.test.ts` — update engagement totals, add bug regression test
- `tests/core/grok-adapter.test.ts` — add parseGrokJson tests, retry tests
- `tests/core/x-adapter.test.ts` — add pagination tests
- `tests/cli/commands/*.test.ts` — update mock data for impressions
- `tests/cli/output.test.ts` — add renderAgentBrief tests

### Unchanged files

- `src/core/cache.ts` — no changes
- `src/core/differ.ts` — no changes
- `src/core/snapshots.ts` — no changes
- `src/core/types.ts` — add `BuildResult<T>` interface
- `src/infra/auth.ts` — no changes
- `src/infra/config.ts` — no changes
- `src/cli/commands/watch.ts` — no changes
- `src/cli/commands/history.ts` — no changes

---

## 9. Implementation Phases

### Phase 1: Pipeline Hardening

- 2a: JSON parse safety
- 2b: Retry and timeout
- 2c: Fix computeTopAccounts bug
- 2d: Include impressions in engagement (including formatTweetsForAnalysis)
- 2e: Refactor buildSnapshot to named exports with BuildResult<T>
- Tests for all five changes
- All 264 existing tests still pass

### Phase 2: Presentation Layer

- theme.ts — palette, TTY detection, visual primitives
- Migrate all chalk calls across output.ts, run-command.ts, repl.ts
- Update spinner text across all commands
- Add --no-color flag
- Add logo to help and repl
- progress.ts — StepProgress class
- Tests for theme and progress

### Phase 3: Agent Core

- schemas.ts — agent types, brief types, confidence types
- metrics.ts — computeConfidence, detectContradictions
- agent.ts — AgentPlanner, AgentExecutor, AgentSynthesizer
- Export buildSnapshot from all 6 command files
- x-adapter.ts — pagination support
- Tests for agent core

### Phase 4: Agent Command

- commands/agent.ts — Commander registration, fire-and-forget mode
- output.ts — renderAgentBrief
- Interactive mode
- Snapshot storage for agent runs
- bin/corvus.ts — register agent, reorganize help
- End-to-end tests

---

## 10. Cost Model

Typical agent run with 5 command steps:

| Call            | Tokens (est.)            | Cost        |
| --------------- | ------------------------ | ----------- |
| Planner         | ~500 in / ~300 out       | $0.0003     |
| Command step x5 | ~2000 in / ~800 out each | $0.0040     |
| Replan x2       | ~1000 in / ~200 out each | $0.0006     |
| Synthesizer     | ~3000 in / ~1000 out     | $0.0011     |
| **Total**       |                          | **~$0.006** |

At grok-4-1-fast pricing ($0.20/M input, $0.50/M output), a typical agent run costs under $0.01. A deep investigation with 8 steps and 3 replans would cost ~$0.02-0.03.

Note: These estimates are illustrative based on current `MODEL_PRICING` in `grok-adapter.ts`. Actual costs depend on response verbosity and may change if xAI adjusts pricing. The `--budget` flag provides a hard cap regardless of pricing changes.
