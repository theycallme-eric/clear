/**
 * TASK-036 (REQ-036; AC-R036-01…03; G24, R04, R31) — the load-guidance read
 * model: what a prescribed load means, in which unit, what it says about one
 * hand, and how it stays apart from the weight a person actually lifted.
 *
 * Nothing here is new training logic. Every reading is an existing owner's:
 *
 *   · the words are `loadText`'s (`review.ts`), over the prescription's own
 *     `load_type` / `load_value` and the profile's `weight_unit`;
 *   · the implement is `equipmentName`'s, over `equipment_used`;
 *   · a performed weight is the logged row's own `weight` and `weight_unit`
 *     (`exercise_set_logs`, `block_movement_results`), the columns History's
 *     `loggedSet` / `movementActualReadings` read.
 *
 * Two things the accepted preview showed are not defined by any current input,
 * so this module records them as definition dependencies and reads neither:
 *
 *   · `LOAD-RANGE-RULE` — no rough suggested range. A prescription holds one
 *     `load_value`; the OVR-01c suggestion is one number with its confidence;
 *     the generation prompt's LOAD GUIDANCE bands instruct composition and are
 *     stored nowhere. A range drawn from any of them would be invented logic.
 *   · `LOAD-PER-HAND` — no per-hand statement. Nothing records whether a
 *     movement uses one implement or two, so the number is shown exactly as
 *     stored beside the implement's name: never doubled, halved or explained.
 *
 * The prescribed-load presentation those dependencies do not block continues
 * unchanged (TASK-003): the live readings (`liveMovementReadings`) read their
 * load through `prescribedLoad`, and Review reads the same `loadText`.
 *
 * Pure and React-free. Contract: `docs/specs/LOAD_GUIDANCE_CONTRACT.md`.
 */
import type { Enums } from '../data/database.types'
import { equipmentName, loadText } from './review'

type WeightUnit = Enums<'weight_unit'>
type LoadGuidance = Enums<'load_guidance'>

// ─────────────────────────────────────────────────────────────────────────────
// Sources
// ─────────────────────────────────────────────────────────────────────────────

/** A named export in a repository file: the one owner a reading comes from. */
export interface LoadSourceRef {
  readonly module: string
  readonly name: string
}

export interface LoadGuidanceSource {
  /** The reading this read model exposes. */
  readonly field: string
  /** The stored column(s) it reads. */
  readonly columns: readonly string[]
  /** The existing owner of the reading, which this module consumes. */
  readonly owner: LoadSourceRef
  readonly meaning: string
}

/**
 * One owner per reading. The contract's §2 table is this record in prose;
 * the check holds every owner to an export that exists in its module.
 */
