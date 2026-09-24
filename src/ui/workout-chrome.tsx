/**
 * EXE-01's presentation: the four parts of the workout shell that are not the
 * renderers — `GlobalTimer`, `ProgressTracker`, `SectionHeader` and
 * `WorkoutNavigation` (IA.md §3, layer 4).
 *
 * All four are app-owned domain components rather than design-system ones, and
 * `GlobalTimer` is the interesting case: the export ships `TimerDisplay`, but
 * it is a *countdown* — its accessible name is "Time remaining" and its low
 * state is time pressure. The session timer counts up and has no deadline, so
 * it composes the same shipped chamfer and the same timer tokens rather than
 * borrowing a component whose meaning is the opposite. `SectionTimer` (EXE-03)
 * is the one that composes `TimerDisplay`, exactly as the IA says.
 *
 * Operational-screen rules, from the export's pattern 6:
 *   · the timer is labelled once and is **not** a live region — announcing
 *     every second makes the rest of the screen unusable;
 *   · status is never colour alone — a finished section carries a tick and the
 *     word, a current one carries `aria-current`;
 *   · the destructive action does not sit beside the frequently-pressed one,
 *     which is why Abandon belongs to the header and Next to the footer.
 */
import type { CSSProperties, ReactNode } from 'react'

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circuit,
  Dumbbell,
  Ladder,
  Progress,
  Pulse,
  Stopwatch,
  Superset,
  Button,
} from '../design-system/index'
import { formatElapsed, spokenElapsed } from '../state/workout-clock'
import type {
  SectionProgress,
  SectionStatus,
  SessionProgress,
  StructureGlyph,
  StructureIdentity,
} from '../state/workout-progress'
import { Heading, HeadingSection } from './Heading'

// ─────────────────────────────────────────────────────────────────────────────
// Global timer
// ─────────────────────────────────────────────────────────────────────────────

export interface GlobalTimerProps {
  /** Seconds since `started_at`, read from the wall clock by the caller. */
  seconds: number
}

/**
 * The session's elapsed time. The digits are decorative and the accessible
 * value is spoken in words, so a screen reader hears "12 minutes 30 seconds"
 * rather than "12 colon 30" — and hears it only when the user asks, because
 * `role="timer"` here is labelled, not live.
 */
