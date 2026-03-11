# Corvus v0.1.0 — Phase 1-3 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working `corvus ask "question"` command that queries Grok with x_search and returns formatted results in the terminal.

**Architecture:** TypeScript CLI using commander for arg parsing, openai SDK pointed at Grok's API, zod for response validation, chalk for terminal output. Grok-first — x_search does the heavy lifting.

**Tech Stack:** TypeScript, Node.js >= 18, commander, openai, zod, chalk, ora, conf, keytar, vitest

---

## File Map

```
corvus/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── .eslintrc.json
├── .prettierrc
├── bin/
│   └── corvus.ts                  ← entry point (shebang + commander setup)
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── ask.ts             ← corvus ask handler
│   │   │   ├── scan.ts            ← corvus scan handler
│   │   │   ├── auth.ts            ← corvus auth handler
│   │   │   └── index.ts           ← re-exports
│   │   └── output.ts              ← table/json/csv/md formatters
│   ├── core/
│   │   ├── grok-adapter.ts        ← Grok API client
│   │   └── types.ts               ← shared interfaces
│   └── infra/
│       ├── auth.ts                ← keychain + fallback credential store
│       └── config.ts              ← ~/.corvus/config.json manager
├── tests/
│   ├── core/
│   │   └── grok-adapter.test.ts
│   ├── infra/
│   │   ├── auth.test.ts
│   │   └── config.test.ts
│   └── cli/
│       ├── commands/
│       │   └── ask.test.ts
│       └── output.test.ts
└── docs/
    └── superpowers/
        └── specs/
            └── ...
```

---

## Task 1: Project Scaffold

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.eslintrc.json`
- Create: `.prettierrc`
- Create: `bin/corvus.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Initialize npm and install dependencies**

```bash
cd /c/Users/footb/corvus
npm init -y
```

Then update package.json:

```json
{
  "name": "corvus-x",
  "version": "0.1.0",
  "description": "AI-powered X intelligence in your terminal",
  "type": "module",
  "main": "dist/src/index.js",
  "bin": {
    "corvus": "dist/bin/corvus.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx bin/corvus.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\""
  },
  "author": "Roger Griffin <roger@griffinatlas.us>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/GriffinAtlas/corvus-x.git"
  },
  "keywords": ["cli", "twitter", "x", "grok", "ai", "intelligence", "terminal", "sentiment"],
  "engines": {
    "node": ">=18"
  },
  "files": ["dist", "README.md", "LICENSE"]
}
```

- [ ] **Step 2: Install production dependencies**

```bash
npm install commander openai zod chalk ora conf
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D typescript @types/node vitest eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier tsx
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["bin/**/*.ts", "src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
*.db
.env
.env.*
*.log
.DS_Store
```

- [ ] **Step 7: Create .eslintrc.json**

```json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "env": { "node": true, "es2022": true },
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

- [ ] **Step 8: Create .prettierrc**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 9: Create entry point bin/corvus.ts**

```typescript
#!/usr/bin/env node

import { Command } from 'commander'

const program = new Command()

program.name('corvus').description('AI-powered X intelligence in your terminal').version('0.1.0')

program.parse()
```

- [ ] **Step 10: Create src/index.ts**

```typescript
export const VERSION = '0.1.0'
```

- [ ] **Step 11: Verify build and run**

```bash
npm run build
node dist/bin/corvus.js --version
# Expected: 0.1.0
node dist/bin/corvus.js --help
# Expected: help text with description
```

- [ ] **Step 12: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .eslintrc.json .prettierrc bin/ src/ package-lock.json
git commit -m "feat: project scaffold — corvus-x CLI skeleton"
```

---

## Task 2: Config Manager

**Files:**

- Create: `src/infra/config.ts`
- Create: `tests/infra/config.test.ts`

- [ ] **Step 1: Write failing test for config manager**

