/**
 * GEN-02b's fixtures, and they are deliberately not invented.
 *
 * Every candidate here is a real row of the previous app's catalog, read from
 * the read-only capture under `docs/backend/snapshot/` (REQ-008) — its name,
 * its equipment options, its muscle mapping, its anchors. Only the two columns
 * the capture predates, `exercise_role` and `component_movements`, are stated
 * locally, and they are stated once.
 *
 * That matters for one test in particular. `generation-prompt.test.ts` compares
 * prompt `5.0.0` against the v4.0.0 baseline, and a comparison against a
 * fixture somebody wrote to win it would prove nothing. Both sides of that
 * measurement describe the same real exercises, from the same real capture, so
 * the difference in bytes is format and scope and nothing else.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Constants, type Enums } from '../data/database.types'
import type {
  Candidate,
  CandidateMuscle,
  MovementPattern,
  SectionCandidates,
  SectionType,
} from '../data/candidates'
import type { UserConstraint } from '../data/constraints'
import {
  resolveEffectiveRequest,
  type PromptInput,
  type RecentHistory,
  type SoftPreferences,
} from '../../supabase/functions/_shared/prompt.ts'

const repoRoot = resolve(import.meta.dirname, '../..')
const capture = (file: string) =>
  readFileSync(
    resolve(repoRoot, 'docs/backend/snapshot/2026-09-18T162821Z/catalog', file),
    'utf-8',
  )

// ─────────────────────────────────────────────────────────────────────────────
// Reading the capture
// ─────────────────────────────────────────────────────────────────────────────

/** One CSV line → its fields. Postgres's dialect: `""` is one quote. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (quoted) {
      if (char !== '"') field += char
      else if (line[index + 1] === '"') {
        field += '"'
        index += 1
      } else quoted = false
      continue
    }

    if (char === '"') quoted = true
    else if (char === ',') {
      fields.push(field)
      field = ''
    } else field += char
  }

  fields.push(field)
  return fields
}

function rows(file: string): Record<string, string>[] {
  const [header, ...lines] = capture(file).trim().split('\n')
  const columns = parseCsvLine(header)

  return lines.map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']))
  })
}

/** A Postgres array literal — `{a,b}` — as its members. */
function pgArray(value: string): string[] {
  const inner = value.trim().replace(/^\{/, '').replace(/\}$/, '')
  if (inner === '') return []

  return (inner.match(/"(?:[^"\\]|\\.)*"|[^,]+/g) ?? []).map((member) =>
    member.startsWith('"') ? member.slice(1, -1).replace(/\\"/g, '"') : member,
  )
}

const definitions = new Map(rows('exercise_definitions.csv').map((row) => [row.id, row]))

const musclesById = rows('exercise_muscle_groups.csv').reduce((map, row) => {
  const muscles = map.get(row.exercise_id) ?? []
  muscles.push({ muscle: row.muscle_group, role: row.role as Enums<'muscle_role'> })
  return map.set(row.exercise_id, muscles)
}, new Map<string, CandidateMuscle[]>())

const PATTERNS: readonly string[] = Constants.public.Enums.movement_pattern

/**
 * The capture's anchors, narrowed to the patterns the new enum has. The old
 * catalog carried an anchor vocabulary of its own — `surprise` among them —
 * and DATA-02's taxonomy equivalence is what reconciles the two. Dropping what
 * does not map is that reconciliation's answer, not a convenience: a mobility
 * candidate with no movement pattern is exactly the focus-exempt row §3's query
 * keeps for its role.
 */
const anchorsById = rows('exercise_anchors.csv').reduce((map, row) => {
  if (!PATTERNS.includes(row.anchor)) return map

  const anchors = map.get(row.exercise_id) ?? []
  anchors.push({ pattern: row.anchor as MovementPattern, primary: row.is_primary === 't' })
  return map.set(row.exercise_id, anchors)
}, new Map<string, { pattern: MovementPattern; primary: boolean }[]>())

// ─────────────────────────────────────────────────────────────────────────────
// The two columns the capture predates
// ─────────────────────────────────────────────────────────────────────────────

interface Anatomy {
  readonly role: Enums<'exercise_role'>
  readonly components: readonly string[]
}

