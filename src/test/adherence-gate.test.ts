// DS-08 — proof that the gate bites. Each fixture commits one violation the requirement
// names; if the gate ever stops reporting it, this suite goes red before a screen does.
import { describe, it, expect, beforeAll } from 'vitest'
import { ESLint, type Linter } from 'eslint'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildAdherenceConfig,
  readAdherenceRules,
} from '../../scripts/adherence/ds-config.mjs'

// The builder is plain JS, so its return type is inferred structurally rather than declared.
const builtConfig = () => buildAdherenceConfig() as Linter.Config[]

const repoRoot = resolve(import.meta.dirname, '../..')
const fixture = (name: string) => resolve(repoRoot, 'scripts/adherence/fixtures', name)

let gate: ESLint

beforeAll(() => {
  gate = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: true,
    overrideConfig: builtConfig(),
  })
})

async function lint(path: string) {
  const [result] = await gate.lintFiles([path])
  return result
}

describe('adherence gate', () => {
  const violations = [
    { name: 'a raw hex colour', file: 'raw-hex.tsx', reports: /Raw hex color/ },
    { name: 'a raw px value', file: 'raw-px.tsx', reports: /Raw px value/ },
    { name: 'a non-system font', file: 'foreign-font.tsx', reports: /Font not provided/ },
    { name: 'an unknown component prop', file: 'unknown-prop.tsx', reports: /doesn't accept that prop/ },
    { name: 'an out-of-range variant', file: 'out-of-range-variant.tsx', reports: /variant must be one of/ },
    {
      name: 'a component-internal import',
      file: 'component-internal-import.tsx',
      reports: /not component internals/,
    },
    // REQ-002 / REQ-028 — the vocabulary 0.14.3 removed, and the evidence copies that are
    // not runtime modules.
    { name: 'a removed component prop', file: 'retired-prop.tsx', reports: /removed <ChamferedFrame glow>/ },
    { name: 'a removed class', file: 'retired-class.tsx', reports: /Retired CLEAR class or token/ },
    { name: 'a removed hue alias', file: 'retired-token.tsx', reports: /Retired CLEAR class or token/ },
    { name: 'a removed atmosphere mode', file: 'retired-atmosphere.tsx', reports: /one atmosphere/ },
    { name: 'a historical kit import', file: 'historical-import.tsx', reports: /evidence, not a runtime module/ },
  ]

  it.each(violations)('fails the build on $name', async ({ file, reports }) => {
    const result = await lint(fixture(file))

    expect(result.errorCount).toBeGreaterThan(0)
    expect(result.messages.map((message) => message.message).join('\n')).toMatch(reports)
  })

  it('reports every violation as an error, never a warning', async () => {
    const results = await Promise.all(violations.map(({ file }) => lint(fixture(file))))

    expect(results.map((result) => result.warningCount)).toEqual(violations.map(() => 0))
  })

  it('cannot be silenced by an inline disable comment', async () => {
    const result = await lint(fixture('disable-comment.tsx'))

    expect(result.errorCount).toBeGreaterThan(0)
  })

  it('stays silent on compliant code', async () => {
    const result = await lint(fixture('compliant.tsx'))

    expect(result.messages).toEqual([])
  })

  it('excludes the vendored design system — it is the source of the tokens', async () => {
    // The bundle carries raw px values by definition: it is where the tokens are declared.
    const vendored = resolve(repoRoot, 'src/design-system/_ds_bundle.js')
    expect(readFileSync(vendored, 'utf-8')).toMatch(/\d+px/)

    await expect(gate.isPathIgnored(vendored)).resolves.toBe(true)
  })

  it('raises every vendored rule from warn to error', () => {
    const vendored: Record<string, [string, ...unknown[]]> = readAdherenceRules().rules
    expect(Object.values(vendored).map((rule) => rule[0])).toEqual(['warn', 'warn', 'warn'])

    const severities = builtConfig()
      .flatMap((block) => Object.values(block.rules ?? {}))
      .map((rule) => (Array.isArray(rule) ? rule[0] : rule))

    expect(severities.filter((severity) => severity !== 'off')).not.toContain('warn')
  })

  it('adds no blanket suppression: only the export’s own index override switches a rule off', () => {
    const off = builtConfig().flatMap((block) =>
      Object.entries(block.rules ?? {})
        .filter(([, rule]) => (Array.isArray(rule) ? rule[0] : rule) === 'off')
        .map(([name]) => ({ files: block.files, name })),
    )

    expect(off).toEqual([{ files: ['**/index.js'], name: 'no-restricted-imports' }])
    expect(builtConfig()[0].ignores).toEqual(['dist', 'coverage', 'src/design-system/**'])
  })

  it('keeps the retired vocabulary out of production while tests may name it to prove it absent', () => {
    const [, production, , tests] = builtConfig()
    const selectors = (block: Linter.Config) =>
      ((block.rules?.['no-restricted-syntax'] as unknown[]).slice(1) as { selector: string }[]).map(
        (entry) => entry.selector,
      )

    const retired = selectors(production).filter((selector) => !selectors(tests).includes(selector))
    expect(retired.some((selector) => selector.includes("data-atmosphere"))).toBe(true)
    expect(retired.some((selector) => selector.includes('clr-card__bar--lg'))).toBe(true)
    // The component, enum and import rules are not among the relaxed ones.
    expect(selectors(tests).some((selector) => selector.includes('EmptyState'))).toBe(true)
  })
})
