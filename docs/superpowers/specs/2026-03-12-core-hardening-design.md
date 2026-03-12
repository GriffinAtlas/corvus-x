# Core Hardening — Design Spec

**Date:** 2026-03-12
**Branch:** feat/tui (current), implementation on new branch from master
**Scope:** Make the core intelligence loop reliable, responsive, and sharp

## Problem

Corvus produces useful intelligence but undermines trust in three ways:

1. **Fragile JSON parsing** — `parseGrokJson()` uses regex to extract JSON from Grok's raw text. Grok supports structured outputs that guarantee valid, schema-conformant responses. We're doing it the hard way.
2. **Frozen CLI** — Every command blocks for 3-10 seconds with zero feedback. No streaming. Terminal-native users expect progressive output.
3. **Naive ranking** — Top accounts sorted by post count, key voices by follower count, sentiment is a simple average. X's own algorithm values replies at 27x a like and retweets at 2x. Our rankings ignore this.
4. **Unverifiable output** — No citations. Every analysis is a claim with no sources. The API returns source URLs automatically; we discard them.
5. **Stale model config** — `MODEL_PRICING` is missing models and has a pricing discrepancy. `x_search` parameters we could use (`excluded_x_handles`) aren't wired.

## Design

Six changes, all in existing files. No new commands, no new subsystems.

---

### 1. Structured Outputs via Zod Schemas

**Files:** `src/core/grok-adapter.ts`, new `src/core/validators.ts`, `src/core/types.ts`

The xAI API supports schema-validated structured outputs for Grok 4 family models. Pass a JSON schema via `response_format` and the response is guaranteed to conform — no regex extraction needed.

**Grok 4 family detection:** `const isGrok4Family = (model: string) => model.startsWith('grok-4')`. This correctly includes `grok-4-1-fast*`, `grok-4-fast*`, `grok-4.20*`, `grok-4-0709` and excludes `grok-3*`, `grok-code-fast-1`.

**New file `src/core/validators.ts`:**
Define Zod schemas for all 6 Grok response types + 2 agent schemas:
- `GrokScanResponseSchema`
- `GrokPulseResponseSchema`
- `GrokTraceResponseSchema`
- `GrokGatherResponseSchema`
- `GrokReadResponseSchema`
- `GrokScopeResponseSchema`
- `AgentPlanSchema`
- `ReplanDecisionSchema`

Each schema mirrors the corresponding TypeScript interface in `schemas.ts`. The Zod schemas become the source of truth; the TS interfaces can be derived from them via `z.infer<>`.

**`QueryOptions` changes (`src/core/types.ts`):**
```typescript
export interface QueryOptions {
  model?: string
  enableXSearch?: boolean
  enableWebSearch?: boolean
  systemPrompt?: string
  maxTokens?: number
  xSearchFromDate?: string
  xSearchToDate?: string
  xSearchHandles?: string[]
  xSearchExcludeHandles?: string[]  // NEW
  responseSchema?: ZodType           // NEW — when provided, enables structured output
}
```

**`GrokAdapter.query()` changes (`src/core/grok-adapter.ts`):**

**Important constraint:** The OpenAI SDK's `client.chat.completions.parse()` method runs `validateInputTools()` on the tools array, which rejects xAI-specific tool types like `{ type: 'x_search' }`. We cannot use `parse()` when tools are present.

**Solution:** Use `client.chat.completions.create()` with `response_format` set directly, bypassing `parse()` and its tool validation. Then validate the response text ourselves using the Zod schema:

- When `options.responseSchema` is provided AND model is Grok 4 family:
  - Add `response_format: zodResponseFormat(schema, name)` to the `createParams`
  - This works alongside xAI tools (`x_search`, `web_search`) because we use `create()` not `parse()`
  - After receiving the response, validate with `schema.parse(JSON.parse(response.text))`
  - The API guarantees valid JSON conforming to the schema; the Zod parse is a safety net
  - No `parseGrokJson()` regex extraction needed
- When `options.responseSchema` is provided but model is NOT Grok 4 family:
  - Fall back to existing `chat.completions.create()` + `parseGrokJson()` path
  - Then validate with `schema.safeParse()` — log a warning on validation failure but don't throw (best-effort for older models)