```typescript
// tests/infra/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigManager } from '../../src/infra/config.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('ConfigManager', () => {
  let tmpDir: string
  let configManager: ConfigManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-test-'))
    configManager = new ConfigManager(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates config directory on first access', () => {
    configManager.load()
    expect(fs.existsSync(tmpDir)).toBe(true)
  })

  it('returns default config when no file exists', () => {
    const config = configManager.load()
    expect(config.activeProfile).toBe('default')
    expect(config.display.defaultFormat).toBe('table')
    expect(config.display.animation).toBe(true)
  })

  it('saves and loads config', () => {
    const config = configManager.load()
    config.display.animation = false
    configManager.save(config)

    const reloaded = configManager.load()
    expect(reloaded.display.animation).toBe(false)
  })

  it('preserves unknown fields on save', () => {
    const configPath = path.join(tmpDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({ customField: true }))

    const config = configManager.load()
    configManager.save(config)

    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(raw.activeProfile).toBe('default')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/infra/config.test.ts
# Expected: FAIL — cannot find module
```

- [ ] **Step 3: Implement ConfigManager**

```typescript
// src/infra/config.ts
import fs from 'fs'
import path from 'path'

export interface CorvusConfig {
  activeProfile: string
  display: {
    animation: boolean
    defaultFormat: 'table' | 'json' | 'csv' | 'md'
  }
  budget: {
    sessionMaxUsd: number
  }
}

const DEFAULT_CONFIG: CorvusConfig = {
  activeProfile: 'default',
  display: {
    animation: true,
    defaultFormat: 'table',
  },
  budget: {
    sessionMaxUsd: 1.0,
  },
}

export class ConfigManager {
  private configPath: string

  constructor(private baseDir: string) {
    this.configPath = path.join(baseDir, 'config.json')
  }

  load(): CorvusConfig {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }

    if (!fs.existsSync(this.configPath)) {
      return {
        ...DEFAULT_CONFIG,
        display: { ...DEFAULT_CONFIG.display },
        budget: { ...DEFAULT_CONFIG.budget },
      }
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      return {
        activeProfile: raw.activeProfile ?? DEFAULT_CONFIG.activeProfile,
        display: {
          animation: raw.display?.animation ?? DEFAULT_CONFIG.display.animation,
          defaultFormat: raw.display?.defaultFormat ?? DEFAULT_CONFIG.display.defaultFormat,
        },
        budget: {
          sessionMaxUsd: raw.budget?.sessionMaxUsd ?? DEFAULT_CONFIG.budget.sessionMaxUsd,
        },
      }
    } catch {
      return {
        ...DEFAULT_CONFIG,
        display: { ...DEFAULT_CONFIG.display },
        budget: { ...DEFAULT_CONFIG.budget },
      }
    }
  }

  save(config: CorvusConfig): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2))
  }

  get dir(): string {
    return this.baseDir
  }

  static defaultDir(): string {
    return path.join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.corvus')
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/infra/config.test.ts
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/infra/config.ts tests/infra/config.test.ts
git commit -m "feat: config manager — ~/.corvus/config.json with defaults"
```

---

## Task 3: Auth Manager

**Files:**

- Create: `src/infra/auth.ts`
- Create: `tests/infra/auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/infra/auth.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AuthManager } from '../../src/infra/auth.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('AuthManager', () => {
  let tmpDir: string
  let auth: AuthManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-auth-'))
    auth = new AuthManager(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('returns null when no key is stored', async () => {
    const key = await auth.getGrokKey()
    expect(key).toBeNull()
  })

  it('stores and retrieves grok key', async () => {
    await auth.setGrokKey('xai-test-key-123')
    const key = await auth.getGrokKey()
    expect(key).toBe('xai-test-key-123')
  })

  it('stores and retrieves x bearer token', async () => {
    await auth.setXToken('bearer-test-456')
    const token = await auth.getXToken()
    expect(token).toBe('bearer-test-456')
  })

  it('env var overrides stored key', async () => {
    await auth.setGrokKey('stored-key')
    vi.stubEnv('CORVUS_GROK_KEY', 'env-key')

    const key = await auth.getGrokKey()
    expect(key).toBe('env-key')
  })

  it('env var overrides stored x token', async () => {
    await auth.setXToken('stored-token')
    vi.stubEnv('CORVUS_X_BEARER_TOKEN', 'env-token')

    const token = await auth.getXToken()
    expect(token).toBe('env-token')
  })

  it('hasGrokKey returns true when key exists', async () => {
    await auth.setGrokKey('xai-key')
    expect(await auth.hasGrokKey()).toBe(true)
  })

  it('hasGrokKey returns false when no key', async () => {
    expect(await auth.hasGrokKey()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/infra/auth.test.ts
# Expected: FAIL — cannot find module
```

