import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { VERSION } from '../design-system/index'

const repoRoot = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf-8')

const ATOMIC = 'docs/specs/design/ATOMIC.md'
const IA = 'docs/specs/IA.md'
const LEDGER = 'docs/design/CLEAR-0.14.3-RECONCILIATION-LEDGER.md'

/** ATOMIC.md before its historical section: the part that teaches. */
const activeAtomic = () => read(ATOMIC).split(/^## \d+\. Historical state$/m)[0]

/** Backticked repository paths a document names as evidence. */
function namedPaths(text: string): string[] {
  return [...text.matchAll(/`((?:src|docs|exports|scripts|e2e)\/[^`\s]*)`/g)].map((match) =>
    // A glob such as `components/*/card.html` names the folder before it.
    match[1].replace(/\/?\*.*$/, ''),
  )
}

/** What 0.9.7 and earlier taught that 0.14.3 retired (REQ-028). */
const STALE_TEACHING = [
  /directly on (?:the )?atmosphere/i,
  /solid(?: dark)?[- ]ground (?:frame|under)/i,
  /\b2px bleed|bleed 2px/i,
  /optional (?:8px )?accent|accent is an attached 8px/i,
  /Full atmosphere/,
  /\b(?:Quiet|Operational)\b/,
  /0\.9\.7/,
  /deprecated/i,
  /explorations\//,
]

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

  it('sets the skin in head before the app module, without consulting OS contrast', () => {
    const htmlPath = resolve(import.meta.dirname, '../../index.html')
    const html = readFileSync(htmlPath, 'utf-8')
    const blockingBootstrap = html.indexOf("document.documentElement.setAttribute('data-skin', skin)")
    const headEnd = html.indexOf('</head>')
    const appModule = html.indexOf('<script type="module" src="/src/main.tsx"></script>')

    expect(blockingBootstrap).toBeGreaterThan(-1)
    expect(blockingBootstrap).toBeLessThan(headEnd)
    expect(appModule).toBeGreaterThan(headEnd)
    // U24: the stored explicit choice, else the product default — never the OS.
    expect(html).toContain("var skin = storedSkin() || 'clear';")
    expect(html).not.toContain("matchMedia('(prefers-contrast")
    expect(html).not.toMatch(/initSkin\(/)
  })
})

describe('active guidance teaches one 0.14.3 component contract (TASK-025)', () => {
  it('names every public component the package exports', () => {
    const exported = [
      ...read('src/design-system/index.d.ts').matchAll(
        /^export \{ ([\w, ]+) \} from '\.\/components\//gm,
      ),
    ].flatMap((match) => match[1].split(/,\s*/))
    expect(exported).toContain('Card')
    expect(exported).toContain('TextAction')

    for (const name of exported) expect(activeAtomic(), name).toContain(`\`${name}\``)
  })

  it('teaches the current ground, emission, bar and motion, not the retired ones', () => {
    const active = activeAtomic()
    for (const taught of ['--card-ground-alpha', '--emit-near', '--emit-far', '--glow-spread', '--accent-bar-width', '--stagger']) {
      expect(active).toContain(taught)
    }
    for (const stale of STALE_TEACHING) expect(active).not.toMatch(stale)
  })

  it('names removed vocabulary only in the removed table or the historical section', () => {
    const active = activeAtomic()
    const removedTable = active.split('### 9.1 Removed vocabulary')[1]?.split('### 9.2')[0] ?? ''
    const elsewhere = active.replace(removedTable, '')
    expect(removedTable).not.toBe('')

    for (const retired of ['barWidth', 'chamfer-xl', 'hasLeftBorder', 'bottomBorderOnly', 'actionLabel', 'glow-emissive', '--color-', '--font-headings', '"quiet"', 'clr-card__bar--lg']) {
      expect(removedTable, retired).toContain(retired)
      expect(elsewhere, retired).not.toContain(retired)
    }
  })

  it('keeps IA visual sections on 0.14.3, with references that exist', () => {
    const ia = read(IA)
    expect(ia).toMatch(/^> \*\*Status:\*\* ACTIVE — visual sections reconciled to the owner-supplied CLEAR Design System 0\.14\.3$/m)
    for (const stale of STALE_TEACHING) expect(ia).not.toMatch(stale)
    for (const path of namedPaths(ia)) expect(existsSync(resolve(repoRoot, path)), path).toBe(true)
  })

  it('labels superseded visual guidance as historical', () => {
    for (const path of [
      'docs/specs/design/visual-language-rules.md',
      'docs/specs/design/chamfered-component.md',
      'docs/design/CLEAR-0.9.7-RECONCILIATION-AUDIT.md',
      'docs/design/CLEAR-0.9.7-VIBE-A-AUDIT.md',
      'docs/design/CLEAR-0.9.7-VIBE-B-AUDIT.md',
      'docs/design/CLEAR-0.9.7-VIBE-C-AUDIT.md',
      'docs/design/CLEAR-0.9.7-VIBE-D-FINAL-AUDIT.md',
    ]) {
      expect(read(path).split('\n').slice(0, 8).join('\n'), path).toMatch(/HISTORICAL/)
    }

    const historical = read(ATOMIC).split(/^## \d+\. Historical state$/m)[1] ?? ''
    expect(historical).toContain('`docs/specs/design/visual-language-rules.md`')
    expect(historical).toContain('`docs/specs/design/chamfered-component.md`')
    expect(historical).toContain('the 0.9.7 reconciliation and VIBE audits')
  })
})

describe('the reconciliation ledger (REQ-028)', () => {
  const rows = (prefix: string) =>
    read(LEDGER)
      .split('\n')
      .filter((line) => line.startsWith(`| ${prefix}-`))
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))

  it('maps every rule change to source evidence, implementation, a task and evidence', () => {
    const rules = rows('RULE')
    expect(rules.map(([id]) => id)).toEqual(
      Array.from({ length: 16 }, (_, index) => `RULE-${String(index + 1).padStart(2, '0')}`),
    )
    for (const [id, rule, source, implementation, task, evidence] of rules) {
      expect([rule, source, implementation, evidence].every(Boolean), id).toBe(true)
      expect(task, id).toMatch(/TASK-\d{3}/)
    }
  })

  it('records an owner disposition, the actual implementation and named evidence for each discrepancy', () => {
    const discrepancies = rows('DISC')
    expect(discrepancies.map(([id]) => id)).toEqual(
      Array.from({ length: 8 }, (_, index) => `DISC-0${index + 1}`),
    )
    for (const [id, discrepancy, disposition, implementation, evidence] of discrepancies) {
      expect([discrepancy, disposition, implementation].every(Boolean), id).toBe(true)
      expect(namedPaths(evidence).length, id).toBeGreaterThan(0)
    }
  })

  it('names a real file and a real focused test for every app-owned exception', () => {
    const exceptions = rows('EXC')
    expect(exceptions.length).toBeGreaterThan(0)
    for (const [id, file, , , test] of exceptions) {
      expect(existsSync(resolve(repoRoot, file.replace(/`/g, ''))), id).toBe(true)
      expect(test, id).toMatch(/\.test\.tsx?`$/)
    }
  })

  it('cites only evidence that exists and promotes no rejected comparison', () => {
    const ledger = read(LEDGER)
    for (const path of namedPaths(ledger)) expect(existsSync(resolve(repoRoot, path)), path).toBe(true)
    expect(ledger).not.toMatch(/explorations\//)
  })
})