export const LOAD_GUIDANCE_SOURCES: readonly LoadGuidanceSource[] = [
  {
    field: 'target.text',
    columns: ['workout_exercises.load_type', 'workout_exercises.load_value', 'profiles.weight_unit'],
    owner: { module: 'src/state/review.ts', name: 'loadText' },
    meaning: 'The prescribed target, in the guidance’s own terms; null when the prescription says nothing.',
  },
  {
    field: 'target.unit',
    columns: ['profiles.weight_unit'],
    owner: { module: 'src/state/set-logging.ts', name: 'useShellWeightUnit' },
    meaning: 'The profile’s unit, for an absolute load only; null while unread, never guessed.',
  },
  {
    field: 'target.implement',
    columns: ['workout_exercises.equipment_used'],
    owner: { module: 'src/state/review.ts', name: 'equipmentName' },
    meaning: 'The implement the load is for, named beside the movement; it carries any per-hand sense.',
  },
  {
    field: 'target.suggestion',
    columns: ['load_anchors.anchor_value', 'load_anchors.unit'],
    owner: { module: 'src/state/load-suggestions.ts', name: 'reviewLoadSuggestions' },
    meaning: 'Review’s one suggested weight with its confidence (OVR-01c); a single number, never a range.',
  },
  {
    field: 'performed.set',
    columns: ['exercise_set_logs.weight', 'exercise_set_logs.weight_unit'],
    owner: { module: 'src/state/session-detail.ts', name: 'loggedSet' },
    meaning: 'The one weight actually used for a logged set, in the unit it was logged in.',
  },
  {
    field: 'performed.movement',
    columns: ['block_movement_results.weight', 'block_movement_results.weight_unit'],
    owner: { module: 'src/state/session-detail.ts', name: 'movementActualReadings' },
    meaning: 'The weight actually used for one timed movement, in the unit it was logged in.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Meanings
// ─────────────────────────────────────────────────────────────────────────────

/** What a `load_value` is, for each kind of guidance. */
export type LoadValueKind = 'weight' | 'percent-of-1rm' | 'reps-in-reserve' | 'none'

export interface LoadMeaning {
  readonly value: LoadValueKind
  /** Whether the value is a weight, and so stated in the profile’s unit. */
  readonly weightUnit: boolean
  readonly meaning: string
}

/**
 * Each kind of guidance, total over the enum: a seventh kind fails to compile
 * here as it does in `loadText`.
 */
export const LOAD_MEANINGS = {
  absolute: { value: 'weight', weightUnit: true, meaning: 'A target weight, in the profile’s unit.' },
  percent_1rm: { value: 'percent-of-1rm', weightUnit: false, meaning: 'A share of the one-repetition maximum; no unit.' },
  rir: { value: 'reps-in-reserve', weightUnit: false, meaning: 'Repetitions left in reserve; an effort, not a weight.' },
  bodyweight: { value: 'none', weightUnit: false, meaning: 'The body is the load; no value.' },
  prior_session: { value: 'none', weightUnit: false, meaning: 'Repeat the weight last used; no value is invented.' },
  none: { value: 'none', weightUnit: false, meaning: 'Unloaded; nothing is shown, which is not zero.' },
} as const satisfies Readonly<Record<LoadGuidance, LoadMeaning>>

// ─────────────────────────────────────────────────────────────────────────────
// Definition dependencies (AC-R036-03)
// ─────────────────────────────────────────────────────────────────────────────

export type LoadDependencyId = 'LOAD-RANGE-RULE' | 'LOAD-PER-HAND'

export interface LoadDefinitionDependency {
  readonly id: LoadDependencyId
  readonly owner: 'Eric'
  /** What cannot be read until it is defined. */
  readonly blocks: string
  /** Why current source does not establish it. */
  readonly reason: string
  /** What continues meanwhile, independently supported. */
  readonly continues: string
}

export const LOAD_DEFINITION_DEPENDENCIES: readonly LoadDefinitionDependency[] = [
  {
    id: 'LOAD-RANGE-RULE',
    owner: 'Eric',
    blocks: 'A rough suggested load range in the prescription row (R04).',
    reason:
      'A prescription stores one load_value, the OVR-01c suggestion is one number, and the prompt’s LOAD GUIDANCE bands are composition instructions stored nowhere.',
    continues: 'The single prescribed target through loadText, in both contexts (TASK-003).',
  },
  {
    id: 'LOAD-PER-HAND',
    owner: 'Eric',
    blocks: 'An explicit per-hand statement or a doubled/halved number for paired implements.',
    reason:
      'No column or catalog attribute records whether a movement uses one implement or two; the logger has one Weight field.',
    continues: 'The stored number, unchanged, beside the implement’s name (R04: no explanatory prose).',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Readings
// ─────────────────────────────────────────────────────────────────────────────

/** The persisted prescription columns a prescribed load is read from. */
export interface PrescribedLoadColumns {
  readonly load_type: LoadGuidance | null
  readonly load_value: number | null
  readonly equipment_used: string
}

/** A prescribed target. Never a performed weight; never a range. */
export interface PrescribedLoad {
  readonly role: 'prescribed-target'
  readonly loadType: LoadGuidance | null
  readonly value: LoadValueKind
  /** The stored `load_value`, unconverted. */
  readonly amount: number | null
  /** The unit an absolute target is read in: the profile’s, or null while unread. */
  readonly unit: WeightUnit | null
  /** `loadText`’s words, or null when the prescription states no load. */
  readonly text: string | null
  /** The implement, as `equipmentName` names it. */
  readonly implement: string
  /** Not stated by any current input (`LOAD-PER-HAND`). */
  readonly perHand: { readonly stated: false; readonly dependency: 'LOAD-PER-HAND' }
  /** No production rule exists (`LOAD-RANGE-RULE`). */
  readonly range: null
  readonly rangeDependency: 'LOAD-RANGE-RULE'
}

/**
 * A prescription's target load, through `loadText` and the profile's unit.
 * It reads the prescription alone: no logged weight can reach it.
 */
export function prescribedLoad(
  columns: PrescribedLoadColumns,
  weightUnit: WeightUnit | null,
): PrescribedLoad {
  const { load_type: loadType, load_value: amount } = columns
  const meaning = loadType === null ? null : LOAD_MEANINGS[loadType]
  return {
    role: 'prescribed-target',
    loadType,
    value: meaning?.value ?? 'none',
    amount: meaning === null || meaning.value === 'none' ? null : amount,
    unit: meaning?.weightUnit === true ? weightUnit : null,
    text: loadType === null ? null : loadText(loadType, amount, weightUnit),
    implement: equipmentName(columns.equipment_used),
    perHand: { stated: false, dependency: 'LOAD-PER-HAND' },
    range: null,
    rangeDependency: 'LOAD-RANGE-RULE',
  }
}

/** A logged row's actual weight columns. */
export interface PerformedLoadColumns {
  readonly weight: number | null
  readonly weight_unit: WeightUnit
}

/** The one weight actually used, in the unit it was logged in. */
export interface PerformedLoad {
  readonly role: 'performed'
  readonly weight: number
  readonly unit: WeightUnit
}

/**
 * A logged row's actual weight, or null when none was recorded — which is not
 * zero and is never filled from the prescription. The row's own unit is kept:
 * it is not converted into the profile's.
 */
export function performedLoad(row: PerformedLoadColumns): PerformedLoad | null {
  return row.weight === null ? null : { role: 'performed', weight: row.weight, unit: row.weight_unit }
}
