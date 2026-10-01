/**
 * GR-02 / REQ-003 — the section-mapping ledger.
 *
 * `docs/process/generation-reliability/section-mapping-ledger.json` proposes
 * which exercises join `skill_power`, `carries` and `stability_balance`. It is
 * written by review, so nothing regenerates it; this suite is what keeps it
 * true. It holds every row to the pre-change capture, the committed seed and
 * the sources the row cites, and it is the check REQ-003 asks for: a seed whose
 * section tags differ from the capture for an exercise with no row fails here.
 *
 * The ledger is a proposal. The seed is untouched by it, and the last block
 * says so — it is expected to be rewritten by the task that applies the ledger,
 * not relaxed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { REPO_ROOT, loadSnapshot } from '../../../scripts/catalog-seed/sources.mjs'
import {
  LEDGER_SECTIONS,
  addedSections,
  loadLedger,
  validateLedger,
} from '../../../scripts/generation-reliability/section-ledger.mjs'
import { Constants } from '../../data/database.types'
import { seededCatalog } from '../seed-catalog'

const SECTION_TYPES = [...Constants.public.Enums.section_type] as string[]

const ledger = loadLedger(REPO_ROOT)
const snapshot = loadSnapshot()
const catalog = seededCatalog()

const capture = new Map(
  snapshot.definitions.map((row) => [
    row.id,
    { sections: row.sections, canBePrimary: row.canBePrimary },
  ]),
)

const seed = new Map(
  catalog.map((row) => [row.id, { sections: [...row.sections], canBePrimary: row.canBePrimary }]),
)

const facts = new Map(
  catalog.map((row) => [
    row.id,
    {
      name: row.name,
      components: row.componentMovements,
      role: row.exerciseRole,
      legacyAnchors: snapshot.anchors
        .filter((anchor) => anchor.exerciseId === row.id)
        .map((anchor) => anchor.anchor),
      cues: snapshot.definitions.find((definition) => definition.id === row.id)?.coachingCues ?? [],
    },
  ]),
)

const context = {
  capture,
  seed,
  facts,
  sectionTypes: SECTION_TYPES,
  readSource: (path: string) => {
    const absolute = join(REPO_ROOT, path)
    return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null
  },
}

/** A deep copy with one row changed, for the rules that must fail. */
function withRow(change: (row: (typeof ledger.rows)[number]) => void) {
  const copy = structuredClone(ledger)
  change(copy.rows[0])
  return copy
}