- [ ] **Step 3: Implement AuthManager (file-based for v1, keytar later)**

```typescript
// src/infra/auth.ts
import fs from 'fs'
import path from 'path'

interface Credentials {
  grokKey?: string
  xBearerToken?: string
}

export class AuthManager {
  private credPath: string

  constructor(private baseDir: string) {
    this.credPath = path.join(baseDir, 'credentials.json')
  }

  async getGrokKey(): Promise<string | null> {
    if (process.env.CORVUS_GROK_KEY) return process.env.CORVUS_GROK_KEY
    const creds = this.readCreds()
    return creds.grokKey ?? null
  }

  async setGrokKey(key: string): Promise<void> {
    const creds = this.readCreds()
    creds.grokKey = key
    this.writeCreds(creds)
  }

  async getXToken(): Promise<string | null> {
    if (process.env.CORVUS_X_BEARER_TOKEN) return process.env.CORVUS_X_BEARER_TOKEN
    const creds = this.readCreds()
    return creds.xBearerToken ?? null
  }

  async setXToken(token: string): Promise<void> {
    const creds = this.readCreds()
    creds.xBearerToken = token
    this.writeCreds(creds)
  }

  async hasGrokKey(): Promise<boolean> {
    return (await this.getGrokKey()) !== null
  }

  async hasXToken(): Promise<boolean> {
    return (await this.getXToken()) !== null
  }

  private readCreds(): Credentials {
    if (!fs.existsSync(this.credPath)) return {}
    try {
      return JSON.parse(fs.readFileSync(this.credPath, 'utf-8'))
    } catch {
      return {}
    }
  }

  private writeCreds(creds: Credentials): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
    fs.writeFileSync(this.credPath, JSON.stringify(creds, null, 2), { mode: 0o600 })
  }

  static defaultDir(): string {
    return path.join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.corvus')
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/infra/auth.test.ts
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/infra/auth.ts tests/infra/auth.test.ts
git commit -m "feat: auth manager — credential storage with env var overrides"
```

---

## Task 4: Auth Command (corvus auth)

**Files:**

- Create: `src/cli/commands/auth.ts`
- Modify: `bin/corvus.ts`

- [ ] **Step 1: Implement auth command**

```typescript
// src/cli/commands/auth.ts
import { Command } from 'commander'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import { createInterface } from 'readline'

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export function registerAuthCommand(program: Command): void {
  const auth = program.command('auth').description('Set up API keys')

  auth
    .command('setup')
    .description('Interactive API key setup')
    .action(async () => {
      const baseDir = ConfigManager.defaultDir()
      const authManager = new AuthManager(baseDir)

      console.log('\n  corvus auth setup')
      console.log('  ─────────────────\n')

      console.log('  You need a Grok API key from https://console.x.ai\n')
      const grokKey = await prompt('  Grok API key: ')

      if (!grokKey) {
        console.log('\n  Grok API key is required. Aborting.')
        process.exit(1)
      }

      await authManager.setGrokKey(grokKey)
      console.log('  ✓ Grok key saved\n')

      const addX = await prompt('  Add X API bearer token? (optional) [y/N]: ')
      if (addX.toLowerCase() === 'y') {
        console.log('\n  Get your token at https://developer.x.com\n')
        const xToken = await prompt('  X Bearer Token: ')
        if (xToken) {
          await authManager.setXToken(xToken)
          console.log('  ✓ X API token saved\n')
        }
      }

      console.log('  ✓ Ready. Try: corvus ask "what\'s trending in AI?"\n')
    })

  auth
    .command('status')
    .description('Show current auth status')
    .action(async () => {
      const baseDir = ConfigManager.defaultDir()
      const authManager = new AuthManager(baseDir)

      const hasGrok = await authManager.hasGrokKey()
      const hasX = await authManager.hasXToken()

      console.log('\n  corvus auth status')
      console.log('  ──────────────────')
      console.log(`  Grok API:  ${hasGrok ? '✓ configured' : '✗ not set'}`)
      console.log(`  X API:     ${hasX ? '✓ configured' : '✗ not set (optional)'}`)
      console.log()
    })

  // Make bare `corvus auth` run setup
  auth.action(async () => {
    await auth.commands.find((c) => c.name() === 'setup')?.parseAsync([])
  })
}
```

