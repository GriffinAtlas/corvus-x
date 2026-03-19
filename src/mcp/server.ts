import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod/v4'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { AuthManager } from '../infra/auth.js'
import { ConfigManager } from '../infra/config.js'
import { GrokAdapter } from '../core/grok-adapter.js'
import { XAdapter } from '../core/x-adapter.js'
import { buildScanSnapshot } from '../core/builders/scan.js'
import { buildPulseSnapshot } from '../core/builders/pulse.js'
import { buildTraceSnapshot } from '../core/builders/trace.js'
import { buildProfileSnapshot } from '../core/builders/profile.js'
import { AgentPlanner, AgentExecutor, AgentSynthesizer } from '../core/agent.js'
import type { CorvusDeps, GrokCitation } from '../core/types.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_VERSION: string = (() => {
  for (const depth of ['../..', '../../..']) {
    try {
      return JSON.parse(readFileSync(join(__dirname, depth, 'package.json'), 'utf-8')).version
    } catch { /* not at this depth */ }
  }
  return '0.0.0'
})()

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

function jsonResult(data: unknown, cost: number, citations?: GrokCitation[]): CallToolResult {
  const payload = {
    ...data as Record<string, unknown>,
    _cost: cost,
    ...(citations?.length ? { _citations: citations } : {}),
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'corvus',
    version: PKG_VERSION,
  })

  let deps: CorvusDeps | null = null

  function getDeps(): CorvusDeps {
    if (!deps) {
      deps = initDeps()
    }
    return deps
  }

  server.registerTool(
    'corvus_scan',
    {
      title: 'Scan Topic',
      description:
        'Snapshot X discourse on a topic — narratives, top voices, sentiment, engagement metrics.',
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
      return jsonResult(result.data, result.cost, result.citations)
    },
  )

  server.registerTool(
    'corvus_pulse',
    {
      title: 'Sentiment Pulse',
      description:
        'Sentiment pulse on a topic — bull/bear signals, key voices ranked by reach.',
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
      return jsonResult(result.data, result.cost, result.citations)
    },
  )

  server.registerTool(
    'corvus_trace',
    {
      title: 'Trace Narrative',
      description:
        'Trace how a narrative spreads — origin tweet, amplification phases, key amplifiers, mutations.',
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
      return jsonResult(result.data, result.cost, result.citations)
    },
  )

  server.registerTool(
    'corvus_profile',
    {
      title: 'Profile Account',
      description:
        'Analyze content strategy of an X account — posting cadence, content mix, top performers, voice traits.',
      inputSchema: z.object({
        username: z
          .string()
          .describe('X username (with or without @)'),
        postCount: z
          .number()
          .int()
          .min(5)
          .max(200)
          .default(50)
          .describe('Number of recent posts to analyze'),
      }),
    },
    async ({ username, postCount }): Promise<CallToolResult> => {
      const handle = username.replace(/^@/, '')
      const result = await buildProfileSnapshot(getDeps(), handle, postCount, false)
      return jsonResult(result.data, result.cost, result.citations)
    },
  )

  server.registerTool(
    'corvus_agent',
    {
      title: 'Investigate',
      description:
        'Multi-step investigation — plans research, follows leads, detects contradictions, synthesizes a brief with confidence scoring.',
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
        brief.citations,
      )
    },
  )

  return server
}