const ANATOMY: Record<string, Anatomy> = {
  '90-90-stretch': { role: 'mobility', components: ['hip-rotation', 'hip-mobility'] },
  'air-squat': { role: 'accessory', components: ['knee-flexion', 'hip-flexion'] },
  'back-squat': {
    role: 'compound_lift',
    components: ['knee-flexion', 'hip-flexion', 'brace', 'upper-back-tension'],
  },
  'barbell-row': {
    role: 'compound_lift',
    components: ['horizontal-pull', 'scapular-retraction', 'hinge-hold'],
  },
  'box-jumps': {
    role: 'conditioning',
    components: ['triple-extension', 'landing-mechanics'],
  },
  'bulgarian-split-squat': {
    role: 'accessory',
    components: ['single-leg-stance', 'knee-flexion', 'balance'],
  },
  'cat-cow': { role: 'mobility', components: ['spinal-flexion', 'spinal-extension'] },
  deadlift: {
    role: 'compound_lift',
    components: ['hip-hinge', 'posterior-chain-activation', 'grip', 'brace'],
  },
  'front-squat': {
    role: 'compound_lift',
    components: ['knee-flexion', 'upright-torso', 'front-rack', 'brace'],
  },
  'glute-bridge': { role: 'activation', components: ['hip-extension', 'glute-activation'] },
  'walking-lunges': {
    role: 'accessory',
    components: ['single-leg-stance', 'hip-extension', 'balance'],
  },
  'worlds-greatest-stretch': {
    role: 'mobility',
    components: ['hip-flexor-lengthening', 'thoracic-rotation', 'ankle-dorsiflexion'],
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidates
// ─────────────────────────────────────────────────────────────────────────────

/** One captured row → the candidate GEN-02a would have resolved from it. */
export function candidateFixture(exerciseId: string): Candidate {
  const row = definitions.get(exerciseId)
  const anatomy = ANATOMY[exerciseId]
  if (!row || !anatomy) throw new Error(`${exerciseId} is not in the captured catalog`)

  const anchors = anchorsById.get(exerciseId) ?? []

  return {
    exerciseId,
    name: row.name,
    patterns: anchors.map((anchor) => anchor.pattern),
    primaryPatterns: anchors.filter((anchor) => anchor.primary).map((anchor) => anchor.pattern),
    role: anatomy.role,
    components: anatomy.components,
    muscles: musclesById.get(exerciseId) ?? [],
    canBePrimary: row.can_be_primary === 't',
    // `usable_equipment` is the intersection DATA-05 computes. This fixture's
    // request owns everything the capture lists, so the intersection is the
    // options themselves — sorted, the way `usable_equipment(...)` sorts them.
    usableEquipment: [...pgArray(row.equipment_options)].sort(),
  }
}

/** Every exercise these fixtures know about, resolved or not. */
export const CANDIDATE_LIBRARY: Record<string, Candidate> = Object.fromEntries(
  Object.keys(ANATOMY).map((id) => [id, candidateFixture(id)]),
)

export function sectionFixture(
  section: SectionType,
  exerciseIds: readonly string[],
  relaxed = false,
): SectionCandidates {
  return { section, relaxed, candidates: exerciseIds.map((id) => CANDIDATE_LIBRARY[id]) }
}

/** The request these tests measure: a 45-minute strength session at 8. */
const SECTIONS: readonly SectionCandidates[] = [
  sectionFixture('warmup', ['90-90-stretch', 'cat-cow', 'worlds-greatest-stretch']),
  sectionFixture('primary_lift', ['back-squat', 'deadlift', 'front-squat']),
  sectionFixture('accessory', ['bulgarian-split-squat', 'glute-bridge', 'walking-lunges']),
]

const HISTORY: RecentHistory = {
  focuses: ['upper_body', 'full_body', 'lower_body'],
  patterns: [
    { pattern: 'press', count: 3 },
    { pattern: 'pull', count: 2 },
    { pattern: 'squat', count: 1 },
  ],
  exerciseIds: ['back-squat', 'deadlift'],
}

/** One soft constraint of each action, shaped as DATA-05 stores them. */
const constraint = (
  action: UserConstraint['action'],
  target: UserConstraint['target'],
): UserConstraint => ({
  id: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-0000000000ff',
  action,
  target,
  appliesTo: { persistence: 'persistent' },
  note: null,
  createdAt: '2026-09-25T09:00:00.000Z',
})

const PREFERENCES: SoftPreferences = {
  constraints: [
    constraint('prefer_not', { scope: 'exercise', exerciseId: 'walking-lunges' }),
    constraint('avoid', { scope: 'movement_pattern', pattern: 'power' }),
  ],
  notes: 'left shoulder has been a bit cranky',
}

/** The whole prompt input, with any part of it overridden. */
export function promptInput(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    request: resolveEffectiveRequest({
      requestId: 'req_abc123_def456',
      goal: 'strength',
      focus: 'lower_body',
      requestedIntensity: 8,
      durationTargetMins: 45,
      enabledSections: ['warmup', 'primary_lift', 'accessory', 'core', 'cooldown'],
    }),
    sections: SECTIONS,
    history: HISTORY,
    preferences: PREFERENCES,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The v4.0.0 baseline
// ─────────────────────────────────────────────────────────────────────────────

const LEGACY_PROMPT_FILE = 'docs/backend/evidence/previous-functions/generate-workout.prompt.ts'

/**
 * The previous app's v4.0.0 system prompt, verbatim, out of the evidence copy
 * of the file that held it. Read rather than transcribed — a baseline somebody
 * retyped is a baseline somebody could shorten.
 */
export function legacySystemPrompt(read: (path: string) => string): string {
  const match = read(LEGACY_PROMPT_FILE).match(
    /export const SYSTEM_PROMPT = `([\s\S]*?)`;?\n/,
  )
  if (!match) throw new Error(`${LEGACY_PROMPT_FILE} no longer holds a SYSTEM_PROMPT`)

  return match[1]
}

/**
 * The library block the previous `buildUserPrompt` produced, in its own format
 * — see `generate-workout.index.ts`, which is in the repository beside the
 * prompt it imported.
 *
 * It is rendered here for **only the exercises this request resolved as
 * candidates**, which makes it a lower bound rather than a reconstruction: the
 * old function sent every catalog row that survived an equipment and section
 * filter, of which there were around a hundred, and the rest of its user prompt
 * — user context, the request block, the history block — is not counted at all.
 * The real v4 prompt was larger than what this returns, so a reduction measured
 * against it is the smallest one that can honestly be claimed.
 */
export function legacyLibraryRows(sections: readonly SectionCandidates[]): string[] {
  const unique = new Map<string, Candidate>()
  for (const section of sections) {
    for (const candidate of section.candidates) unique.set(candidate.exerciseId, candidate)
  }

  return [...unique.values()].map((candidate) => {
    const row = definitions.get(candidate.exerciseId)
    if (!row) throw new Error(`${candidate.exerciseId} is not in the captured catalog`)

    const equipment = pgArray(row.equipment_options)
    const primary =
      candidate.canBePrimary && equipment.includes('barbell') ? '[PRIMARY w/barbell] ' : ''
    const anchors = anchorsById.get(candidate.exerciseId) ?? []
    const anchorsStr = anchors.length
      ? ` | anchors:[${anchors.map((anchor) => anchor.pattern).join(',')}]`
      : ''
    const components = candidate.components.length
      ? ` | components:[${candidate.components.join(',')}]`
      : ''
    const muscles = candidate.muscles.length
      ? ` | muscles:[${candidate.muscles
          .map((muscle) => `${muscle.muscle}:${muscle.role}`)
          .join(',')}]`
      : ''
    const regression = row.regression ? ` | regression:${row.regression}` : ''

    return (
      `  ${candidate.exerciseId} | ${row.name} | role:${candidate.role}` +
      ` | equipment:[${equipment.join(', ')}] | sections:[${pgArray(row.sections).join(', ')}] ` +
      `${primary}${anchorsStr}${components}${muscles}${regression}`
    )
  })
}

/** Those rows under the heading the old user prompt gave them. */
export function legacyLibraryBlock(sections: readonly SectionCandidates[]): string {
  return [
    'EXERCISE LIBRARY (you MUST only use exercise_id values from this list):',
    ...legacyLibraryRows(sections),
  ].join('\n')
}
