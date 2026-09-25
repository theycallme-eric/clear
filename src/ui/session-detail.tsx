/**
 * HIST-01's detail, as the app-owned parts it needs (ATOMIC.md §11: a layer-4
 * part composes from the export rather than arriving in it).
 *
 * Four parts, each one a reading of something the reconstruction already
 * decided — none of them derives anything. `src/state/session-detail.ts` turns
 * the payload into words and these turn the words into markup, which is what
 * keeps "what a `0` means" out of a component.
 *
 *   · `SessionProvenance` — which of the three questions produced this, and when
 *     it resolves. One quiet line, and load-bearing: the same session reads
 *     three ways.
 *   · `StructureResultBadge` — the block's structure beside what its result
 *     measured. A block nobody scored says so instead of showing zeroes.
 *   · `LoggedSetTable` — weight, reps and RPE per set, as a real table, because
 *     that is what it is: rows of sets and columns of measurements.
 *   · `SessionSectionCard` — one section of the workout, disclosed.
 *
 * Nothing here is interactive except the disclosure. This is a record of
 * something that already happened, so there is no control that would change it.
 */
import type { CSSProperties, ReactNode } from 'react'

import { CircleCheck, CircleX, Log, Pause } from '../design-system/index'
import type {
  BlockDetailView,
  DetailProvenance,
  ExerciseDetailView,
  LoggedSetView,
  SectionDetailView,
} from '../state/session-detail'
import { Card } from './card'
import { CollapsibleSection } from './collapsible-section'
import { StructureBadge } from './workout-chrome'

// ─────────────────────────────────────────────────────────────────────────────
// Shared type
// ─────────────────────────────────────────────────────────────────────────────

const DATA_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-label)',
  margin: 0,
}

const VALUE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-sm-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-body)',
}

const MOVEMENT_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h6-size)',
  color: 'var(--text-card-header)',
  margin: 0,
  textTransform: 'capitalize',
}

const GLYPH_ROW_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--spacing-100)',
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data-wide)',
  textTransform: 'uppercase',
}

const STACK_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacing-200)',
}

// ─────────────────────────────────────────────────────────────────────────────
// Provenance
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionProvenanceProps {
  provenance: DetailProvenance
}

/**
 * Where this reading came from. `As performed · read at 24 Sep 2026, 09:00`,
 * and when the payload resolves at no instant at all — an intended-at-start
 * answer for a session nobody started — the line says that rather than dropping
 * to the label alone, because the missing instant is the reason the rows below
 * are thin.
 */