- When `options.responseSchema` is omitted (prose queries like `ask`):
  - Use standard `chat.completions.create()` as today, no `response_format`

**Builder changes:**
Each builder passes its Zod schema to `query()`. Example for scan:
```typescript
const grok = await deps.grok.query(prompt, {
  systemPrompt: SYSTEM_PROMPT,
  maxTokens: 3072,
  responseSchema: GrokScanResponseSchema,
})
```

**`parseGrokJson()` stays** as a fallback for non-Grok-4 models but is no longer the primary parsing path. `GrokParseError` stays for those fallback cases.

**Zod schema constraints (from xAI docs):**
- Supported: string, number, boolean, objects, arrays, enums, `anyOf`
- Not supported: `allOf`, `minLength`/`maxLength` on strings, `minItems`/`maxItems` on arrays
- Structured outputs + tools only available for Grok 4 family models

---

### 2. Streaming for Prose Commands

**Files:** `src/core/grok-adapter.ts`, `src/core/types.ts`, `src/cli/run-command.ts`, `src/core/agent.ts`

**New method on `GrokAdapter`:**
```typescript
async queryStream(
  prompt: string,
  options: QueryOptions = {},
  onChunk: (text: string) => void,
): Promise<GrokResponse>
```

- Uses `client.chat.completions.create({ ...params, stream: true, stream_options: { include_usage: true } })`
- Iterates the async stream internally; each chunk calls `onChunk(delta.content)` for progressive rendering
- After stream completes, returns full `GrokResponse` (aggregated text, usage, cost)
- If xAI's streaming endpoint does not honor `stream_options.include_usage`, fall back to estimating token count from aggregated text length using the model's tokenizer ratio (~4 chars/token)
- Existing `query()` method unchanged — structured commands still use it

**Where streaming is used:**

| Command | Stream? | Reason |
|---------|---------|--------|
| `ask` | Yes | Prose output, show as it arrives |
| Agent synthesizer | Yes | Final brief narrative streams to user |
| `scan/pulse/trace/gather/read/scope` | No | JSON response, must parse complete |
| Agent planner/replanner | No | Internal JSON, not user-facing |

**CLI integration (`src/cli/run-command.ts`):**
- `runCommand()` (used by `ask`) switches from awaiting full response to streaming
- Spinner lifecycle: start spinner → on first chunk, stop spinner → stream chunks to stdout → cache accumulated text
- Cached responses still render immediately (no streaming needed)

**Agent integration (`src/core/agent.ts`):**
- `AgentSynthesizer` accepts optional `onChunk` callback
- CLI passes a stdout writer; library/MCP consumers omit it and get the full response

**TUI integration:** Deferred. TUI currently renders after command completion. Token streaming in TUI is already listed as deferred in the TUI spec.

**Cost tracking:** Request streaming with `stream_options: { include_usage: true }` to get token counts in the final chunk. If xAI doesn't support this, estimate cost from text length (~4 chars/token) and log a warning. Test against xAI's endpoint during implementation to determine which path is needed.

---

### 3. Algorithm-Aligned Engagement Scoring

**Files:** `src/core/metrics.ts`, `src/core/schemas.ts`

**New constants in `metrics.ts`:**
```typescript
// Engagement weights derived from X's open-sourced algorithm (Heavy Ranker, April 2023)
// Source: twitter/the-algorithm-ml, normalized to likes = 1.0
//
// 2023 leak values: replies=27x, retweets=2x, likes=1x
// 2026 observed behavior: replies ~13.5-20x, retweets ~10-20x (sources vary)
// The algorithm has been re-tuned since the leak. Directional truth holds:
//   replies >> retweets >> likes
// but exact multipliers are approximate. Using conservative 2026 estimates.
//
// Bookmarks (~10-20x) and profile clicks (~12x) aren't available via X API v2.
// Last calibrated: 2026-03-12. Revisit when new data surfaces.
export const X_ENGAGEMENT_WEIGHTS = {
  like: 1.0,
  retweet: 10.0,
  reply: 13.5,
} as const
```

