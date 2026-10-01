import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const DOC_PATH = 'docs/process/generation-reliability/requirements-builder-prevention.md'
const committed = readFileSync(resolve(repoRoot, DOC_PATH), 'utf8')

const TARGET = '/Users/eric/Documents/Projects/support-tooling/requirements-builder'

/** The five REQ-029 rules: the id the document heads each with, and the phrase that names it. */
const RULES = [
  { id: 'RB-RULE-01', names: /vocabulary/i },
  { id: 'RB-RULE-02', names: /legal-state matrix/i },
  { id: 'RB-RULE-03', names: /universal quantifier/i },
  { id: 'RB-RULE-04', names: /traceability/i },
  { id: 'RB-RULE-05', names: /customized-user fixture/i },
] as const

/** What every rule must state: the gap, the recovery finding, and a check that detects a breach. */
const FIELDS = ['**Gap closed:**', '**Derived from:**', '**Detecting check:**'] as const

/** A rule's section: from its `### RB-RULE-0N` heading to the next heading of the same or higher level. */
function ruleSection(text: string, id: string) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`### ${id} `))
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^#{1,3} /.test(line))
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join('\n')
}

function field(section: string, label: string) {
  const at = section.indexOf(label)
  if (at === -1) return ''
  const after = section.slice(at + label.length)
  const next = FIELDS.map((other) => after.indexOf(other)).filter((index) => index !== -1)
  return (next.length ? after.slice(0, Math.min(...next)) : after).trim()
}

/** Every way the document falls short of stating the five rules; empty when it states them all. */
function ruleProblems(text: string) {
  const problems: string[] = []
  for (const { id, names } of RULES) {
    const section = ruleSection(text, id)
    if (section === null) {
      problems.push(`${id} is missing`)
      continue
    }
    if (!names.test(section.split('\n')[0])) problems.push(`${id} heading does not name its rule`)
    for (const label of FIELDS) {
      if (field(section, label) === '') problems.push(`${id} has no ${label}`)
    }
    if (!/GR-0\d|guardrail \d|"How the original gates missed it"/.test(field(section, '**Derived from:**'))) {
      problems.push(`${id} cites no recovery finding`)
    }
  }
  return problems
}

function without(text: string, id: string) {
  const section = ruleSection(text, id)
  if (section === null) throw new Error(`${id} is not in the document`)
  return text.replace(section, '')
}

describe('REQ-029 the five prevention rules', () => {
  it('the committed document states every rule with its gap, finding and detecting check', () => {
    expect(ruleProblems(committed)).toEqual([])
  })

  it.each(RULES)('fails when $id is removed', ({ id }) => {
    expect(ruleProblems(without(committed, id))).toEqual([`${id} is missing`])
  })

  it.each(FIELDS)('fails when a rule loses its %s', (label) => {
    const section = ruleSection(committed, 'RB-RULE-03') as string
    const stripped = committed.replace(section, section.replace(label, ''))
    expect(ruleProblems(stripped)).toContain(`RB-RULE-03 has no ${label}`)
  })

  it('fails when a rule cites no recovery finding', () => {
    const section = ruleSection(committed, 'RB-RULE-01') as string
    const derived = field(section, '**Derived from:**')
    const stripped = committed.replace(derived, 'An observation.')
    expect(ruleProblems(stripped)).toContain('RB-RULE-01 cites no recovery finding')
  })

  it('carries the quantifier the rules exist to preserve, verbatim', () => {
    expect(committed).toContain('every selectable section at every supported tier')
  })
})

describe('REQ-029 GEN-02a worked example', () => {
  const start = committed.indexOf('## Worked example')
  const example = committed.slice(start, committed.indexOf('\n## ', start + 1))

  it('quotes the original criterion as rejected', () => {
    expect(start).toBeGreaterThan(-1)
    expect(example).toContain(
      'Every goal preset produces a non-empty candidate set for a realistically-equipped location',
    )
    expect(example).toMatch(/\*\*Verdict:\*\* rejected/)
  })

  it('names the rules the original breaks', () => {
    for (const id of ['RB-RULE-01', 'RB-RULE-02', 'RB-RULE-03']) expect(example).toContain(id)
  })

  it('gives a rewrite quantified over every section, tier, goal and focus', () => {
    const rewrite = example.slice(example.indexOf('### Rewrite'))
    expect(rewrite).toContain('every selectable section at every supported tier')
    expect(rewrite).toMatch(/Every supported Goal × Focus × tier/)
    expect(rewrite).not.toContain('realistically-equipped')
  })
})

describe('REQ-029 handoff to the Requirements Builder project', () => {
  it('names the implementation target', () => {
    expect(committed).toContain(TARGET)
  })

  it('supplies a replay command and the result it must produce', () => {
    const start = committed.indexOf('## Replay')
    const replay = committed.slice(start, committed.indexOf('\n## ', start + 1))
    expect(start).toBeGreaterThan(-1)
    expect(replay).toMatch(/```sh\n[^`]*replay[^`]*```/)
    expect(replay).toMatch(/exit(s)? (code )?(non-zero|1)/i)
  })

  it('supplies a fixture for every rule', () => {
    const start = committed.indexOf('## Fixtures')
    const fixtures = committed.slice(start, committed.indexOf('\n## ', start + 1))
    expect(start).toBeGreaterThan(-1)
    for (const { id } of RULES) expect(fixtures).toContain(id)
  })

  it('every fixture block is valid JSON', () => {
    const blocks = [...committed.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1])
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) expect(() => JSON.parse(block)).not.toThrow()
  })

  it('declares that it changes no product or support-tooling code', () => {
    expect(committed).toMatch(/changes no\s+product code and no support-tooling code/i)
  })
})
