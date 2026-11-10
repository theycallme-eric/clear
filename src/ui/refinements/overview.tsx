/**
 * Accepted Overview facts, equipment and summary frames (TASK-004; REQ-004,
 * C12, C13, C14, C15, G04; R12, R20, R26, R27, R32, R33, R34, R74, R107, R131).
 *
 * Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=overview`; REUSE.md names the shared owner
 * "SummaryFacts / EquipmentSummary / summary metrics". The accepted Overview
 * (R74) is the reviewed R7 composition: wrapping glyph-led facts, intensity
 * without `of 10`, a separator, then one Required equipment group of
 * uppercase names, `None — bodyweight only` for an all-bodyweight workout.
 *
 *   · `OverviewFacts` — the one fact composition Review's Overview and a saved
 *     workout's Overview both draw (C14, R20): `SummaryFacts` / `SummaryFact`
 *     from `../composition`, with one glyph, one order and one rule for which
 *     terms stay visible per kind of reading. Each view supplies its own
 *     recorded values and its own term (`Anchor` in Review, `Focus` in a saved
 *     record); the composition never derives or rewrites a value.
 *   · `EquipmentSummary` — the Required equipment group (C13, R27, R34): the
 *     label with the one shipped equipment glyph (never one per kind — R122's
 *     wanted list is separate), then the names as one wrapping group, each
 *     name its own uppercase element. The empty state is said, not drawn as
 *     an empty list, and only a workout with no equipment reaches it.
 *   · `SummaryMetric` — one key number in its own small card (U41), the card
 *     the completed Summary's Duration and Streak are drawn in. Inside a
 *     `MetricGrid` the card fills its equal-height cell (shell.css, C15, R107),
 *     so neighbouring frames end at one bottom edge.
 *
 * Presentation only (LOGGING-FIELDS.md): no field, write or derivation lives
 * here. Values, equipment truth and streak state stay with their owners.
 */
import { useId, type CSSProperties, type ReactNode } from 'react'

import {
  Calendar,
  Clock,
  Crosshair,
  Dumbbell,
  Gauge,
  Log,
  Target,
} from '../../design-system/index'
import type { FactKind } from '../../state/review'
import { Card } from '../card'
import { MetricFrame, SummaryFact, SummaryFacts } from '../composition'
import './tokens.css'
import './presentation.css'

// ─────────────────────────────────────────────────────────────────────────────
// Facts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a reading is, declared by the view that owns its value (`FactKind`,
 * `state/review.ts`). The kind picks the glyph, the order and whether the term
 * is visible; it never picks a word.
 */
export type OverviewFactKind = FactKind

export interface OverviewFact {
  readonly kind: OverviewFactKind
  /** The view's own term for the reading. Always kept for assistive technology. */
  readonly term: string
  /** The view's own recorded value, already in words. */
  readonly value: string
}

/**
 * One public system glyph per kind, each a clear semantic fit (R33); the
 * accepted Overview's (R74). Status has none: no single glyph is true of
 * completed, abandoned and unstarted alike, so its term says what it is.
 */
const FACT_GLYPHS: Readonly<Record<OverviewFactKind, ReactNode>> = {
  duration: <Clock size={16} />,
  focus: <Target size={16} />,
  intensity: <Gauge size={16} />,
  goal: <Crosshair size={16} />,
  movements: <Log size={16} />,
  date: <Calendar size={16} />,
  status: undefined,
}

/**
 * The accepted Overview's order — duration, focus and intensity, then the goal
 * and the movement count — and a saved record's own date and status after the
 * readings it shares with the plan, in that order.
 */
const FACT_ORDER: readonly OverviewFactKind[] = [
  'duration',
  'focus',
  'intensity',
  'goal',
  'movements',
  'date',
  'status',
]

/**
 * Readings whose glyph and value already say what they are (`45 min`,
 * `Upper body`, `Sat 8 Nov 2026`); their term stays for assistive technology.
 * Intensity, goal, the movement count and a status keep a visible term: `7`,
 * `Strength`, `6` and `Completed` are not readable without one.
 */
