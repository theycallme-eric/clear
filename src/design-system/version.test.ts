import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { VERSION } from './index'

describe('design system version', () => {
  it('matches the version pinned in ATOMIC.md §1', () => {
    const atomicPath = resolve(import.meta.dirname, '../../docs/specs/design/ATOMIC.md')
    const atomicContent = readFileSync(atomicPath, 'utf-8')

    // Extract version from the table in §1 — looks for "| Version | `X.Y.Z` |"
    const versionMatch = atomicContent.match(/\|\s*Version\s*\|\s*`([^`]+)`\s*\|/)
    if (!versionMatch) {
      throw new Error('Could not find Version in ATOMIC.md §1 table')
    }
    const pinnedVersion = versionMatch[1]

    expect(VERSION).toBe(pinnedVersion)
  })

  it('matches package.json version', () => {
    const packagePath = resolve(import.meta.dirname, './package.json')
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'))

    expect(VERSION).toBe(packageJson.version)
  })
})
