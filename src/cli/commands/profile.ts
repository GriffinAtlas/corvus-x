import { Command } from 'commander'
import { runStructuredCommand } from '../run-command.js'
import { renderProfile } from '../output.js'
import { buildProfileSnapshot, resolveIsSelf } from '../../core/builders/profile.js'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import { PROFILE_MATCH_KEYS } from '../../core/schemas.js'
import type { ProfileSnapshot } from '../../core/schemas.js'
import type { OutputFormat } from '../output.js'

export function registerProfileCommand(program: Command): void {
  program
    .command('profile <username>')
    .description('Analyze any account\'s content strategy')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --posts <count>', 'number of recent posts to analyze', '50')
    .option('--cost', 'show estimated cost before executing')
    .addHelpText('after', `
Examples:
  $ corvus profile @elonmusk
  $ corvus profile @self -n 100 -f md`)
    .action(
      async (
        username: string,
        options: { format: OutputFormat; posts: string; cost?: boolean },
      ) => {
        let handle = username.replace(/^@/, '')
        const auth = new AuthManager(ConfigManager.defaultDir())
        const storedHandle = auth.getXHandle()
        if (handle.toLowerCase() === 'self') {
          if (!storedHandle) {
            console.error('No X handle configured. Run: corvus auth setup')
            process.exit(1)
          }
          handle = storedHandle
        }
        const postCount = Math.min(parseInt(options.posts, 10) || 50, 200)
        const isSelf = resolveIsSelf(handle, storedHandle)

        await runStructuredCommand<ProfileSnapshot>({
          command: 'profile',
          topic: `@${handle}`,
          format: options.format,
          cost: options.cost,
          spinnerText: `profile · @${handle}${isSelf ? ' (self)' : ''}`,
          matchKeys: PROFILE_MATCH_KEYS,
          renderSnapshot: renderProfile,
          buildSnapshot: (deps) => buildProfileSnapshot(deps, handle, postCount, isSelf),
        })
      },
    )
}