describe('the committed ledger', () => {
  it('holds against the capture, the seed and its cited sources', () => {
    expect(validateLedger(ledger, context)).toEqual([])
  })

  it('names the capture it was written against', () => {
    expect(context.readSource(ledger.capture)).not.toBeNull()
    expect(ledger.capture).toContain(snapshot.id)
  })

  it('has a row per changed exercise with id, before, after, evidence and rationale', () => {
    expect(ledger.rows.length).toBeGreaterThan(0)

    for (const row of ledger.rows) {
      expect(row.id, 'id').toMatch(/\S/)
      expect(row.change, row.id).toMatch(/\S/)
      expect(row.before.sections, row.id).toEqual(capture.get(row.id)?.sections)
      expect(row.before.canBePrimary, row.id).toBe(capture.get(row.id)?.canBePrimary)
      expect(row.after.sections, row.id).not.toEqual(row.before.sections)
      expect(typeof row.after.canBePrimary, row.id).toBe('boolean')
    }
  })

  it('refers only to exercises in the 140-exercise catalog', () => {
    expect(catalog).toHaveLength(140)

    for (const { id } of [...ledger.rows, ...ledger.ambiguous]) {
      expect(seed.has(id), id).toBe(true)
      expect(capture.has(id), id).toBe(true)
    }
  })

  it('gives every row and every ambiguous exercise evidence and a rationale', () => {
    for (const entry of [...ledger.rows, ...ledger.ambiguous]) {
      expect(entry.evidence.length, entry.id).toBeGreaterThan(0)
      for (const evidence of entry.evidence) expect(evidence.trim(), entry.id).not.toBe('')
      expect(entry.rationale.trim(), entry.id).not.toBe('')
    }
  })

  it('cites the section description for the section each row adds', () => {
    for (const row of ledger.rows) {
      for (const section of addedSections(row)) {
        expect(row.evidence, row.id).toContain(`ref:onboarding.${section}`)
      }
    }
  })

  it('proposes at least one exercise for each of the three sections', () => {
    for (const section of LEDGER_SECTIONS) {
      const proposed = ledger.rows.filter((row) => addedSections(row).includes(section))
      expect(proposed.length, section).toBeGreaterThan(0)
    }
  })

  it('adds only to the three empty sections and removes no existing tag', () => {
    for (const row of ledger.rows) {
      expect(addedSections(row).length, row.id).toBeGreaterThan(0)
      for (const section of addedSections(row)) expect(LEDGER_SECTIONS, row.id).toContain(section)
      for (const section of row.before.sections) {
        expect(row.after.sections, `${row.id} keeps ${section}`).toContain(section)
      }
      expect(row.after.canBePrimary, row.id).toBe(row.before.canBePrimary)
    }
  })

  it('lists ambiguous exercises separately, with a recommendation, and keeps the list short', () => {
    expect(ledger.ambiguous.length).toBeGreaterThan(0)
    // A list to review, not the classification handed back.
    expect(ledger.ambiguous.length).toBeLessThan(ledger.rows.length)

    for (const entry of ledger.ambiguous) {
      expect(LEDGER_SECTIONS, entry.id).toContain(entry.section)
      expect(['add', 'leave'], entry.id).toContain(entry.recommendation)

      const row = ledger.rows.find((candidate) => candidate.id === entry.id)
      if (row !== undefined) expect(addedSections(row), entry.id).not.toContain(entry.section)
    }
  })
})