**New function in `metrics.ts`:**
```typescript
export function computeEngagementScore(tweet: Tweet): number {
  const { likes, retweets, replies } = tweet.metrics
  return likes * X_ENGAGEMENT_WEIGHTS.like
       + retweets * X_ENGAGEMENT_WEIGHTS.retweet
       + replies * X_ENGAGEMENT_WEIGHTS.reply
}
```

**Ranking changes:**

`computeTopAccounts()` — sort by total engagement score across all author's tweets, not `postCount`. An account with 1 tweet that sparked 500 replies ranks higher than one with 10 low-engagement tweets.

Updated `AccountEntry` interface:
```typescript
export interface AccountEntry {
  handle: string
  postCount: number          // kept for display
  followers: number          // kept for display
  avgSentiment: number
  engagementScore: number    // NEW — sum of computeEngagementScore() across author's tweets
}
```
Sort order: `engagementScore` descending, `followers` as tiebreaker.

`computeKeyVoices()` — sort by engagement score, not raw `followers`. Actual impact on the conversation, not vanity metrics.

`computeTopPosts()` — sort by engagement score, not raw sum of all metrics. A tweet with 50 replies (score: 675) ranks above one with 500 likes and 0 replies (score: 500). Note: the `engagement` field on `GatherSnapshot.topPosts` changes meaning from raw sum (likes+RT+replies+impressions) to weighted score (likes×1 + RT×2 + replies×27, impressions excluded). This is intentional — impressions are a vanity metric, not an engagement signal.

**Sentiment weighting:**

`SentimentBreakdown` changes:
```typescript
export interface SentimentBreakdown {
  avg: number       // engagement-weighted average (when tweets available)
  rawAvg: number    // simple unweighted average (always computed)
  positive: number
  neutral: number
  negative: number
}
```

`computeSentiment()` signature change:
```typescript
export function computeSentiment(
  scores: GrokTweetScore[],
  tweets?: Tweet[],
): SentimentBreakdown
```

- When `tweets` provided (X API path): `avg` is weighted by `computeEngagementScore()` per tweet. Each tweet's sentiment multiplied by its engagement score, summed, divided by total engagement score.
- When `tweets` omitted (Grok-only path): `avg` equals `rawAvg` (simple average, same as today).
- `rawAvg` always computed as the simple average regardless.
- `positive`/`neutral`/`negative` counts unchanged.

**Impact on builders:** X API path builders already have `tweets` and pass them in. Grok-only builders call `computeSentiment(scores)` as before — `avg` equals `rawAvg` for them.

**Breaking changes:**
- `SentimentBreakdown` gains required `rawAvg` field. This is a public API break (`computeSentiment` and `SentimentBreakdown` are exported from `src/index.ts`). Acceptable at 0.x — no semver contract yet.
- `AccountEntry` gains required `engagementScore` field. Same consideration.
- `GatherSnapshot.topPosts[].engagement` changes meaning (raw sum → weighted score).
- Old stored snapshots won't have `rawAvg` or `engagementScore`. Make `rawAvg` optional in `SentimentBreakdown` (`rawAvg?: number`) so old snapshots deserialize without error. Compute functions always return it, but the type allows missing values from legacy data. Same for `AccountEntry.engagementScore`.

---

### 4. Citations

**Files:** `src/core/grok-adapter.ts`, `src/core/types.ts`, `src/core/schemas.ts`, all builders, `src/cli/output.ts`, `src/mcp/server.ts`

**New types (`src/core/types.ts`):**
```typescript
export interface GrokCitation {
  type: string   // 'url_citation' from OpenAI SDK; xAI may extend with other types
  url: string
  title?: string
}
```

Using `type: string` instead of a discriminated union because the OpenAI SDK only defines `url_citation` in its annotation types, but xAI may return extended types like `x_citation` or `web_citation`. We accept whatever comes back and filter by presence of `url` field rather than a hardcoded type set.

**`GrokResponse` change:**
```typescript
export interface GrokResponse {
  text: string
  usage: { inputTokens: number; outputTokens: number; costUsd: number; toolCalls: number }
  citations: GrokCitation[]  // NEW — extracted from response annotations
}
```