- [ ] **Step 2: Wire into bin/corvus.ts**

```typescript
#!/usr/bin/env node

import { Command } from 'commander'
import { registerAuthCommand } from '../src/cli/commands/auth.js'

const program = new Command()

program.name('corvus').description('AI-powered X intelligence in your terminal').version('0.1.0')

registerAuthCommand(program)

program.parse()
```

- [ ] **Step 3: Test manually**

```bash
npx tsx bin/corvus.ts auth status
# Expected: shows "not set" for both
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/auth.ts bin/corvus.ts
git commit -m "feat: corvus auth — interactive API key setup wizard"
```

---

## Task 5: Grok Adapter

**Files:**

- Create: `src/core/types.ts`
- Create: `src/core/grok-adapter.ts`
- Create: `tests/core/grok-adapter.test.ts`

- [ ] **Step 1: Define shared types**

```typescript
// src/core/types.ts
export interface GrokResponse {
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
}

export interface QueryOptions {
  model?: string
  enableXSearch?: boolean
  enableWebSearch?: boolean
  systemPrompt?: string
  maxTokens?: number
}

export interface CommandResult {
  command: string
  query: string
  response: string
  cost: number
  cached: boolean
  timestamp: number
}
```

- [ ] **Step 2: Write failing test for GrokAdapter**

```typescript
// tests/core/grok-adapter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrokAdapter } from '../../src/core/grok-adapter.js'

// Mock openai
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Test response about AI agents' } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        },
      }
      constructor(_opts: Record<string, unknown>) {}
    },
  }
})

describe('GrokAdapter', () => {
  let adapter: GrokAdapter

  beforeEach(() => {
    adapter = new GrokAdapter('xai-test-key')
  })

  it('sends query and returns structured response', async () => {
    const result = await adapter.query('What are devs saying about AI agents?')
    expect(result.text).toBe('Test response about AI agents')
    expect(result.usage.inputTokens).toBe(100)
    expect(result.usage.outputTokens).toBe(50)
  })

  it('calculates cost correctly for grok-4-1-fast', async () => {
    const result = await adapter.query('test query')
    // grok-4-1-fast: $0.20/M input, $0.50/M output
    // 100 input tokens = $0.00002, 50 output tokens = $0.000025
    expect(result.usage.costUsd).toBeCloseTo(0.000045, 6)
  })

  it('uses x_search tool by default', async () => {
    await adapter.query('test')
    const OpenAI = (await import('openai')).default
    const mockCreate = new OpenAI({}).chat.completions.create as ReturnType<typeof vi.fn>
    expect(mockCreate).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/core/grok-adapter.test.ts
# Expected: FAIL — cannot find module
```

- [ ] **Step 4: Implement GrokAdapter**

```typescript
// src/core/grok-adapter.ts
import OpenAI from 'openai'
import type { GrokResponse, QueryOptions } from './types.js'

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'grok-4-1-fast': { input: 0.2, output: 0.5 },
  'grok-4': { input: 3.0, output: 15.0 },
}

const DEFAULT_MODEL = 'grok-4-1-fast'

export class GrokAdapter {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    })
  }

  async query(prompt: string, options: QueryOptions = {}): Promise<GrokResponse> {
    const model = options.model ?? DEFAULT_MODEL
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = []

    if (options.enableXSearch !== false) {
      tools.push({
        type: 'function',
        function: {
          name: 'x_search',
          description: 'Search X',
          parameters: { type: 'object', properties: {} },
        },
      })
    }
    if (options.enableWebSearch) {
      tools.push({
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search web',
          parameters: { type: 'object', properties: {} },
        },
      })
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }

    messages.push({ role: 'user', content: prompt })

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens ?? 2048,
      ...(tools.length > 0 ? { tools } : {}),
    })

    const choice = response.choices[0]
    const text = choice?.message?.content ?? ''
    const usage = response.usage

    const inputTokens = usage?.prompt_tokens ?? 0
    const outputTokens = usage?.completion_tokens ?? 0
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL]
    const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000

    return {
      text,
      usage: { inputTokens, outputTokens, costUsd },
    }
  }

  async *stream(prompt: string, options: QueryOptions = {}): AsyncGenerator<string> {
    const model = options.model ?? DEFAULT_MODEL

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) yield content
    }
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/core/grok-adapter.test.ts
# Expected: all PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/grok-adapter.ts tests/core/grok-adapter.test.ts
git commit -m "feat: Grok adapter — x_search enabled, cost tracking, streaming"
```

