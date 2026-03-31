import { Command } from 'commander'
import readline from 'readline'
import { t, revealCrow, banner, divider, agentBanner } from '../theme.js'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import { GrokAdapter, MODEL_PRICING, DEFAULT_MODEL } from '../../core/grok-adapter.js'
import { XAdapter } from '../../core/x-adapter.js'
import { SnapshotStore } from '../../core/snapshots.js'
import { diffSnapshots, formatDiffLines } from '../../core/differ.js'
import { AGENT_MATCH_KEYS } from '../../core/schemas.js'
import { AgentPlanner, AgentExecutor, AgentSynthesizer, agentMulti, MULTI_AGENT_MODEL } from '../../core/agent.js'
import { StepProgress } from '../progress.js'
import { renderAgentBrief, renderAgentBriefMd } from '../output.js'
import type { AgentPlan, AgentStep, AgentContext } from '../../core/agent.js'
import type { AgentBrief } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'
import type { CorvusDeps } from '../../core/types.js'

function stepLabel(step: AgentStep): string {
  const target = step.args.topic ?? step.args.username ?? ''
  return `${step.command} · ${target}`
}

function displayPlan(plan: AgentPlan): void {
  console.log(t.heading(`\n  Goal: ${plan.goal}`))
  console.log('')
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]
    console.log(`  ${t.muted(`${i + 1}.`)} ${stepLabel(step)}`)
    console.log(`     ${t.muted(step.reasoning)}`)
  }
  console.log('')
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

async function editPlan(plan: AgentPlan): Promise<AgentPlan> {
  console.log(t.muted('\n  Commands: remove <n>, add <command> <target>, done'))
  console.log('')
  for (let i = 0; i < plan.steps.length; i++) {
    console.log(`  ${i + 1}. ${stepLabel(plan.steps[i])}`)
  }

  const steps = [...plan.steps]

  while (true) {
    const input = await prompt('  > ')
    if (input === 'done' || input === '') break

    const removeMatch = input.match(/^remove\s+(\d+)$/)
    if (removeMatch) {
      const idx = parseInt(removeMatch[1], 10) - 1
      if (idx >= 0 && idx < steps.length) {
        steps.splice(idx, 1)
        console.log(t.muted(`  removed step ${idx + 1}`))
      }
      continue
    }

    const addMatch = input.match(/^add\s+(scan|pulse|trace|profile|hooks|draft)\s+(.+)$/)
    if (addMatch) {
      const command = addMatch[1] as AgentStep['command']
      const target = addMatch[2]
      const args: AgentStep['args'] = {}
      if (command === 'profile') args.username = target.replace(/^@/, '')
      else args.topic = target
      steps.push({ command, args, reasoning: 'user-added' })
      console.log(t.muted(`  added ${command} · ${target}`))
      continue
    }

    console.log(t.muted('  unknown command'))
  }

  return { ...plan, steps }
}

// ── Multi-agent mode (default) ──

async function runMultiAgent(
  grok: GrokAdapter,
  question: string,
  format: OutputFormat,
): Promise<void> {
  console.log(banner('agent', question))
  console.log(`  ${divider()}`)
  console.log('')
  console.log(`  ${t.accent('▸')} ${t.heading('deep research')} ${t.muted(`· ${MULTI_AGENT_MODEL}`)}`)

  const result = await agentMulti(grok, question)
  const brief = result.brief

  const store = new SnapshotStore(ConfigManager.defaultDir())
  const previous = store.loadLatest<AgentBrief>('agent', question)
  store.save('agent', question, brief, JSON.stringify(brief), result.cost)

  const renderOpts = {
    stepCount: brief.evidence.length,
    durationMs: result.durationMs,
    tweetCount: 0,
    accountCount: brief.keyAccounts.length,
    cost: result.cost,
    previousSentiment: previous ? (previous.data as AgentBrief).sentiment : undefined,
  }

  switch (format) {
    case 'json':
      console.log(JSON.stringify(brief, null, 2))
      break
    case 'md':
      console.log(renderAgentBriefMd(brief, renderOpts))
      break
    case 'table':
    default:
      console.log(renderAgentBrief(brief, renderOpts))
      if (previous) {
        const diff = diffSnapshots(previous.data, brief, AGENT_MATCH_KEYS)
        const diffText = formatDiffLines(diff, Date.now() - previous.timestamp)
        if (diffText) {
          console.log('')
          console.log(t.muted(diffText))
        }
      }
      break
  }
  console.log('')
}

