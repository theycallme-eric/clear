/**
 * The verified equipment asset inventory (TASK-029; REQ-029, C56; R122, R132).
 *
 * Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=assets`; shared owners "Existing Icons /
 * EquipmentSummary / movement identity". The authority record is
 * `docs/design/library/refinements-2026-11-04/authority/EQUIPMENT-ICON-WANTED-LIST.md`;
 * this module states the same inventory in source, so the gallery and the
 * focused checks read one list rather than a copy of it.
 *
 *   · The shipped icon family is `src/design-system/assets/icons.tsx`: 75 named
 *     icons in one solid, angular family, with one approved exception — the
 *     four round, line-drawn mood faces. Set and block Effort reuse three of
 *     them. Nothing here redraws, replaces or adds an icon.
 *   · Two of the 75 are equipment-meaningful: `Dumbbell` (dumbbells, and the
 *     Required equipment group's category glyph) and `WeightPlate` (plates
 *     only; never a stand-in for missing equipment).
 *   · The equipment taxonomy is Setup's and Locations' own `EQUIPMENT`
 *     (`src/state/onboarding.ts`, the catalog's ids). This inventory reads it;
 *     it adds no id. Medicine ball is wanted from the Wall ball review, where it
 *     is a composed movement's equipment, and has no Setup id here.
 *
 * Readable fallback (R132, AC-R029-02): the selected compact placement beside a
 * movement name is the readable equipment label. A missing glyph never blocks
 * that label and never leaves equipment as an icon alone; drawing and adopting
 * new glyphs is the recorded follow-up, not this module's work.
 *
 * Presentation record only: no field, write or derivation lives here
 * (LOGGING-FIELDS.md).
 */
import { EQUIPMENT } from '../../state/onboarding'

/** The verified size of the shipped icon family, unchanged by this inventory. */
export const SHIPPED_ICON_COUNT = 75

/** The approved round, line-drawn exception. Nothing else in the family is round. */
export const ROUND_FACE_EXCEPTION = ['Frown', 'Meh', 'Smile', 'SmilePlus'] as const

/** The faces set and block Effort reuse, in their scale order. */
export const EFFORT_FACES = ['Frown', 'Meh', 'Smile'] as const

export type ShippedEquipmentGlyph = 'Dumbbell' | 'WeightPlate'

export interface ShippedEquipmentIcon {
  readonly glyph: ShippedEquipmentGlyph
  /** What the glyph means, and the only meaning it may carry. */
  readonly meaning: string
}

/** The two shipped icons with an equipment meaning. */
export const SHIPPED_EQUIPMENT_ICONS: readonly ShippedEquipmentIcon[] = [
  { glyph: 'Dumbbell', meaning: 'Dumbbells, and the Required equipment category glyph' },
  { glyph: 'WeightPlate', meaning: 'Plates only, never a substitute for missing equipment' },
]

/** Whether an equipment kind has a shipped glyph, or one is on the wanted list. */
export type EquipmentAssetStatus = 'shipped' | 'wanted'

/** The proposed next step for a kind's artwork: a review ordering, not an approved asset. */
export type EquipmentAssetNext = 'reuse' | 'first-batch' | 'text-decision' | 'catalog-backlog'

export interface EquipmentAsset {
  /** The Setup / Locations equipment id: the catalog's, never invented here. */
  readonly id: string
  /** Setup's own label, the readable fallback wherever a glyph is missing. */
  readonly label: string
  /** The shipped glyph for this kind, or null where one is wanted. */
  readonly glyph: ShippedEquipmentGlyph | null
  readonly status: EquipmentAssetStatus
  readonly next: EquipmentAssetNext
}

/** The one Setup id a shipped glyph means. */
const SHIPPED_GLYPH_BY_ID: Readonly<Record<string, ShippedEquipmentGlyph>> = { dumbbells: 'Dumbbell' }

/** Proposed first comparison batch (R122), and the text-versus-glyph question for Bodyweight. */
const NEXT_BY_ID: Readonly<Record<string, EquipmentAssetNext>> = {
  dumbbells: 'reuse',
  kettlebells: 'first-batch',
  barbell: 'first-batch',
  bodyweight: 'text-decision',
}

/** Every Setup equipment id, in Setup's order, with its verified glyph status. */
export const EQUIPMENT_ASSETS: readonly EquipmentAsset[] = EQUIPMENT.map(({ value, label }) => {
  const glyph = SHIPPED_GLYPH_BY_ID[value] ?? null
  return {
    id: value,
    label,
    glyph,
    status: glyph === null ? 'wanted' : 'shipped',
    next: NEXT_BY_ID[value] ?? 'catalog-backlog',
  }
})

export interface WantedReviewLabel {
  /** The readable label a composed movement shows. */
  readonly label: string
  /** The composed equipment value it is read from. */
  readonly equipment: string
  /** Deliberately none: catalog coverage is resolved separately (R132). */
  readonly setupId: null
  readonly next: EquipmentAssetNext
}

/** Wanted glyphs for equipment a review showed that is not a Setup id. */
export const WANTED_REVIEW_LABELS: readonly WantedReviewLabel[] = [
  { label: 'Medicine ball', equipment: 'medicine-ball', setupId: null, next: 'first-batch' },
]

/** The shipped glyph for a Setup equipment id, or null where the readable label stands alone. */
export function equipmentGlyph(id: string): ShippedEquipmentGlyph | null {
  return SHIPPED_GLYPH_BY_ID[id] ?? null
}
