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
npm run test:watch                    # run tests in watch mode
npm run lint                          # eslint
npm run format                        # prettier
```

## Project Structure

```
src/
  cli/commands/     # one file per CLI command
  cli/run-command.ts # shared command runner (auth, cache, spinner, errors)
  cli/output.ts     # output formatters (table, json, csv, md)
  cli/repl.ts       # interactive REPL
  core/             # grok adapter, x adapter, cache, types
  infra/            # auth and config management
tests/              # mirrors src/ — every module has a corresponding test file
```

## Conventions

### Code Style

- TypeScript with strict mode
- ESM modules (`import`/`export`, `.js` extensions in imports)
- No semicolons, single quotes, trailing commas (see `.prettierrc`)
- `printWidth: 100`

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
- Run the full suite before submitting: `npm test`

### Adding a New Command

1. Create `src/cli/commands/<name>.ts` with a `register<Name>Command(program)` export
2. Use `runCommand()` from `run-command.ts` for auth, caching, spinner, and error handling
3. Register it in `bin/corvus.ts`
4. Add tests in `tests/cli/commands/<name>.test.ts`
5. Document it in `README.md`

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes with tests
3. Run `npm test` and `npm run lint` — both must pass
4. Open a PR with a clear title and description
5. Keep PRs focused — one feature or fix per PR

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
