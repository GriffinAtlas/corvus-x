# Contributing to Corvus

Thanks for your interest in contributing. This document covers the workflow and conventions.

## Getting Started

```bash
git clone https://github.com/GriffinAtlas/corvus-x.git
cd corvus-x
npm install
```

## Development

```bash
npm run dev -- ask "test question"    # run CLI without building
npm run build                         # compile TypeScript to dist/
npm test                              # run all tests (vitest)
npm run lint                          # eslint
npm run format                        # prettier
```

Always smoke-test after building: `npm run build && node dist/bin/corvus.js --version`

## Project Structure

```
bin/
  corvus.ts              # CLI entrypoint — registers commands, launches fullscreen TUI
  corvus-mcp.ts          # standalone MCP server entrypoint (stdio)
src/
  cli/commands/           # one file per CLI command (16 commands)
  cli/run-command.ts      # shared command runner (auth, spinner, errors)
  cli/output.ts           # output renderers with visual bars, labeled dividers
  cli/theme.ts            # color palette, gradient, sparklines, percent bars
  core/
    agent.ts              # AgentPlanner, AgentExecutor, AgentSynthesizer
    grok-adapter.ts       # Grok Responses API wrapper (OpenAI SDK → xAI)
    x-adapter.ts          # X API v2 (tweets, users, search) with ID validation
    builders/             # 8 builders (scan, pulse, trace, profile, hooks, draft, review, timing)
    voice.ts              # VoiceProfileManager — extract/store writing style
    cache.ts, differ.ts, metrics.ts, schemas.ts, snapshots.ts
  tui/                    # Ink 6 + React 19 + fullscreen-ink interactive terminal
    app.tsx               # root component with fullscreen layout
    components/           # UI components (compact-header, chat-viewport, input-bar, etc.)
    hooks/                # useCommand, useSession
    router.ts             # input parser
  mcp/server.ts           # MCP server — 5 tools via McpServer
  infra/                  # auth (credentials + xHandle) and config management
  index.ts                # public API surface for library consumers
tests/                    # mirrors src/ — 916 tests across 50 files
```

## Conventions

### Code Style

- TypeScript with strict mode, ES2022 target, ESM (`"type": "module"`)
- No semicolons, single quotes, trailing commas (see `.prettierrc`)
- `printWidth: 100`
- All chalk/color calls go through `src/cli/theme.ts`

### Commit Messages

Use conventional commit prefixes with an em dash:

```
feat: feature name — short description
fix: bug area — what was fixed
test: what was tested — context
chore: task — description
docs: what changed — context
```

### Testing

- Every new feature or fix needs tests
- Tests use Vitest
- Mock external APIs (OpenAI Responses API, fetch) — never make real API calls in tests
- Test files mirror source structure: `src/core/cache.ts` -> `tests/core/cache.test.ts`
- TUI component tests use `ink-testing-library`
- MCP tests use the SDK's `Client` + `InMemoryTransport`
- Run the full suite before submitting: `npm test`

### Adding a New Command

1. Create `src/cli/commands/<name>.ts` with a `register<Name>Command(program)` export
2. Use `runCommand()` or `runStructuredCommand()` from `run-command.ts`
3. If structured, create a builder in `src/core/builders/<name>.ts`
4. Add the snapshot type to `src/core/schemas.ts` and update the `Snapshot` union
5. Add a renderer in `src/cli/output.ts`
6. Register in `bin/corvus.ts`
7. Add TUI routing in `src/tui/router.ts` and `src/tui/hooks/use-command.ts`
8. Add tests in `tests/cli/commands/<name>.test.ts` and `tests/core/builders/<name>.test.ts`
9. Document in `README.md`

### API Layer

- Grok calls go through `src/core/grok-adapter.ts` using `client.responses.create()`
- Tools are `{ type: 'x_search' }` and `{ type: 'web_search' }` (Responses API)
- Structured output uses `text.format` with extracted `zodResponseFormat()` fields
- X API calls go through `src/core/x-adapter.ts` with ID validation (`/^\d{1,20}$/`)

## Pull Requests

1. Fork the repo and create a branch from `master`
2. Make your changes with tests
3. Run `npm test` and `npm run lint` — both must pass
4. Open a PR with a clear title and description
5. Keep PRs focused — one feature or fix per PR

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