// ── Classic mode (manual orchestration) ──

async function runClassicAgent(
  deps: CorvusDeps,
  question: string,
  options: {
    interactive?: boolean
    maxSteps: number
    format: OutputFormat
    replan: boolean
    budget: number
  },
): Promise<void> {
  console.log('')
  await revealCrow()
  console.log(agentBanner(question))

  console.log(t.muted(`  planning...`))
  const planner = new AgentPlanner(deps.grok)
  let plan: AgentPlan

  const planStart = Date.now()
  const planResult = await planner.plan(question)
  plan = planResult.plan
  const planCost = planResult.costUsd
  const planDuration = ((Date.now() - planStart) / 1000).toFixed(1)
  console.log(t.muted(`  plan: ${plan.steps.length} steps (${planDuration}s)\n`))

  if (options.interactive) {
    displayPlan(plan)
    const answer = await prompt('  Proceed? [Y/n/edit] ')
    if (answer === 'n' || answer === 'no') {
      console.log(t.muted('\n  aborted\n'))
      return
    }
    if (answer === 'edit') {
      plan = await editPlan(plan)
      if (plan.steps.length === 0) {
        console.log(t.muted('\n  no steps remaining, aborted\n'))
        return
      }
    }
  }

  const progress = new StepProgress(plan.steps.map((s) => ({ label: stepLabel(s) })))

  let aborted = false
  const agentStartTime = Date.now()

  const executor = new AgentExecutor(deps, question, plan, {
    maxSteps: options.maxSteps,
    budget: options.budget,
    replan: options.replan,
    onStepStart: (index) => progress.start(index),
    onStepComplete: (index, _step, durationMs) => progress.complete(index, durationMs),
    onStepFail: (index) => progress.fail(index),
    onStepSkip: (index, _step, reason) => progress.skip(index, reason),
    onReplan: (newSteps) => {
      for (const s of newSteps) progress.addStep(stepLabel(s), 'replan')
    },
    onLeadFound: (label, tag) => progress.addStep(label, tag),
  })

  const sigintHandler = () => {
    aborted = true
    executor.abort()
  }
  process.on('SIGINT', sigintHandler)

  let context: AgentContext
  progress.render()
  try {
    context = await executor.execute(planCost)
  } finally {
    progress.cleanup()
    process.removeListener('SIGINT', sigintHandler)
  }

  if (aborted || context.results.length === 0) {
    console.log('')
    console.log(t.muted(`\n  ${context.results.length} steps completed · $${context.totalCost.toFixed(4)}\n`))
    return
  }

  if (options.interactive && context.results.length > 0) {
    const answer = await prompt('\n  Synthesize brief? [Y/n] ')
    if (answer === 'n' || answer === 'no') {
      console.log(t.muted(`\n  ${context.results.length} steps completed · $${context.totalCost.toFixed(4)}\n`))
      return
    }
  }

  console.log(t.muted('\n  synthesizing...'))
  const synthesizer = new AgentSynthesizer(deps.grok)
  const brief = await synthesizer.synthesize(context)

  const store = new SnapshotStore(ConfigManager.defaultDir())
  const previous = store.loadLatest<AgentBrief>('agent', question)
  store.save('agent', question, brief, JSON.stringify(context), context.totalCost)

  const totalDuration = Date.now() - agentStartTime
  const allTweets = context.results.reduce((sum, r) => sum + r.tweets.length, 0)
  const allAuthors = new Set(context.results.flatMap((r) => r.tweets.map((tw) => tw.authorId))).size

  const renderOpts = {
    stepCount: context.results.length,
    durationMs: totalDuration,
    tweetCount: allTweets,
    accountCount: allAuthors,
    cost: context.totalCost,
    tokenSummary: context.usage.totalTokens > 0 ? context.usage.toSummary() : undefined,
    previousSentiment: previous ? (previous.data as AgentBrief).sentiment : undefined,
  }

  console.log('')
  switch (options.format) {
    case 'json':
      console.log(JSON.stringify(brief, null, 2))
      break
    case 'md':
      console.log(renderAgentBriefMd(brief, renderOpts))
      break
    case 'table':
    default:
      console.log(renderAgentBrief(brief, renderOpts))
      if (previous) {
        const diff = diffSnapshots(previous.data, brief, AGENT_MATCH_KEYS)
        const diffText = formatDiffLines(diff, Date.now() - previous.timestamp)
        if (diffText) {
          console.log('')
          console.log(t.muted(diffText))
        }
      }
      break
  }
  console.log('')
}

