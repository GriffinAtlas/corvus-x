import { describe, it, expect } from 'vitest'
import { VERSION } from '../src/index.js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('VERSION', () => {
  it('exports a string', () => {
    expect(typeof VERSION).toBe('string')
  })

  it('matches package.json version', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))
    expect(VERSION).toBe(pkg.version)
  })

  it('is a valid semver format', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