export function GlobalTimer({ seconds }: GlobalTimerProps) {
  return (
    <div
      role="timer"
      aria-label="Session time"
      className="clr-chamfer clr-chamfer--md clr-chamfer--timer"
      style={{
        display: 'inline-flex',
        justifyContent: 'center',
        padding: 'var(--spacing-100) var(--spacing-300)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--label-lg-size)',
          fontWeight: 'var(--font-weight-bold)',
          letterSpacing: 'var(--tracking-data)',
          color: 'var(--text-timer)',
        }}
      >
        {formatElapsed(seconds)}
      </span>
      <span className="a11y-hidden">{spokenElapsed(seconds)}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_WORDS: Readonly<Record<SectionStatus, string>> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
}

export interface ProgressTrackerProps {
  progress: SessionProgress
  /** The section the shell currently has open. */
  currentIndex: number
  /** Jump straight to a section. Omit to render the tracker read-only. */
  onSelect?: (index: number) => void
}

/**
 * The session's sections, their statuses, and where the user is.
 *
 * The bar is determinate because the progress is real — sections resolved out
 * of sections prescribed — and segmented so it reads as an instrument scale
 * rather than a percentage. The list beneath it is the part that carries the
 * status: the bar alone cannot say *which* section is unfinished.
 */
export function ProgressTracker({
  progress,
  currentIndex,
  onSelect,
}: ProgressTrackerProps) {
  const position = Math.min(currentIndex + 1, Math.max(progress.total, 1))

  return (
    <div className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
      <Progress
        value={progress.completed}
        max={progress.total}
        segments={progress.total}
        label={`Section ${position} of ${progress.total}`}
      />
      <ol
        aria-label="Sections"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--spacing-200)',
        }}
      >
        {progress.sections.map((section) => (
          <li key={section.sectionId}>
            <SectionChip
              section={section}
              current={section.index === currentIndex}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}

function SectionChip({
  section,
  current,
  onSelect,
}: {
  section: SectionProgress
  current: boolean
  onSelect?: (index: number) => void
}) {
  // The status word is in the accessible name, so the tick and the tint are
  // reinforcement rather than the message.
  const name = `${section.title}, ${STATUS_WORDS[section.status].toLowerCase()}`

  return (
    <Button
      variant={current ? 'primary' : 'quiet'}
      size="sm"
      aria-current={current ? 'step' : undefined}
      aria-label={name}
      disabled={onSelect === undefined}
      onClick={onSelect === undefined ? undefined : () => onSelect(section.index)}
      icon={<StatusGlyph status={section.status} />}
    >
      {section.title}
    </Button>
  )
}

function StatusGlyph({ status }: { status: SectionStatus }) {
  switch (status) {
    case 'complete':
      return <Check size={16} />
    case 'in_progress':
      return <Pulse size={16} />
    case 'not_started':
      return <ChevronRight size={16} />
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────────────────

export interface SectionHeaderProps {
  section: SectionProgress
  /** Position in the session, one-based, for the terse `3 / 6` readout. */
  position: number
  total: number
  children?: ReactNode
}

/**
 * The section's identity: what it is called, where it sits, and — the master
 * clarity spec's requirement — what *kind* of structure each of its blocks is.
 * An EMOM and an AMRAP over the same three movements are different workouts,
 * and this is the line that says which one the user is about to do.
 */
export function SectionHeader({
  section,
  position,
  total,
  children,
}: SectionHeaderProps) {
  return (
    <HeadingSection className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
      <p style={labelStyle}>
        Section {position} / {total} · {STATUS_WORDS[section.status]}
      </p>
      <Heading style={{ margin: 0 }}>{section.title}</Heading>
      <ul
        aria-label="Structures in this section"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--spacing-200)',
        }}
      >
        {section.blocks.map((block) => (
          <li key={block.blockId}>
            <StructureBadge identity={block.identity} />
          </li>
        ))}
      </ul>
      {children}
    </HeadingSection>
  )
}

export interface StructureBadgeProps {
  identity: StructureIdentity
}

/** `EMOM · 10 MIN`, with the glyph the export already ships for it. */
export function StructureBadge({ identity }: StructureBadgeProps) {
  const detail = [identity.detail, identity.repScheme].filter(Boolean).join(' · ')

  return (
    <span
      className="clr-chamfer clr-chamfer--sm clr-chamfer--structure"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacing-100)',
        padding: 'var(--spacing-50) var(--spacing-200)',
        ...labelStyle,
      }}
    >
      <StructureGlyphIcon glyph={identity.glyph} />
      {detail === '' ? identity.label : `${identity.label} · ${detail}`}
    </span>
  )
}

function StructureGlyphIcon({ glyph }: { glyph: StructureGlyph }) {
  switch (glyph) {
    case 'Circuit':
      return <Circuit size={16} />
    case 'Ladder':
      return <Ladder size={16} />
    case 'Superset':
      return <Superset size={16} />
    case 'Stopwatch':
      return <Stopwatch size={16} />
    case 'Dumbbell':
      return <Dumbbell size={16} />
  }
}

const labelStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkoutNavigationProps {
  /** False on the first section. */
  canGoBack: boolean
  /** False on the last one, where the forward action becomes completion. */
  canGoForward: boolean
  onPrevious: () => void
  onNext: () => void
  onFinish: () => void
  /** True while a lifecycle call is in flight. */
  busy?: boolean
}

/**
 * Previous, and then either Next or Finish. Two exits, and the destructive one
 * is not among them — abandoning lives in the header, away from the control the
 * user presses between every section.
 */
export function WorkoutNavigation({
  canGoBack,
  canGoForward,
  onPrevious,
  onNext,
  onFinish,
  busy = false,
}: WorkoutNavigationProps) {
  return (
    <nav
      aria-label="Workout sections"
      className="clr-row"
      style={{ justifyContent: 'space-between' }}
    >
      <Button
        variant="secondary"
        size="lg"
        icon={<ChevronLeft />}
        disabled={!canGoBack || busy}
        onClick={onPrevious}
      >
        Previous
      </Button>
      {canGoForward ? (
        <Button variant="primary" size="lg" icon={<ChevronRight />} disabled={busy} onClick={onNext}>
          Next section
        </Button>
      ) : (
        <Button variant="primary" size="lg" icon={<Check />} loading={busy} onClick={onFinish}>
          Finish workout
        </Button>
      )}
    </nav>
  )
}