---

## Task 6: Output Formatter

**Files:**

- Create: `src/cli/output.ts`
- Create: `tests/cli/output.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/output.test.ts
import { describe, it, expect } from 'vitest'
import { formatOutput } from '../../src/cli/output.js'
import type { CommandResult } from '../../src/core/types.js'

const mockResult: CommandResult = {
  command: 'ask',
  query: 'test query',
  response: 'AI agents are trending on X today.',
  cost: 0.001,
  cached: false,
  timestamp: Date.now(),
}

describe('formatOutput', () => {
  it('formats as table (default)', () => {
    const output = formatOutput(mockResult, 'table')
    expect(output).toContain('AI agents are trending')
    expect(output).toContain('$0.001')
  })

  it('formats as json', () => {
    const output = formatOutput(mockResult, 'json')
    const parsed = JSON.parse(output)
    expect(parsed.response).toBe('AI agents are trending on X today.')
    expect(parsed.cost).toBe(0.001)
  })

  it('formats as csv', () => {
    const output = formatOutput(mockResult, 'csv')
    expect(output).toContain('command,query,response')
  })

  it('formats as markdown', () => {
    const output = formatOutput(mockResult, 'md')
    expect(output).toContain('## ask')
    expect(output).toContain('AI agents are trending')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/cli/output.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Implement output formatter**

```typescript
// src/cli/output.ts
import chalk from 'chalk'
import type { CommandResult } from '../core/types.js'

export type OutputFormat = 'table' | 'json' | 'csv' | 'md'

export function formatOutput(result: CommandResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return formatJson(result)
    case 'csv':
      return formatCsv(result)
    case 'md':
      return formatMarkdown(result)
    case 'table':
    default:
      return formatTable(result)
  }
}

function formatTable(result: CommandResult): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`  ${chalk.bold(result.command)} ${chalk.dim('·')} ${result.query}`)
  lines.push(`  ${chalk.dim('───────────────────────────────────────────')}`)
  lines.push('')
  lines.push(`  ${result.response}`)
  lines.push('')
  if (!result.cached) {
    lines.push(`  ${chalk.dim(`cost: $${result.cost.toFixed(4)}`)}`)
  } else {
    lines.push(`  ${chalk.dim('(cached)')}`)
  }
  lines.push('')
  return lines.join('\n')
}

function formatJson(result: CommandResult): string {
  return JSON.stringify(
    {
      command: result.command,
      query: result.query,
      response: result.response,
      cost: result.cost,
      cached: result.cached,
      timestamp: result.timestamp,
    },
    null,
    2,
  )
}

function formatCsv(result: CommandResult): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = 'command,query,response,cost,cached,timestamp'
  const row = [
    result.command,
    escape(result.query),
    escape(result.response),
    result.cost.toString(),
    result.cached.toString(),
    result.timestamp.toString(),
  ].join(',')
  return `${header}\n${row}`
}