const SELF_DESCRIBING: ReadonlySet<OverviewFactKind> = new Set(['duration', 'focus', 'date'])

export interface OverviewFactsProps {
  /** The description list's accessible name (`Workout facts`). */
  label: string
  facts: readonly OverviewFact[]
}

/**
 * C12, C14, R26: every useful fact visible, whole readings wrapping onto
 * further rows — no carousel, rail, arrow or tab stop. Facts of one kind keep
 * the order they were given.
 */
export function OverviewFacts({ label, facts }: OverviewFactsProps) {
  const ordered = [...facts].sort(
    (a, b) => FACT_ORDER.indexOf(a.kind) - FACT_ORDER.indexOf(b.kind),
  )
  return (
    <SummaryFacts aria-label={label} data-overview-facts="">
      {ordered.map((fact) => (
        <SummaryFact
          key={`${fact.kind}:${fact.term}`}
          glyph={FACT_GLYPHS[fact.kind]}
          term={fact.term}
          termHidden={SELF_DESCRIBING.has(fact.kind)}
        >
          {fact.value}
        </SummaryFact>
      ))}
    </SummaryFacts>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Required equipment
// ─────────────────────────────────────────────────────────────────────────────

/** The equipment group's label, and the list it names. */
export const EQUIPMENT_LABEL = 'Required equipment'
/** An all-bodyweight workout, said rather than shown as an empty list. */
export const NO_EQUIPMENT_LABEL = 'None — bodyweight only'

export interface EquipmentSummaryProps {
  /**
   * Each piece of equipment the workout's own rows name, once, in the order it
   * is first needed, bodyweight excluded. Empty means the workout needs none.
   */
  equipment: readonly string[]
}

/**
 * C13, R27, R34, R74: one deliberate group under the facts, set off by a rule
 * — the label beside the shipped equipment glyph, then the names, each its own
 * uppercase element, wrapping. Read-only: nothing here is a control.
 *
 * A label and a reading rather than paragraphs: an Overview carries no prose
 * (REQ-010), and this is a reading, not a sentence.
 */
export function EquipmentSummary({ equipment }: EquipmentSummaryProps) {
  const labelId = useId()
  return (
    <div className="clr-equipment-summary" data-equipment-summary="">
      <span id={labelId} className="clr-text-data-xs clr-text-data-xs--upper clr-equipment-summary__label">
        <span aria-hidden="true" className="clr-equipment-summary__glyph">
          <Dumbbell size={16} />
        </span>
        {EQUIPMENT_LABEL}
      </span>
      {equipment.length === 0 ? (
        <span className="clr-equipment-summary__empty" data-equipment-none="">
          {NO_EQUIPMENT_LABEL}
        </span>
      ) : (
        <ul aria-labelledby={labelId} className="clr-equipment-summary__list">
          {equipment.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary metrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * U41: every key number is drawn at this one size, so the duration and the
 * streak read as a pair rather than as a number beside a sentence.
 */
const METRIC_VALUE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h4-size)',
  lineHeight: 'var(--heading-h4-line-height)',
  color: 'var(--text-card-header)',
}

const METRIC_NOTE_STYLE: CSSProperties = {
  margin: 0,
  color: 'var(--text-secondary)',
}

export interface SummaryMetricProps {
  label: string
  /** A qualifier under the number, in the secondary role (`Through yesterday`). */
  note?: string
  children: ReactNode
}

/**
 * One key number in its own small card, its label the card's heading. The
 * readout inside drops its own frame, so there is never a frame in a frame;
 * in a metric row the card is the cell's one frame and fills it (C15).
 */
export function SummaryMetric({ label, note, children }: SummaryMetricProps) {
  return (
    <Card heading={label} padding="sm" data-summary-metric="">
      <MetricFrame>
        <p data-metric-value="" style={METRIC_VALUE_STYLE}>
          {children}
        </p>
        {note === undefined ? null : <p style={METRIC_NOTE_STYLE}>{note}</p>}
      </MetricFrame>
    </Card>
  )
}
