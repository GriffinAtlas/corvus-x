import { Command } from 'commander'
import readline from 'readline'
import { t, revealCrow } from '../theme.js'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import { GrokAdapter, MODEL_PRICING, DEFAULT_MODEL } from '../../core/grok-adapter.js'
import { XAdapter } from '../../core/x-adapter.js'
import { SnapshotStore } from '../../core/snapshots.js'
import { diffSnapshots } from '../../core/differ.js'
import { formatDiffLines } from '../../core/differ.js'
import { AGENT_MATCH_KEYS } from '../../core/schemas.js'
import { AgentPlanner, AgentExecutor, AgentSynthesizer } from '../../core/agent.js'
import { StepProgress } from '../progress.js'
import { renderAgentBrief, renderAgentBriefMd } from '../output.js'
import type { AgentPlan, AgentStep } from '../../core/agent.js'
import type { AgentBrief } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'
import type { CommandDeps } from '../run-command.js'

function stepLabel(step: AgentStep): string {
  const target = step.args.topic ?? step.args.username ?? step.args.tweetId ?? ''
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

    const addMatch = input.match(/^add\s+(scan|pulse|trace|gather|read|scope)\s+(.+)$/)
    if (addMatch) {
      const command = addMatch[1] as AgentStep['command']
      const target = addMatch[2]
      const args: AgentStep['args'] = {}
      if (command === 'read') args.tweetId = target
      else if (command === 'scope') args.username = target.replace(/^@/, '')
      else args.topic = target
      steps.push({ command, args, reasoning: 'user-added' })
      console.log(t.muted(`  added ${command} · ${target}`))
      continue
    }

    console.log(t.muted('  unknown command'))
  }

  return { ...plan, steps }
}

export function registerAgentCommand(program: Command): void {
  program
    .command('agent <question...>')
    .description('Run an autonomous intelligence investigation')
    .option('-i, --interactive', 'checkpoint mode with plan approval')
    .option('-n, --max-steps <n>', 'maximum steps (2-12)', '8')
    .option('-f, --format <type>', 'output format: table, json, md', 'table')
    .option('--no-replan', 'disable adaptive replanning')
    .option('--budget <amount>', 'cost cap in USD', '0.10')
    .option('--cost', 'show pricing info and exit')
    .action(
      async (
        questionParts: string[],
        options: {
          interactive?: boolean
          maxSteps: string
          format: OutputFormat
          replan: boolean
          budget: string
          cost?: boolean
        },
      ) => {
        const question = questionParts.join(' ')
        const maxSteps = Math.max(2, Math.min(12, parseInt(options.maxSteps, 10) || 8))
        const budget = Math.max(0.01, parseFloat(options.budget) || 0.1)

        const auth = new AuthManager(ConfigManager.defaultDir())
        const grokKey = auth.getGrokKey()
        if (!grokKey) {
          console.log(t.error('\n  No Grok API key found. Run: corvus auth setup\n'))
          process.exit(1)
        }

        if (options.cost) {
          const pricing = MODEL_PRICING[DEFAULT_MODEL]
          const perStep = (1000 * pricing.input + 2048 * pricing.output) / 1_000_000
          console.log(t.muted(`\n  Model: ${DEFAULT_MODEL}`))
          console.log(t.muted(`  Estimated cost per step: $${perStep.toFixed(6)}`))
          console.log(t.muted(`  Max steps: ${maxSteps}`))
          console.log(t.muted(`  Budget cap: $${budget.toFixed(2)}`))
          console.log(
            t.muted(
              `  Estimated max total: $${(perStep * (maxSteps + 2)).toFixed(6)} (includes plan + synthesis)`,
            ),
          )
          console.log()
          return
        }

        const xToken = auth.getXToken()
        const deps: CommandDeps = {
          grok: new GrokAdapter(grokKey),
          x: xToken ? new XAdapter(xToken) : null,
        }

        console.log('')
        await revealCrow()
        console.log('')

        console.log(t.muted(`  planning: ${question}`))
        const planner = new AgentPlanner(deps.grok)
        let plan: AgentPlan
        let planCost: number

        try {
          const planStart = Date.now()
          const planResult = await planner.plan(question)
          plan = planResult.plan
          planCost = planResult.costUsd
          const planDuration = ((Date.now() - planStart) / 1000).toFixed(1)
          console.log(t.muted(`  plan: ${plan.steps.length} steps (${planDuration}s)\n`))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.log(t.error(`\n  Planning failed: ${msg}\n`))
          process.exit(1)
        }

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
          maxSteps,
          budget,
          replan: options.replan,
          onStepStart: (index, _step) => {
            progress.start(index)
          },
          onStepComplete: (index, _step, durationMs) => {
            progress.complete(index, durationMs)
          },
          onStepFail: (index, _step) => {
            progress.fail(index)
          },
          onStepSkip: (index, _step, reason) => {
            progress.skip(index, reason)
          },
          onReplan: (newSteps) => {
            for (const s of newSteps) {
              progress.addStep(stepLabel(s), 'replan')
            }
          },
          onLeadFound: (label, tag) => {
            progress.addStep(label, tag)
          },
        })

        const sigintHandler = () => {
          aborted = true
          executor.abort()
        }
        process.on('SIGINT', sigintHandler)

        progress.render()
        const context = await executor.execute(planCost)

        progress.cleanup()
        process.removeListener('SIGINT', sigintHandler)

        if (aborted || context.results.length === 0) {
          console.log('')
          console.log(
            t.muted(
              `\n  ${context.results.length} steps completed · $${context.totalCost.toFixed(4)}\n`,
            ),
          )
          return
        }

        if (options.interactive && context.results.length > 0) {
          const answer = await prompt('\n  Synthesize brief? [Y/n] ')
          if (answer === 'n' || answer === 'no') {
            console.log(
              t.muted(
                `\n  ${context.results.length} steps completed · $${context.totalCost.toFixed(4)}\n`,
              ),
            )
            return
          }
        }

        console.log(t.muted('\n  synthesizing...'))
        const synthesizer = new AgentSynthesizer(deps.grok)
        let brief: AgentBrief

        try {
          brief = await synthesizer.synthesize(context)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.log(t.error(`\n  Synthesis failed: ${msg}\n`))
          console.log(
            t.muted(
              `  ${context.results.length} steps completed · $${context.totalCost.toFixed(4)}\n`,
            ),
          )
          return
        }

        const store = new SnapshotStore(ConfigManager.defaultDir())
        const previous = store.loadLatest<AgentBrief>('agent', question)
        store.save('agent', question, brief, JSON.stringify(context), context.totalCost)

        const totalDuration = Date.now() - agentStartTime
        const allTweets = context.results.reduce((sum, r) => sum + r.tweets.length, 0)
        const allAuthors = new Set(
          context.results.flatMap((r) => r.tweets.map((tw) => tw.authorId)),
        ).size

        const renderOpts = {
          stepCount: context.results.length,
          durationMs: totalDuration,
          tweetCount: allTweets,
          accountCount: allAuthors,
          cost: context.totalCost,
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
          default: {
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
        }
        console.log('')
      },
    )
}