export function SessionProvenance({ provenance }: SessionProvenanceProps) {
  return (
    <p style={DATA_STYLE}>
      {provenance.label}
      {' · '}
      {provenance.asOf === null ? 'no resolved moment' : `read at ${provenance.asOf}`}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A block's result
// ─────────────────────────────────────────────────────────────────────────────

export interface StructureResultBadgeProps {
  block: BlockDetailView
}

/**
 * What a block is, and what its result said. The structure identity is the same
 * `StructureBadge` the workout shell uses, so a circuit reads the same in the
 * record as it did while it was being performed.
 *
 * An unscored block is stated in words. It is a real and ordinary case — a
 * session left unfinished has blocks nobody ever scored — and a row of dashes
 * or zeroes would read as a measurement of nothing.
 */
export function StructureResultBadge({ block }: StructureResultBadgeProps) {
  return (
    <div className="clr-row" style={{ flexWrap: 'wrap', gap: 'var(--spacing-200)' }}>
      <StructureBadge identity={block.identity} />
      {block.scored ? (
        <>
          {block.outcome.map((measurement) => (
            <Measurement
              key={measurement.label}
              label={measurement.label}
              value={measurement.value}
            />
          ))}
          {block.perceivedEffort !== null && (
            <Measurement label="Effort" value={block.perceivedEffort} />
          )}
        </>
      ) : (
        <span style={DATA_STYLE}>Not scored</span>
      )}
    </div>
  )
}

/** One reading: what was measured, then what it said. */
function Measurement({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span
      className="clr-chamfer clr-chamfer--sm"
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 'var(--spacing-100)',
        padding: 'var(--spacing-50) var(--spacing-200)',
      }}
    >
      <span style={DATA_STYLE}>{label}</span>
      <span style={VALUE_STYLE}>{value}</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Logged sets
// ─────────────────────────────────────────────────────────────────────────────

export interface LoggedSetTableProps {
  sets: readonly LoggedSetView[]
  /** Names the table for assistive tech: "Sets logged for back squat". */
  label: string
}

/**
 * The sets, as a table. Weight, reps and RPE are the three columns the
 * requirement names; time and distance appear only when a set was measured that
 * way, so a barbell session is not read through two empty columns.
 *
 * An unlogged column is an en dash with a spoken equivalent, never a zero: a
 * set logged without an RPE is a set whose effort nobody recorded, and `0`
 * would be an effort of zero.
 */
export function LoggedSetTable({ sets, label }: LoggedSetTableProps) {
  const showsDuration = sets.some((set) => set.duration !== null)
  const showsDistance = sets.some((set) => set.distance !== null)
  const showsWarmup = sets.some((set) => set.isWarmup)

  return (
    <table
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        textAlign: 'left',
      }}
    >
      <caption style={{ ...DATA_STYLE, textAlign: 'left', paddingBottom: 'var(--spacing-100)' }}>
        {label}
      </caption>
      <thead>
        <tr>
          <HeaderCell>Set</HeaderCell>
          <HeaderCell>Weight</HeaderCell>
          <HeaderCell>Reps</HeaderCell>
          <HeaderCell>RPE</HeaderCell>
          {showsDuration && <HeaderCell>Time</HeaderCell>}
          {showsDistance && <HeaderCell>Distance</HeaderCell>}
        </tr>
      </thead>
      <tbody>
        {sets.map((set) => (
          <tr key={set.key}>
            <th scope="row" style={{ ...cellStyle, ...DATA_STYLE }}>
              {set.setNumber}
              {showsWarmup && set.isWarmup && ' · warm-up'}
            </th>
            <DataCell value={set.weight} />
            <DataCell value={set.reps} />
            <DataCell value={set.rpe} />
            {showsDuration && <DataCell value={set.duration} />}
            {showsDistance && <DataCell value={set.distance} />}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const cellStyle: CSSProperties = {
  padding: 'var(--spacing-100) var(--spacing-200) var(--spacing-100) 0',
  borderBottom: 'var(--border-width) solid var(--border-card)',
  verticalAlign: 'baseline',
}

function HeaderCell({ children }: { children: ReactNode }) {
  return (
    <th scope="col" style={{ ...cellStyle, ...DATA_STYLE, textTransform: 'uppercase' }}>
      {children}
    </th>
  )
}

/** A logged value, or the honest absence of one. */
function DataCell({ value }: { value: string | null }) {
  return (
    <td style={{ ...cellStyle, ...VALUE_STYLE }}>
      {value ?? (
        <>
          <span aria-hidden="true">–</span>
          <span className="a11y-hidden">not logged</span>
        </>
      )}
    </td>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A section
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionSectionCardProps {
  section: SectionDetailView
  /** Sections start open; a screen with a long record may say otherwise. */
  defaultExpanded?: boolean
}

/**
 * One section of the workout: its blocks, each with its result and its
 * movements. Disclosed rather than always-open, because a full session is long
 * — and `CollapsibleSection` keeps collapsed content in the accessibility tree,
 * so nothing here is hidden from a screen reader or from find-in-page.
 */
export function SessionSectionCard({
  section,
  defaultExpanded = true,
}: SessionSectionCardProps) {
  return (
    <Card>
      <CollapsibleSection label={section.title} defaultExpanded={defaultExpanded}>
        <div style={STACK_STYLE}>
          {section.blocks.map((block) => (
            <div key={block.id} style={STACK_STYLE}>
              <StructureResultBadge block={block} />
              {block.notes !== null && (
                <p style={{ ...VALUE_STYLE, margin: 0 }}>{block.notes}</p>
              )}
              {block.exercises.map((exercise) => (
                <LoggedExercise key={exercise.id} exercise={exercise} />
              ))}
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </Card>
  )
}

/** The glyph each execution status carries. Colour is never the only cue. */
const STATUS_GLYPH: Record<ExerciseDetailView['status'], ReactNode> = {
  completed: <CircleCheck size={16} />,
  skipped: <CircleX size={16} />,
  not_started: <Pause size={16} />,
}

/**
 * One prescription and what was logged against it.
 *
 * The lineage label is what makes a swap readable rather than confusing: an
 * `as performed` answer contains both halves of one, and a reader looking at
 * two movements in a slot that prescribed one deserves to be told which is
 * which.
 */
function LoggedExercise({ exercise }: { exercise: ExerciseDetailView }) {
  return (
    <div style={STACK_STYLE}>
      <div className="clr-row" style={{ flexWrap: 'wrap', gap: 'var(--spacing-200)' }}>
        <p style={MOVEMENT_STYLE}>{exercise.name}</p>
        <span style={DATA_STYLE}>{exercise.prescription}</span>
        <span style={GLYPH_ROW_STYLE}>
          {STATUS_GLYPH[exercise.status]}
          {exercise.statusLabel}
        </span>
        {exercise.lineageLabel !== null && (
          <span style={GLYPH_ROW_STYLE}>
            <Log size={16} />
            {exercise.lineageLabel}
          </span>
        )}
      </div>
      {exercise.sets.length === 0 ? (
        <p style={DATA_STYLE}>No sets logged</p>
      ) : (
        <LoggedSetTable sets={exercise.sets} label={`Sets logged for ${exercise.name}`} />
      )}
    </div>
  )
}
