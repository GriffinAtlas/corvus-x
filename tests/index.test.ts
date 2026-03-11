import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

describe('package.json', () => {
  it('has a version string', () => {
    expect(typeof pkg.version).toBe('string')
  })

  it('version is valid semver', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
