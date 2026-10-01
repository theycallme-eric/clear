/**
 * EXE-01's presentation: the parts of the workout shell that are not the
 * renderers — `GlobalTimer`, `ProgressTracker`, `SectionHeader`,
 * `RestTimerBar` (EXE-05) and `WorkoutNavigation` (IA.md §3, layer 4).
 *
 * All four are app-owned domain components rather than design-system ones, and
 * `GlobalTimer` is the interesting case: the export ships `TimerDisplay`, but
 * it is a *countdown* — its accessible name is "Time remaining" and its low
 * state is time pressure. The session timer counts up and has no deadline, so
 * it composes the same shipped chamfer and the same timer tokens rather than
 * borrowing a component whose meaning is the opposite. `SectionTimer` (EXE-03)
 * is the one that composes `TimerDisplay`, exactly as the IA says.
 *
 * It also holds the one surface that is not the shell's alone:
 * `AbandonConfirmDialog`. Three places can end a session early — the shell's
 * header, a navigation the shell is holding, and Home's resumption card — and
 * the requirement's promise is about the *act* rather than the surface, so the
 * question is asked in one set of words from one component.
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
  Plus,
  Progress,
  Pulse,
  Rest,
  Stopwatch,
  Superset,
  Button,
  TimerDisplay,
  X,
} from '../design-system/index'
import { REST_EXTENSION_SECONDS, spokenRest, useRestTimer } from '../state/rest'
import { formatElapsed, spokenElapsed } from '../state/workout-clock'
import type {
  SectionProgress,
  SectionStatus,
  SessionProgress,
  StructureGlyph,
  StructureIdentity,
} from '../state/workout-progress'
import { ConfirmDialog } from './blocking-dialog'
import { ActionRow } from './composition'
import { Heading } from './Heading'
import './rest-timer-bar.css'

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
    // `Screen` already establishes level two for its top-level content. This
    // section title is that level-two heading; the block/exercise sections
    // that follow advance themselves to level three. Wrapping this heading in
    // `HeadingSection` skipped h2 and made the live Workout outline invalid.
    <section className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
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
    </section>
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
// Abandoning
// ─────────────────────────────────────────────────────────────────────────────

export interface AbandonConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  /** The safe exit: the cancel action, Esc, and the backdrop all land here. */
  onCancel: () => void
}

/**
 * The one question every abandon path asks, in the one set of words.
 *
 * Pattern 4 of the export's `patterns.md`: the title names the consequence as
 * a question, the body says exactly what is kept and what is lost, and the
 * confirm button repeats the verb rather than saying "OK". The body is precise
 * about the disposition because that is what the user is deciding on — the
 * logged work survives (abandoning is a state, not a delete), and what does not
 * survive is the session's own resumability and its claim on the streak, which
 * counts completed sessions (SES-01c).
 */
export function AbandonConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: AbandonConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      critical
      title="Abandon workout?"
      confirmLabel="Abandon"
      cancelLabel="Keep going"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      Everything logged so far is kept. The workout stops here: it cannot be
      picked back up, and it does not count towards your streak.
    </ConfirmDialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest
// ─────────────────────────────────────────────────────────────────────────────

/** The last stretch of a rest, where the fill takes the timer's urgency colour. */
const REST_URGENT_SECONDS = 10

/**
 * The session's one rest, between sets (EXE-05).
 *
 * Everything it draws is `useRestTimer`'s, so it has no count of its own: the
 * remaining seconds are the wall clock's reading of the rest the shell holds,
 * which is what makes the bar right on the first paint after the phone unlocks.
 *
 * It is absent rather than empty. No rest running, a rest skipped, and a rest
 * run out all draw nothing — never a bar at zero, and never `Rest: 0s`. And it
 * carries no entrance: the bar appears in the same tap that logs a set, and
 * the IA is explicit that no list or route motion fires while a set is being
 * logged. The only moving parts are the digits, which tumble when they change,
 * and the fill, which steps.
 */
export function RestTimerBar() {
  const { rest, remainingSeconds, extend, skip } = useRestTimer()

  if (rest === null || remainingSeconds <= 0) return null

  const fraction = rest.totalSeconds > 0 ? remainingSeconds / rest.totalSeconds : 0
  const urgent = remainingSeconds <= REST_URGENT_SECONDS

  return (
    <section
      aria-label="Rest"
      className="clr-rest-bar clr-stack--tight"
      data-urgent={urgent ? 'true' : 'false'}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div className="clr-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <p
          style={{
            margin: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-100)',
            fontFamily: 'var(--font-data)',
            fontSize: 'var(--label-xs-size)',
            letterSpacing: 'var(--tracking-data)',
            textTransform: 'uppercase',
            color: 'var(--text-card-label)',
          }}
        >
          <span aria-hidden="true" style={{ display: 'flex' }}>
            <Rest />
          </span>
          Rest after {rest.label}
        </p>
        <TimerDisplay seconds={remainingSeconds} lowThreshold={REST_URGENT_SECONDS} />
      </div>
      {urgent && (
        <p
          role="status"
          aria-live="polite"
          style={{ ...labelStyle, color: 'var(--text-timer-low)' }}
        >
          Final 10 seconds
        </p>
      )}
      <span className="a11y-hidden">{spokenRest(remainingSeconds)}</span>

      <div className="clr-rest-bar__track" aria-hidden="true">
        <div
          className="clr-rest-bar__fill"
          style={{ width: `${Math.round(fraction * 1000) / 10}%` }}
        />
      </div>

      <div className="clr-row" style={{ justifyContent: 'space-between' }}>
        <Button variant="secondary" icon={<Plus />} onClick={() => extend()}>
          Add {REST_EXTENSION_SECONDS}s
        </Button>
        <Button variant="quiet" icon={<X />} onClick={skip}>
          Skip rest
        </Button>
      </div>
    </section>
  )
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
    <ActionRow
      as="nav"
      aria-label="Workout sections"
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
    </ActionRow>
  )
}