**Extraction in `GrokAdapter.query()`:**
After receiving the API response, extract citations from `response.choices[0].message.annotations` (Chat Completions API). The OpenAI SDK nests citation data inside a `url_citation` sub-object:
```typescript
// annotation structure: { type: 'url_citation', url_citation: { url, title, start_index, end_index } }
const citations = (annotations ?? [])
  .filter((a) => a.url_citation?.url)
  .map((a) => ({ type: a.type, url: a.url_citation.url, title: a.url_citation.title }))
```
Deduplicate by URL. If no annotations are present (older models, non-tool queries), return empty array.

**Note on first run after update:** The `avg` field in `SentimentBreakdown` changes meaning from simple average to engagement-weighted. Diffs against old snapshots will show a one-time methodological delta on `sentiment.avg`. This resolves after the first weighted snapshot establishes the new baseline.

**Flow through the pipeline:**

`BuildResult<T>` (`src/core/types.ts`):
```typescript
export interface BuildResult<T> {
  data: T
  raw: string
  cost: number
  tweets: Tweet[]
  scores: GrokTweetScore[]
  newestTweetAt: number | null
  citations: GrokCitation[]  // NEW
}
```

`StoredSnapshot` (`src/core/schemas.ts`):
```typescript
export interface StoredSnapshot<T extends Snapshot = Snapshot> {
  // ... existing fields
  citations?: GrokCitation[]  // NEW — persisted with snapshot
}
```

`AgentBrief` (`src/core/schemas.ts`):
```typescript
export interface AgentBrief {
  // ... existing fields
  citations: GrokCitation[]  // NEW — aggregated from all steps
}
```

**CLI output (`src/cli/output.ts`):**
After rendering the analysis, render a numbered source list:
```
Sources:
  [1] x.com/user/status/123456
  [2] x.com/otheruser/status/789012
  [3] example.com/article
```

**MCP output (`src/mcp/server.ts`):**
Include `citations` array in the JSON payload alongside existing fields and `_cost`.

**Agent pipeline (`src/core/agent.ts`):**
`AgentExecutor` collects citations from each step's `BuildResult`. `AgentSynthesizer` aggregates all citations, deduplicates by URL, includes in final `AgentBrief`.

---

### 5. x_search `excluded_x_handles`

**Files:** `src/core/grok-adapter.ts`, `src/core/types.ts`, `src/cli/commands/ask.ts`

**`QueryOptions`** gains `xSearchExcludeHandles?: string[]` (max 10, mutually exclusive with `xSearchHandles` per xAI docs).

**`GrokAdapter.query()`** — validation and tool config:
```typescript
// Validate mutual exclusivity in query(), not just CLI — protects library/MCP consumers
if (options.xSearchHandles?.length && options.xSearchExcludeHandles?.length) {
  throw new Error('Cannot use both xSearchHandles and xSearchExcludeHandles — they are mutually exclusive')
}

// When building the x_search tool config:
if (options.xSearchExcludeHandles?.length) {
  tool.excluded_x_handles = options.xSearchExcludeHandles
}
```

**CLI:** `ask` command gains `--exclude-handle <name...>` option. CLI also validates mutual exclusivity for a better error message, but the adapter-level check protects all consumers.

**Builders:** Grok-only path builders can accept exclude handles via options, passed through to `query()`.

---

### 6. MODEL_PRICING Update

**File:** `src/core/grok-adapter.ts`

Update `MODEL_PRICING` to match current xAI docs (as of 2026-03-12):

```typescript
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Fast tier
  'grok-4-1-fast': { input: 0.2, output: 0.5 },
  'grok-4-1-fast-reasoning': { input: 0.2, output: 0.5 },
  'grok-4-1-fast-non-reasoning': { input: 0.2, output: 0.5 },
  'grok-4-fast-reasoning': { input: 0.2, output: 0.5 },
  'grok-4-fast-non-reasoning': { input: 0.2, output: 0.5 },
  'grok-code-fast-1': { input: 0.2, output: 1.5 },
  'grok-3-mini': { input: 0.3, output: 0.5 },
  // Premium tier
  'grok-4.20-beta-0309-reasoning': { input: 2.0, output: 6.0 },
  'grok-4.20-beta-0309-non-reasoning': { input: 2.0, output: 6.0 },
  'grok-4.20-multi-agent-beta-0309': { input: 2.0, output: 6.0 },
  'grok-3': { input: 3.0, output: 15.0 },
  'grok-4-0709': { input: 3.0, output: 15.0 },
}
```

