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
  corvus.ts              # CLI entrypoint — registers commands, launches TUI if no args
  corvus-mcp.ts          # standalone MCP server entrypoint (stdio)
src/
  cli/commands/           # one file per CLI command (agent, ask, scan, pulse, etc.)
  cli/run-command.ts      # shared command runner (auth, cache, spinner, errors)
  cli/output.ts           # output formatters (table, json, csv, md)
  core/
    agent.ts              # AgentPlanner, AgentExecutor, AgentSynthesizer
    grok-adapter.ts       # Grok API wrapper (OpenAI SDK → xAI)
    x-adapter.ts          # X API v2 (tweets, users, search)
    builders/             # 6 build functions (scan, pulse, trace, gather, read, scope)
    cache.ts, differ.ts, metrics.ts, schemas.ts, snapshots.ts
  tui/                    # Ink 6 + React 19 interactive terminal
    app.tsx               # root component
    components/           # UI components (chat-viewport, input-bar, result-card, etc.)
    hooks/                # useCommand, useSession
    router.ts             # input parser
  mcp/server.ts           # MCP server — 7 tools via McpServer
  infra/                  # auth and config management
  index.ts                # public API surface for library consumers
tests/                    # mirrors src/ — every module has a corresponding test file
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
- Mock external APIs (OpenAI, fetch) — never make real API calls in tests
- Test files mirror source structure: `src/core/cache.ts` -> `tests/core/cache.test.ts`
- TUI component tests use `ink-testing-library`
- MCP tests use the SDK's `Client` + `InMemoryTransport`
- Run the full suite before submitting: `npm test`

### Adding a New Command

1. Create `src/cli/commands/<name>.ts` with a `register<Name>Command(program)` export
2. Use `runCommand()` or `runStructuredCommand()` from `run-command.ts`
3. Register it in `bin/corvus.ts`
4. Add tests in `tests/cli/commands/<name>.test.ts`
5. For structured commands, add a builder in `src/core/builders/`
6. Document it in `README.md`

## Pull Requests

1. Fork the repo and create a branch from `master`
2. Make your changes with tests
3. Run `npm test` and `npm run lint` — both must pass
4. Open a PR with a clear title and description
5. Keep PRs focused — one feature or fix per PR

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
