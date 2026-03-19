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
    .description('Analyze content strategy — yours or anyone\'s')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('-n, --posts <count>', 'number of recent posts to analyze', '50')
    .option('--cost', 'show estimated cost before executing')
    .action(
      async (
        username: string,
        options: { format: OutputFormat; posts: string; cost?: boolean },
      ) => {
        const handle = username.replace(/^@/, '')
        const postCount = Math.min(parseInt(options.posts, 10) || 50, 200)
        const isSelf = resolveIsSelf(handle, new AuthManager(ConfigManager.defaultDir()).getXHandle())

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