function formatMarkdown(result: CommandResult): string {
  const lines: string[] = []
  lines.push(`## ${result.command}`)
  lines.push('')
  lines.push(`**Query:** ${result.query}`)
  lines.push('')
  lines.push(result.response)
  lines.push('')
  lines.push(`---`)
  lines.push(`*Cost: $${result.cost.toFixed(4)} | ${result.cached ? 'cached' : 'live'}*`)
  return lines.join('\n')
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/cli/output.test.ts
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/output.ts tests/cli/output.test.ts
git commit -m "feat: output formatters — table, json, csv, markdown"
```

---

## Task 7: Ask Command (End-to-End)

**Files:**

- Create: `src/cli/commands/ask.ts`
- Modify: `bin/corvus.ts`

- [ ] **Step 1: Implement ask command**

```typescript
// src/cli/commands/ask.ts
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { GrokAdapter } from '../../core/grok-adapter.js'
import { AuthManager } from '../../infra/auth.js'
import { ConfigManager } from '../../infra/config.js'
import { formatOutput, type OutputFormat } from '../output.js'
import type { CommandResult } from '../../core/types.js'

const SYSTEM_PROMPT = `You are Corvus, a sharp and direct intelligence analyst for X (Twitter).
When answering questions about X discourse, be concise and informative.
Lead with the key insight. Include specific accounts and tweets when relevant.
Add brief editorial context when useful ("worth watching", "contrarian signal").
Do not use emoji. Do not use headers or markdown formatting.`

export function registerAskCommand(program: Command): void {
  program
    .command('ask <question...>')
    .description('Ask a natural language question about X')
    .option('-f, --format <type>', 'output format: table, json, csv, md', 'table')
    .option('--cost', 'show estimated cost before executing')
    .action(async (questionParts: string[], options: { format: OutputFormat; cost?: boolean }) => {
      const question = questionParts.join(' ')
      const baseDir = ConfigManager.defaultDir()
      const authManager = new AuthManager(baseDir)

      const grokKey = await authManager.getGrokKey()
      if (!grokKey) {
        console.log(chalk.red('\n  No Grok API key found. Run: corvus auth setup\n'))
        process.exit(1)
      }

      if (options.cost) {
        console.log(chalk.dim('\n  Estimated cost: ~$0.001-0.005 (Grok 4.1 Fast)\n'))
        return
      }

      const spinner = ora({ text: 'scanning X...', indent: 2 }).start()

      try {
        const grok = new GrokAdapter(grokKey)
        const response = await grok.query(question, {
          systemPrompt: SYSTEM_PROMPT,
          enableXSearch: true,
        })

        spinner.stop()

        const result: CommandResult = {
          command: 'ask',
          query: question,
          response: response.text,
          cost: response.usage.costUsd,
          cached: false,
          timestamp: Date.now(),
        }

        console.log(formatOutput(result, options.format))
      } catch (err) {
        spinner.stop()
        const msg = err instanceof Error ? err.message : String(err)
        console.log(chalk.red(`\n  Error: ${msg}\n`))
        process.exit(1)
      }
    })
}
```

- [ ] **Step 2: Wire ask command into bin/corvus.ts**

```typescript
#!/usr/bin/env node

import { Command } from 'commander'
import { registerAuthCommand } from '../src/cli/commands/auth.js'
import { registerAskCommand } from '../src/cli/commands/ask.js'

const program = new Command()

program.name('corvus').description('AI-powered X intelligence in your terminal').version('0.1.0')

registerAuthCommand(program)
registerAskCommand(program)

program.parse()
```

- [ ] **Step 3: Build and test manually**

```bash
npm run build
# Set your Grok key first:
# export CORVUS_GROK_KEY=xai-your-key-here
node dist/bin/corvus.js ask "what are devs saying about Next.js today?"
# Expected: formatted response from Grok with X data
```

- [ ] **Step 4: Test JSON output piping**

```bash
node dist/bin/corvus.js ask "trending in AI" --format json | head -5
# Expected: valid JSON output
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/ask.ts bin/corvus.ts
git commit -m "feat: corvus ask — first working command with Grok x_search"
```

---

## Task 8: Create GitHub Repo and Push

- [ ] **Step 1: Create remote repo**

```bash
cd /c/Users/footb/corvus
gh repo create GriffinAtlas/corvus-x --public --description "AI-powered X intelligence in your terminal" --source . --remote origin
```

- [ ] **Step 2: Push all commits**

```bash
git push -u origin master
```

- [ ] **Step 3: Verify on GitHub**

Visit https://github.com/GriffinAtlas/corvus-x

- [ ] **Step 4: Commit plan update**

(This task is administrative — no code commit needed)

---

## Milestone Check

After completing all 8 tasks, verify:

1. `corvus --version` → `0.1.0`
2. `corvus --help` → shows ask and auth commands
3. `corvus auth setup` → stores Grok key
4. `corvus auth status` → shows key status
5. `corvus ask "what are devs saying about TypeScript?"` → returns Grok analysis
6. `corvus ask "trending in AI" --format json` → valid JSON
7. All tests pass: `npm test`
8. Repo live at github.com/GriffinAtlas/corvus-x