describe('the check', () => {
  it('fails when the seed differs from the capture for an exercise with no row', () => {
    const untouched = catalog.find((row) => !ledger.rows.some((entry) => entry.id === row.id))
    expect(untouched).toBeDefined()
    const id = untouched?.id ?? ''

    const drifted = new Map(seed)
    drifted.set(id, {
      sections: [...(seed.get(id)?.sections ?? []), 'carries'],
      canBePrimary: seed.get(id)?.canBePrimary ?? false,
    })
    expect(validateLedger(ledger, { ...context, seed: drifted }).join('\n')).toMatch(
      new RegExp(`"${id}" differs from the pre-change capture and has no ledger row`),
    )

    const promoted = new Map(seed)
    promoted.set(id, {
      sections: seed.get(id)?.sections ?? [],
      canBePrimary: !(seed.get(id)?.canBePrimary ?? false),
    })
    expect(validateLedger(ledger, { ...context, seed: promoted }).join('\n')).toMatch(
      /has no ledger row/,
    )
  })

  it('accepts a seed that has applied a row, and only as the row wrote it', () => {
    const [row] = ledger.rows

    const applied = new Map(seed)
    applied.set(row.id, row.after)
    expect(validateLedger(ledger, { ...context, seed: applied })).toEqual([])

    const other = new Map(seed)
    other.set(row.id, { ...row.after, sections: [...row.after.sections, 'cooldown'] })
    expect(validateLedger(ledger, { ...context, seed: other }).join('\n')).toMatch(
      /differs from the capture and from its ledger row/,
    )
  })

  it('fails when a row lacks evidence or rationale', () => {
    const noEvidence = withRow((row) => {
      row.evidence = []
    })
    expect(validateLedger(noEvidence, context).join('\n')).toMatch(/has no evidence/)

    const blankEvidence = withRow((row) => {
      row.evidence = ['  ']
    })
    expect(validateLedger(blankEvidence, context).join('\n')).toMatch(/evidence is empty/)

    const noRationale = withRow((row) => {
      row.rationale = ' '
    })
    expect(validateLedger(noRationale, context).join('\n')).toMatch(/has no rationale/)
  })

  it('fails when evidence does not resolve', () => {
    for (const [evidence, message] of [
      ['component:not-a-component', /component "not-a-component" it does not carry/],
      ['role:cardio', /cites role "cardio"/],
      ['legacy-anchor:not-an-anchor', /legacy anchor "not-an-anchor"/],
      ['name:Not In The Name', /in a name that is/],
      ['cue:Not a cue', /coaching cue "Not a cue"/],
      ['ref:not.defined', /reference "not.defined" the ledger does not define/],
      ['because I said so', /is not kind:value/],
      ['hunch:strong', /unknown evidence kind/],
    ] as const) {
      const tampered = withRow((row) => {
        row.evidence = [evidence]
      })
      expect(validateLedger(tampered, context).join('\n'), evidence).toMatch(message)
    }

    const misquoted = structuredClone(ledger)
    misquoted.references['onboarding.carries'].quote = 'Not what the screen says'
    expect(validateLedger(misquoted, context).join('\n')).toMatch(/does not contain/)

    const missing = structuredClone(ledger)
    missing.references['onboarding.carries'].path = 'docs/not-a-file.md'
    expect(validateLedger(missing, context).join('\n')).toMatch(/does not exist/)
  })

  it('fails when a row invents an exercise or appears twice', () => {
    const invented = withRow((row) => {
      row.id = 'not-an-exercise'
    })
    expect(validateLedger(invented, context).join('\n')).toMatch(
      /"not-an-exercise" names an exercise the catalog does not have/,
    )

    const repeated = structuredClone(ledger)
    repeated.rows.push(structuredClone(repeated.rows[0]))
    expect(validateLedger(repeated, context).join('\n')).toMatch(/appears twice/)

    const inventedAmbiguous = structuredClone(ledger)
    inventedAmbiguous.ambiguous[0].id = 'not-an-exercise'
    expect(validateLedger(inventedAmbiguous, context).join('\n')).toMatch(
      /names an exercise the catalog does not have/,
    )
  })

  it('fails when before is not the capture, or after is not a real change', () => {
    const wrongBefore = withRow((row) => {
      row.before.sections = [...row.before.sections, 'cooldown']
    })
    expect(validateLedger(wrongBefore, context).join('\n')).toMatch(
      /before does not match the pre-change capture/,
    )

    const noChange = withRow((row) => {
      row.after = structuredClone(row.before)
    })
    expect(validateLedger(noChange, context).join('\n')).toMatch(/changes nothing/)

    const notASection = withRow((row) => {
      row.after.sections = [...row.after.sections, 'breathwork']
    })
    expect(validateLedger(notASection, context).join('\n')).toMatch(
      /"breathwork", which is not a section_type/,
    )
  })

  it('fails when a tag is removed without a justification, and passes with one', () => {
    const removed = withRow((row) => {
      row.after.sections = row.after.sections.slice(1)
    })
    expect(validateLedger(removed, context).join('\n')).toMatch(/without a removalRationale/)

    removed.rows[0].removalRationale = 'Recorded reason for the removal.'
    expect(validateLedger(removed, context)).toEqual([])
  })

  it('fails when an ambiguous exercise is also decided by a row, or has no recommendation', () => {
    const [row] = ledger.rows

    const decided = structuredClone(ledger)
    decided.ambiguous.push({
      id: row.id,
      section: addedSections(row)[0],
      evidence: [`ref:onboarding.${addedSections(row)[0]}`],
      recommendation: 'add',
      rationale: 'Already a row.',
    })
    expect(validateLedger(decided, context).join('\n')).toMatch(/is also changed by a ledger row/)

    const undecided = structuredClone(ledger)
    undecided.ambiguous[0].recommendation = 'ask the owner'
    expect(validateLedger(undecided, context).join('\n')).toMatch(/has no recommendation from/)
  })
})

describe('the seed, before the ledger is applied', () => {
  it('still matches the pre-change capture for every exercise', () => {
    expect(seed.size).toBe(capture.size)

    for (const [id, captured] of capture) {
      expect(seed.get(id), id).toEqual(captured)
    }
  })

  it.each(LEDGER_SECTIONS)('still has no %s exercise', (section) => {
    expect(catalog.filter((row) => row.sections.includes(section))).toEqual([])
  })
})
