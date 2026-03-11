import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod/v4'
import { AuthManager } from '../infra/auth.js'
import { ConfigManager } from '../infra/config.js'
import { GrokAdapter } from '../core/grok-adapter.js'
import { XAdapter } from '../core/x-adapter.js'
import { buildScanSnapshot } from '../core/builders/scan.js'
import { buildPulseSnapshot } from '../core/builders/pulse.js'
import { buildTraceSnapshot } from '../core/builders/trace.js'
import { buildGatherSnapshot } from '../core/builders/gather.js'
import { buildReadSnapshot, extractTweetId } from '../core/builders/read.js'
import { buildScopeSnapshot } from '../core/builders/scope.js'
import { AgentPlanner, AgentExecutor, AgentSynthesizer } from '../core/agent.js'
import type { CorvusDeps } from '../core/types.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

function initDeps(): CorvusDeps {
  const auth = new AuthManager(ConfigManager.defaultDir())

  const grokKey = auth.getGrokKey()
  if (!grokKey) {
    throw new Error(
      'No Grok API key found. Set CORVUS_GROK_KEY or run: corvus auth setup',
    )
  }

  const xToken = auth.getXToken()
  return {
    grok: new GrokAdapter(grokKey),
    x: xToken ? new XAdapter(xToken) : null,
  }
}

function jsonResult(data: unknown, cost: number): CallToolResult {
  const payload = { ...data as Record<string, unknown>, _cost: cost }
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'corvus',
    version: '0.2.0',
  })

  let deps: CorvusDeps | null = null

  function getDeps(): CorvusDeps {
    if (!deps) {
      deps = initDeps()
    }
    return deps
  }

  // ── scan ──

  server.registerTool(
    'corvus_scan',
    {
      title: 'Scan Topic',
      description:
        'Snapshot X discourse on a topic — returns narratives, top voices, sentiment, engagement metrics. Run again later to see what changed.',
      inputSchema: z.object({
        topic: z.string().describe('Topic or query to scan'),
        maxResults: z
          .number()
          .int()
          .min(10)
          .max(100)
          .default(50)
          .describe('Max tweets to analyze'),
      }),
    },
    async ({ topic, maxResults }): Promise<CallToolResult> => {
      const result = await buildScanSnapshot(getDeps(), topic, maxResults)
      return jsonResult(result.data, result.cost)
    },
  )

  // ── pulse ──

  server.registerTool(
    'corvus_pulse',
    {
      title: 'Sentiment Pulse',
      description:
        'Get the sentiment pulse on a topic — bull/bear signals, momentum indicators, key voices ranked by reach.',
      inputSchema: z.object({
        topic: z.string().describe('Topic or query to pulse'),
        maxResults: z
          .number()
          .int()
          .min(10)
          .max(100)
          .default(50)
          .describe('Max tweets to analyze'),
      }),
    },
    async ({ topic, maxResults }): Promise<CallToolResult> => {
      const result = await buildPulseSnapshot(getDeps(), topic, maxResults)
      return jsonResult(result.data, result.cost)
    },
  )

  // ── trace ──

  server.registerTool(
    'corvus_trace',
    {
      title: 'Trace Narrative',
      description:
        'Map how a narrative spreads across X — identifies the origin tweet, amplification phases, key amplifiers, and how the framing mutated over time.',
      inputSchema: z.object({
        narrative: z.string().describe('Narrative or claim to trace'),
        maxResults: z
          .number()
          .int()
          .min(10)
          .max(100)
          .default(50)
          .describe('Max tweets to analyze'),
      }),
    },
    async ({ narrative, maxResults }): Promise<CallToolResult> => {
      const result = await buildTraceSnapshot(getDeps(), narrative, maxResults)
      return jsonResult(result.data, result.cost)
    },
  )

  // ── gather ──

  server.registerTool(
    'corvus_gather',
    {
      title: 'Deep Intelligence',
      description:
        'Comprehensive intelligence gathering — combines X discourse analysis with web search for full context, including narratives, web developments, and forward-looking outlook.',
      inputSchema: z.object({
        topic: z.string().describe('Topic to investigate'),
        maxResults: z
          .number()
          .int()
          .min(10)
          .max(100)
          .default(50)
          .describe('Max tweets to analyze'),
      }),
    },
    async ({ topic, maxResults }): Promise<CallToolResult> => {
      const result = await buildGatherSnapshot(getDeps(), topic, maxResults)
      return jsonResult(result.data, result.cost)
    },
  )

  // ── read ──

  server.registerTool(
    'corvus_read',
    {
      title: 'Analyze Tweet',
      description:
        'Deep analysis of a single tweet — returns significance level, contextual analysis, and extracted signals. Accepts a tweet ID or full x.com URL.',
      inputSchema: z.object({
        tweetIdOrUrl: z
          .string()
          .describe('Tweet ID (numeric) or full x.com/twitter.com URL'),
      }),
    },
    async ({ tweetIdOrUrl }): Promise<CallToolResult> => {
      const tweetId = extractTweetId(tweetIdOrUrl)
      if (!tweetId) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid tweet ID or URL' }) }],
          isError: true,
        }
      }
      const result = await buildReadSnapshot(getDeps(), tweetId)
      return jsonResult(result.data, result.cost)
    },
  )

  // ── scope ──

  server.registerTool(
    'corvus_scope',
    {
      title: 'Profile Account',
      description:
        'Profile analysis of an X account — influence level, content patterns, recent focus areas, network position, and signal value assessment.',
      inputSchema: z.object({
        username: z
          .string()
          .describe('X username (with or without @)'),
        tweetCount: z
          .number()
          .int()
          .min(5)
          .max(100)
          .default(10)
          .describe('Number of recent tweets to analyze'),
      }),
    },
    async ({ username, tweetCount }): Promise<CallToolResult> => {
      const handle = username.replace(/^@/, '')
      const result = await buildScopeSnapshot(getDeps(), handle, tweetCount)
      return jsonResult(result.data, result.cost)
    },
  )

  // ── agent ──

  server.registerTool(
    'corvus_agent',
    {
      title: 'Investigate',
      description:
        'Autonomous multi-step investigation. Plans its own research across scan/pulse/trace/scope/gather, follows leads, detects contradictions, and synthesizes a structured intelligence brief with confidence scoring. This is the most powerful tool — use it for complex questions.',
      inputSchema: z.object({
        question: z.string().describe('Intelligence question to investigate'),
        maxSteps: z
          .number()
          .int()
          .min(2)
          .max(12)
          .default(6)
          .describe('Maximum investigation steps'),
        budget: z
          .number()
          .min(0.01)
          .max(1.0)
          .default(0.1)
          .describe('Maximum cost in USD'),
      }),
    },
    async ({ question, maxSteps, budget }): Promise<CallToolResult> => {
      const d = getDeps()
      const planner = new AgentPlanner(d.grok)
      const { plan, costUsd: planCost } = await planner.plan(question)

      const executor = new AgentExecutor(d, question, plan, {
        maxSteps,
        budget,
        replan: true,
      })
      const context = await executor.execute(planCost)

      const synthesizer = new AgentSynthesizer(d.grok)
      const brief = await synthesizer.synthesize(context)

      return jsonResult(
        {
          brief,
          stepsExecuted: context.results.length,
        },
        context.totalCost,
      )
    },
  )

  return server
}
