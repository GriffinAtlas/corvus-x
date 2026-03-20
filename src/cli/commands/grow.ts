import { Command } from 'commander'
import ora from 'ora'
import { t, divider, banner } from '../theme.js'
import { initDeps, showCostAndExit } from '../run-command.js'
import { renderHooks, renderDraft, renderTiming } from '../output.js'
import { buildHooksSnapshot } from '../../core/builders/hooks.js'
import { buildDraftSnapshot } from '../../core/builders/draft.js'
import { buildTimingSnapshot } from '../../core/builders/timing.js'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'

export function registerGrowCommand(program: Command): void {
  program
    .command('grow <topic...>')
    .description('Daily growth workflow — find hooks, draft a post, get timing advice')
    .option('--thread', 'draft as a thread instead of single post')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        topicParts: string[],
        options: { thread?: boolean; cost?: boolean },
      ) => {
        const topic = topicParts.join(' ')

        if (options.cost) {
          await showCostAndExit()
          return
        }

        const deps = initDeps()
        let totalCost = 0

        console.log(banner('grow', topic))
        console.log(`  ${divider()}`)
        console.log()

        const hookSpinner = ora({ text: 'finding conversations to reply to...', indent: 2 }).start()
        try {
          const hooks = await buildHooksSnapshot(deps, topic, 30)
          hookSpinner.stop()
          totalCost += hooks.cost

          if (hooks.data.opportunities.length > 0) {
            console.log(`  ${t.heading('Reply Opportunities')}`)
            console.log(renderHooks(hooks.data))
          } else {
            console.log(`  ${t.muted('No reply opportunities found right now.')}`)
          }
          console.log()
        } catch (err) {
          hookSpinner.stop()
          console.log(`  ${t.warning('Hooks skipped:')} ${err instanceof Error ? err.message : String(err)}`)
          console.log()
        }

        const draftSpinner = ora({ text: 'drafting a post...', indent: 2 }).start()
        try {
          const draft = await buildDraftSnapshot(deps, topic, { thread: options.thread })
          draftSpinner.stop()
          totalCost += draft.cost

          console.log(`  ${t.heading('Your Draft')}`)
          console.log(renderDraft(draft.data))
          console.log()
        } catch (err) {
          draftSpinner.stop()
          console.log(`  ${t.warning('Draft skipped:')} ${err instanceof Error ? err.message : String(err)}`)
          console.log()
        }

        const handle = new AuthManager(ConfigManager.defaultDir()).getXHandle()
        const timingSpinner = ora({ text: 'analyzing best posting times...', indent: 2 }).start()
        try {
          const timing = await buildTimingSnapshot(deps, {
            handle: handle ?? undefined,
            topic,
          })
          timingSpinner.stop()
          totalCost += timing.cost

          if (timing.data.peakWindows.length > 0) {
            console.log(`  ${t.heading('When to Post')}`)
            console.log(renderTiming(timing.data))
          }
        } catch (err) {
          timingSpinner.stop()
          console.log(`  ${t.warning('Timing skipped:')} ${err instanceof Error ? err.message : String(err)}`)
        }

        console.log()
        console.log(`  ${divider()}`)
        console.log(`  ${t.muted(`3 steps · $${totalCost.toFixed(4)}`)}`)
        console.log()
      },
    )
}