// ── Command registration ──

export function registerAgentCommand(program: Command): void {
  program
    .command('agent <question...>')
    .description('Investigate a question — uses Grok multi-agent for deep research')
    .option('-i, --interactive', 'checkpoint mode with plan approval (classic only)')
    .option('-n, --max-steps <n>', 'maximum steps for classic mode (2-12)', '8')
    .option('-f, --format <type>', 'output format: table, json, md', 'table')
    .option('--classic', 'use manual step-by-step orchestration instead of multi-agent')
    .option('--no-replan', 'disable adaptive replanning (classic only)')
    .option('--budget <amount>', 'cost cap in USD (classic only)', '0.10')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        questionParts: string[],
        options: {
          interactive?: boolean
          maxSteps: string
          format: OutputFormat
          classic?: boolean
          replan: boolean
          budget: string
          cost?: boolean
        },
      ) => {
        const question = questionParts.join(' ')

        const auth = new AuthManager(ConfigManager.defaultDir())
        const grokKey = auth.getGrokKey()
        if (!grokKey) {
          console.log(t.error('\n  No Grok API key found. Run: corvus auth setup\n'))
          process.exit(1)
        }

        if (options.cost) {
          const model = options.classic ? DEFAULT_MODEL : MULTI_AGENT_MODEL
          const pricing = MODEL_PRICING[model]
          console.log(t.muted(`\n  Model: ${model}`))
          console.log(t.muted(`  Input:  $${pricing.input.toFixed(2)}/M tokens`))
          console.log(t.muted(`  Output: $${pricing.output.toFixed(2)}/M tokens\n`))
          return
        }

        const xToken = auth.getXToken()
        const deps: CorvusDeps = {
          grok: new GrokAdapter(grokKey),
          x: xToken ? new XAdapter(xToken) : null,
        }

        if (options.classic) {
          await runClassicAgent(deps, question, {
            interactive: options.interactive,
            maxSteps: Math.max(2, Math.min(12, parseInt(options.maxSteps, 10) || 8)),
            format: options.format,
            replan: options.replan,
            budget: Math.max(0.01, parseFloat(options.budget) || 0.1),
          })
        } else {
          try {
            await runMultiAgent(deps.grok, question, options.format)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.log(t.warning(`\n  ✗ Deep research unavailable: ${msg}`))
            console.log(`  ${t.accent('▸')} ${t.heading('classic mode')} ${t.muted('· step-by-step orchestration')}\n`)
            await runClassicAgent(deps, question, {
              maxSteps: 6,
              format: options.format,
              replan: true,
              budget: 0.1,
            })
          }
        }
      },
    )
}
