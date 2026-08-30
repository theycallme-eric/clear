import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { VERSION } from '../design-system/index'

describe('design system integration', () => {
  it('matches the version pinned in ATOMIC.md §1', () => {
    const atomicPath = resolve(import.meta.dirname, '../../docs/specs/design/ATOMIC.md')
    const atomicContent = readFileSync(atomicPath, 'utf-8')

    // Extract version from the table in §1 — looks for "| Version | `X.Y.Z` |"
    const versionMatch = atomicContent.match(/\|\s*Version\s*\|\s*`([^`]+)`\s*\|/)
    if (!versionMatch) {
      throw new Error('Could not find Version in ATOMIC.md §1 table')
    }

    expect(VERSION).toBe(versionMatch[1])
  })

  it('matches the vendored package.json version', () => {
    const packagePath = resolve(import.meta.dirname, '../design-system/package.json')
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'))

    expect(VERSION).toBe(packageJson.version)
  })

  it('sets the skin before the app module and initializes skin.js from head', () => {
    const htmlPath = resolve(import.meta.dirname, '../../index.html')
    const html = readFileSync(htmlPath, 'utf-8')
    const blockingBootstrap = html.indexOf("document.documentElement.setAttribute('data-skin', skin)")
    const skinModule = html.indexOf("import { initSkin } from '/src/design-system/skin.js'")
    const headEnd = html.indexOf('</head>')
    const appModule = html.indexOf('<script type="module" src="/src/main.tsx"></script>')

    expect(blockingBootstrap).toBeGreaterThan(-1)
    expect(skinModule).toBeGreaterThan(blockingBootstrap)
    expect(skinModule).toBeLessThan(headEnd)
    expect(appModule).toBeGreaterThan(headEnd)
  })
})