Changes from current:
- Add `grok-4-fast-reasoning`, `grok-4-fast-non-reasoning` ($0.20/$0.50)
- Add `grok-3-mini` ($0.30/$0.50)
- Add `grok-3` ($3.00/$15.00)
- Add `grok-4-0709` ($3.00/$15.00)
- Remove stale `grok-4` entry ($2.00/$6.00 — incorrect pricing)

---

## Testing Strategy

- **Structured outputs:** Mock `client.chat.completions.create()` with `response_format` to return schema-conformant JSON. Test Zod validation on response text. Test fallback path (non-Grok-4 model → `parseGrokJson()` + `safeParse()`). Test each Zod schema against known good/bad payloads.
- **Streaming:** Mock streaming response as async iterable. Verify `onChunk` called for each delta. Verify final `GrokResponse` matches aggregated content.
- **Engagement scoring:** Unit tests for `computeEngagementScore()` with known tweet metrics. Verify sorting order changes in `computeTopAccounts()`, `computeKeyVoices()`, `computeTopPosts()`. Test weighted vs unweighted sentiment.
- **Citations:** Verify extraction from mock API response annotations. Verify flow through `BuildResult` → `StoredSnapshot` → CLI output. Verify deduplication.
- **x_search exclude:** Verify `excluded_x_handles` passed to tool config. Verify mutual exclusivity validation with `xSearchHandles`.
- **Pricing:** Snapshot test on `MODEL_PRICING` to catch future drift.

All tests mock API calls. No real network requests.

---

## What This Does NOT Include

- **Responses API migration** — The Responses API (`/v1/responses`) is newer and has citations as first-class. However, migrating from Chat Completions is a larger change that affects every API interaction. Citations are available on Chat Completions via annotations. Migrate later if needed.
- **Image/video understanding** — x_search supports `enable_image_understanding` and `enable_video_understanding`. Valuable but scope creep. Separate spec.
- **TUI streaming** — TUI renders after command completion. Token streaming in TUI is deferred (already listed in TUI spec).
- **Cached input pricing** — xAI offers reduced rates for cached input tokens. Not tracked in cost calculation. Low priority — would require detecting cache hits.
- **Code interpreter tool** — Grok can run Python in a sandbox. Interesting for statistical analysis but overengineering for current needs.
- **Momentum/velocity labels** — Originally proposed, dropped after review. The diff pipeline already shows what changed. A `heating/cooling` label adds little over the raw delta.
- **Alert/notification system** — Separate spec (next cycle).
- **Network mapping** — Separate spec (future cycle).

---

## Files Changed

| File | Change |
|------|--------|
| `src/core/validators.ts` | **NEW** — Zod schemas for all Grok response types |
| `src/core/grok-adapter.ts` | Structured output path, streaming method, citations extraction, excluded_x_handles, MODEL_PRICING update |
| `src/core/types.ts` | `QueryOptions` new fields, `GrokCitation` type, `GrokResponse.citations`, `BuildResult.citations` |
| `src/core/schemas.ts` | `SentimentBreakdown.rawAvg`, `StoredSnapshot.citations`, `AgentBrief.citations`, `AccountEntry.engagementScore` |
| `src/core/metrics.ts` | `X_ENGAGEMENT_WEIGHTS`, `computeEngagementScore()`, weighted sentiment, engagement-scored ranking |
| `src/core/builders/*.ts` | Pass Zod schema to `query()`, pass tweets to `computeSentiment()`, propagate citations |
| `src/core/agent.ts` | Streaming in synthesizer, citation aggregation, schema params for planner/replanner |
| `src/cli/run-command.ts` | Streaming path for `runCommand()` |
| `src/cli/commands/ask.ts` | `--exclude-handle` option |
| `src/cli/output.ts` | Citation rendering |
| `src/mcp/server.ts` | Citations in tool response payloads |
| `tests/` | New tests for all changes, update existing tests for new `SentimentBreakdown` shape |
