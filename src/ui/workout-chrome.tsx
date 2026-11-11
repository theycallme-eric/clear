/**
 * EXE-01's presentation: the parts of the workout shell that are not the
 * renderers — `GlobalTimer`, `ProgressTracker`, `SectionHeader`,
 * `RestTimerBar` (EXE-05) and `WorkoutNavigation` (IA.md §3, layer 4).
 *
 * All four are app-owned domain components rather than design-system ones, and
 * `GlobalTimer` is the interesting case: the export ships `TimerDisplay`, but
 * it is a *countdown* — its accessible name is "Time remaining" and its low
 * state is time pressure. The session timer counts up and has no deadline, so
 * it draws the app's shared whole timer body (`DeadlineTimer`,
 * `refinements/deadline-timer.tsx`, TASK-007) on the same timer tokens rather
 * than borrowing a component whose meaning is the opposite. Every live clock —
 * a movement's countdown, the rest, each format's clock — draws that one
 * frame, so they speak one vocabulary while each keeps its own clock (C21).
 *
 * TASK-007 (C19, R102, R103): a timer is one complete frame whose body fills
 * its place, with no accent-bar strip or second chamfer inside it. The rest is
 * one timer-role card — its accent bar, label, controls and low state are the
 * card's — holding that frame at the card's full width, and nothing here
 * floats a label or a readout outside the card it belongs to.
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
 *     which is why Abandon belongs to the header's menu (`WorkoutMenu`,
 *     REQ-019) and Next to the footer.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circuit,
  Dumbbell,
  IconButton,
  Ladder,
  LogOut,
  Menu,
  Plus,
  Progress,
  Pulse,
  Rest,
  Stopwatch,
  Superset,
  Button,
  X,
} from '../design-system/index'
import { restDeadline, type CountdownDeadline } from '../state/countdown-urgency'
import { REST_EXTENSION_SECONDS, useRestTimer } from '../state/rest'
import { restReading, sessionReading, type TimerReading } from '../state/timed-clock'
import type {
  SectionProgress,
  SectionStatus,
  SessionProgress,
  StructureGlyph,
  StructureIdentity,
} from '../state/workout-progress'
import { ConfirmDialog } from './blocking-dialog'
import { Card } from './card'
import { CollapsibleSection } from './collapsible-section'
import { Heading } from './Heading'
import { useInterfaceLoop } from './motion'
import { COUNTDOWN_WARNING_THRESHOLDS, countdownWarningState } from './refinements/countdown-warning'
import { DeadlineTimer } from './refinements/deadline-timer'
import './rest-timer-bar.css'
import './workout-navigation.css'
import './refinements/presentation.css'

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
 *
 * TASK-007 (C20, R53, R96, R119): the shared whole timer body
 * (`DeadlineTimer`) in its compact header placement — one frame, no accent
 * bar strip, the menu's height, digits centred — and never stretched across
 * the header. It reads the session clock and nothing else (C21): it counts up
 * and has no low state or deadline.
 */
export function GlobalTimer({ seconds }: GlobalTimerProps) {
  return <DeadlineTimer reading={sessionReading(seconds)} placement="header" />
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
 * status: the bar alone cannot say *which* section is unfinished. Both sit in
 * one card under its heading, so neither reads as a loose readout.
 */
export function ProgressTracker({
  progress,
  currentIndex,
  onSelect,
}: ProgressTrackerProps) {
  return (
    <Card heading="Sections">
      <SectionProgressBar progress={progress} currentIndex={currentIndex} />
      <SectionJumpList progress={progress} currentIndex={currentIndex} onSelect={onSelect} />
    </Card>
  )
}

/** Sections resolved out of sections prescribed, named by where the user is. */
function SectionProgressBar({
  progress,
  currentIndex,
}: Pick<ProgressTrackerProps, 'progress' | 'currentIndex'>) {
  const position = Math.min(currentIndex + 1, Math.max(progress.total, 1))

  return (
    <Progress
      value={progress.completed}
      max={progress.total}
      segments={progress.total}
      label={`Section ${position} of ${progress.total}`}
    />
  )
}

function SectionJumpList({
  progress,
  currentIndex,
  onSelect,
  inert,
}: ProgressTrackerProps & { inert?: boolean }) {
  return (
    <ol
      aria-label="Sections"
      inert={inert}
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
  /**
   * TASK-027 (C54; R35, R98): the accepted compact live navigator, opted into
   * by the consumer — `All sections` with the `N / M` position, over the
   * status-bearing jump list, and nothing that repeats the active card's
   * identity. Needs `progress`; without it the full header is drawn.
   */
  compact?: boolean
  section: SectionProgress
  /** Position in the session, one-based, for the terse `3 / 6` readout. */
  position: number
  total: number
  /**
   * The whole session's progress. When given, the header is the one frame for
   * the active section (U35): the bar and the jump list live here rather than
   * in a second card restating the same position.
   */
  progress?: SessionProgress
  /**
   * False when the bar is drawn elsewhere — the active workout puts it above
   * its footer navigation (REQ-018) — leaving the jump list here.
   */
  bar?: boolean
  /** Jump straight to a section. Omit to render the jump list read-only. */
  onSelect?: (index: number) => void
  children?: ReactNode
}

/**
 * The section's identity: what it is called, where it sits, and — the master
 * clarity spec's requirement — what *kind* of structure each of its blocks is.
 * An EMOM and an AMRAP over the same three movements are different workouts,
 * and this is the line that says which one the user is about to do.
 *
 * Given the session's progress it also carries the bar, always visible, and
 * the full jump list behind a disclosure (U34). The list starts collapsed and
 * collapses again after a jump, so it is a way to move rather than a second
 * readout of the position the meta line already states. While collapsed it is
 * `inert`: the disclosure is CSS-only, and a chip nobody can see must not take
 * keyboard focus.
 */
export function SectionHeader({
  compact = false,
  section,
  position,
  total,
  progress,
  bar = true,
  onSelect,
  children,
}: SectionHeaderProps) {
  const [jumping, setJumping] = useState(false)
  const select =
    onSelect === undefined
      ? undefined
      : (index: number) => {
          setJumping(false)
          onSelect(index)
        }

  if (compact && progress !== undefined) {
    // TASK-027 (C54; R35, R98; accepted reference `SectionHeader compact`):
    // no section card, no visible title or status line and no repeated
    // structure badges — the cards below already say what each block is. The
    // section keeps its level-two heading and its `Section N / M · status`
    // reading for assistive technology, visually hidden; the trigger shows the
    // position and keeps its one name, `All sections`; each chip in the jump
    // list states its section's status in words and a glyph.
    return (
      <div className="clr-section-nav" data-section-navigation="">
        <Heading className="a11y-hidden">{section.title}</Heading>
        <p className="a11y-hidden">{`Section ${position} / ${total} · ${STATUS_WORDS[section.status]}`}</p>
        <CollapsibleSection
          label={
            <>
              <span>All sections</span>
              <span className="clr-section-nav__meta" aria-hidden="true" data-section-position="">
                {position} / {total}
              </span>
            </>
          }
          expanded={jumping}
          onExpandedChange={setJumping}
        >
          <SectionJumpList
            progress={progress}
            currentIndex={section.index}
            onSelect={select}
            inert={!jumping}
          />
        </CollapsibleSection>
        {children}
      </div>
    )
  }

  return (
    // `Screen` already establishes level two for its top-level content. This
    // section title is that level-two heading; the block/exercise sections
    // that follow advance themselves to level three. Wrapping this heading in
    // `HeadingSection` skipped h2 and made the live Workout outline invalid.
    // `Card` draws the title as that heading, inside the card, with the
    // position and status beside it — nothing sits on the atmosphere.
    <Card
      heading={section.title}
      meta={`Section ${position} / ${total} · ${STATUS_WORDS[section.status]}`}
    >
      {progress === undefined || !bar ? null : (
        <SectionProgressBar progress={progress} currentIndex={section.index} />
      )}
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
            {/*
              C08 (TASK-003): the same format-only words as each block's own
              badge; the block's card states its duration, cap and rounds.
            */}
            <StructureBadge identity={block.identity} formatOnly />
          </li>
        ))}
      </ul>
      {progress === undefined ? null : (
        <CollapsibleSection label="All sections" expanded={jumping} onExpandedChange={setJumping}>
          <SectionJumpList
            progress={progress}
            currentIndex={section.index}
            onSelect={select}
            inert={!jumping}
          />
        </CollapsibleSection>
      )}
      {children}
    </Card>
  )
}

export interface StructureBadgeProps {
  identity: StructureIdentity
  /**
   * C08 (TASK-003; R51, R59, R65): the format or shape alone — `EMOM`,
   * `LADDER`. The workout's block header and Review's draw it so, with the
   * duration, cap, rounds and scheme read beside it (`WorkoutCard`); the
   * full reading stays the default for a surface that has no such line.
   */
  formatOnly?: boolean
}

/**
 * `EMOM · 10 MIN`, with the glyph the export already ships for it — or, format
 * only, `EMOM`.
 *
 * An element frame, not a card: the small chamfer on the structure role, with
 * no accent bar, emitting through its own `.clr-bleed` wrapper. That is what
 * lets it sit inside a block's card or a section's without nesting one.
 *
 * The emission is the wrapper's `::before`, so it is exactly as wide as the
 * wrapper. A flex-column or grid parent stretches an auto-width item to the
 * line even though it is inline-flex, and the outline then ran on across the
 * unused group width (B05-04). The wrapper is sized to its frame instead, in
 * every parent, and capped at the parent so a long label wraps inside it.
 */
export function StructureBadge({ identity, formatOnly = false }: StructureBadgeProps) {
  const detail = formatOnly ? '' : [identity.detail, identity.repScheme].filter(Boolean).join(' · ')
  const label = formatOnly ? identity.format : identity.label

  return (
    <span className="clr-bleed" style={STRUCTURE_BLEED_STYLE}>
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
        {detail === '' ? label : `${label} · ${detail}`}
      </span>
    </span>
  )
}

const STRUCTURE_BLEED_STYLE = {
  '--bleed': 'var(--border-frame-structure)',
  width: 'fit-content',
  maxWidth: '100%',
  // Inside a scroll region every item may shrink below its words. Beside a
  // label in a row, the badge gives up the width first and wraps its own
  // label rather than squeezing the label under it — and never past its own
  // longest word, so its text stays inside its frame.
  minWidth: 'min-content',
  flexShrink: 1000,
} as CSSProperties

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

export interface WorkoutMenuProps {
  /** Asks the abandon question. The menu has already closed when it runs. */
  onAbandon: () => void
  /** Starts with the panel open. The workout never passes it; the gallery does. */
  defaultOpen?: boolean
}

/** The trigger's accessible name; the header shows only its glyph. */
export const WORKOUT_MENU_LABEL = 'Actions'

/**
 * REQ-019: the header's framed menu, which is where Abandon lives.
 *
 * The trigger is the shipped `IconButton` — framed, icon only, and named
 * "Actions" for assistive technology without printing the word. It discloses
 * one framed panel (`aria-expanded`/`aria-controls`) rather than an ARIA
 * `menu`, so it asks for no roving-focus contract it would only half keep.
 *
 * Choosing Abandon closes the panel and hands focus back to the trigger
 * *before* the confirm opens, so dismissing the confirm returns the athlete to
 * the menu button on an unchanged workout. Nothing here abandons: the confirm
 * and its retention behaviour are `AbandonConfirmDialog`'s, unchanged. Esc and
 * a press outside close the panel without acting.
 */
export function WorkoutMenu({ onAbandon, defaultOpen = false }: WorkoutMenuProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const abandon = () => {
    setOpen(false)
    trigger.current?.focus()
    onAbandon()
  }

  return (
    <div ref={root} className="clr-workout-menu">
      <IconButton
        label={WORKOUT_MENU_LABEL}
        icon={<Menu />}
        buttonRef={trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      />
      <div
        id={panelId}
        role="group"
        aria-label={WORKOUT_MENU_LABEL}
        className="clr-workout-menu__panel clr-bleed"
        style={STRUCTURE_BLEED_STYLE}
        hidden={!open}
      >
        <div className="clr-workout-menu__frame clr-chamfer clr-chamfer--sm clr-chamfer--structure">
          <Button variant="quiet" icon={<LogOut />} onClick={abandon}>
            Abandon
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest
// ─────────────────────────────────────────────────────────────────────────────

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
 * the fill, which steps, and the low state.
 *
 * Its warning is the shared one (TASK-008: C22, C23, C24, C61; R126), read
 * from this rest's own deadline. From ten seconds left the card changes role,
 * so bar, body, fill and digits step to the low colours over `--dur-alert`,
 * and "Final 10 seconds" is said once (`data-urgent` on the section is that
 * stretch, the fill's colour hook). In the final five the rest's whole timer
 * frame (`DeadlineTimer`) breathes with the one soft screen-edge aura on the
 * shared 1.5 s phase, as an `urgent` claim on the view's one loop — it
 * outranks a loading region waiting beside it — in the footer and in the
 * open log alike. The card itself no longer takes the shipped four-second
 * stepped micro-pulse (R133, R135). Under reduced motion the timer and the
 * aura hold a steady .5, with the word, the digits and the colour unchanged.
 */
export function RestTimerBar() {
  const { rest, remainingSeconds, extend, skip } = useRestTimer()

  const running = rest !== null && remainingSeconds > 0
  const deadline = restDeadline(running ? remainingSeconds : 0)

  if (!running) return null

  const fraction = rest.totalSeconds > 0 ? remainingSeconds / rest.totalSeconds : 0

  return (
    <CountdownCard
      name="Rest"
      glyph={<Rest />}
      label={<>Rest after {rest.label}</>}
      reading={restReading(remainingSeconds)}
      deadline={deadline}
      fraction={fraction}
      actions={
        <>
          <Button variant="secondary" icon={<Plus />} onClick={() => extend()}>
            Add {REST_EXTENSION_SECONDS}s
          </Button>
          <Button variant="quiet" icon={<X />} onClick={skip}>
            Skip rest
          </Button>
        </>
      }
    />
  )
}

export interface CountdownCardProps {
  /** The region's accessible name: `Rest`, `Warm-up timer`. */
  name: string
  /** The label's glyph, beside its words, so colour is never the only cue. */
  glyph: ReactNode
  /** What the countdown is for, in the card's label face. */
  label: ReactNode
  /** The clock's own reading, from its owner (`state/timed-clock.ts`). */
  reading: TimerReading
  /** The clock's own deadline, for the shared warning (TASK-008). */
  deadline: CountdownDeadline
  /** How much of the clock is left, 0 to 1: the stepped fill. */
  fraction: number
  /** The clock's own actions, one row under the fill. */
  actions: ReactNode
}

/**
 * The rest timer's pattern, drawn once (EXE-05; R15): one timer-role card
 * holding its glyph-led label, the shared whole timer body (`DeadlineTimer`)
 * at the card's full width, the once-said "Final 10 seconds", the stepped
 * fill and one row of actions. The session's rest draws it, and so does a
 * Warm-up's or Cooldown's separate preparation clock (TASK-022), so the two
 * share one layout rather than a second invented one; each passes its own
 * clock's reading, deadline and actions. It holds no clock and writes nothing.
 *
 * TASK-007 (C19, R17, R103): the readout is the shared whole timer body,
 * filling the card's width with its digits centred — in the footer and in the
 * open log alike. Labelled once and not live: the milestone is what speaks.
 */
export function CountdownCard({ name, glyph, label, reading, deadline, fraction, actions }: CountdownCardProps) {
  const { low } = countdownWarningState(deadline.remaining, deadline.running)

  return (
    <section aria-label={name} className="clr-rest-bar" data-urgent={low ? 'true' : 'false'}>
      <Card role={low ? 'timer-low' : 'timer'}>
        <p
          style={{
            ...labelStyle,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-100)',
          }}
        >
          <span aria-hidden="true" style={{ display: 'flex' }}>
            {glyph}
          </span>
          {label}
        </p>
        <DeadlineTimer reading={reading} size="var(--label-xl-size)" deadline={deadline} />
        {low && (
          <p
            role="status"
            aria-live="polite"
            style={{ ...labelStyle, color: 'var(--text-timer-low)' }}
          >
            Final {COUNTDOWN_WARNING_THRESHOLDS.colorSeconds} seconds
          </p>
        )}

        <div className="clr-rest-bar__track" aria-hidden="true">
          <div
            className="clr-rest-bar__fill"
            style={{ width: `${Math.round(fraction * 1000) / 10}%` }}
          />
        </div>

        <div className="clr-row" style={{ justifyContent: 'space-between' }}>
          {actions}
        </div>
      </Card>
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
  /**
   * The whole session's progress. When given, its bar sits directly above the
   * paired actions (REQ-018), so where the user is and where they go next are
   * read in one place.
   */
  progress?: SessionProgress
  /** The section the shell currently has open, for the bar's name. */
  currentIndex?: number
}

/**
 * Previous, and then either Next or Finish. Two exits, and the destructive one
 * is not among them — abandoning lives in the header, away from the control the
 * user presses between every section.
 *
 * REQ-018: one compact paired row — Previous on the left, the forward action
 * on the right — at every width, with the session's progress immediately above
 * it. Only the arrangement is this component's; what each action does is the
 * caller's, unchanged.
 */
export function WorkoutNavigation({
  canGoBack,
  canGoForward,
  onPrevious,
  onNext,
  onFinish,
  busy = false,
  progress,
  currentIndex = 0,
}: WorkoutNavigationProps) {
  // Finishing is a real wait and its button scans, so it takes its turn with
  // every other loop in view; the button stays busy either way.
  const loop = useInterfaceLoop('busy', busy && !canGoForward)

  return (
    <nav aria-label="Workout sections" className="clr-workout-nav" {...loop}>
      {progress === undefined ? null : (
        <SectionProgressBar progress={progress} currentIndex={currentIndex} />
      )}
      <div className="clr-workout-nav__pair">
        <Button
          variant="secondary"
          icon={<ChevronLeft />}
          disabled={!canGoBack || busy}
          onClick={onPrevious}
        >
          Previous
        </Button>
        {canGoForward ? (
          <Button variant="primary" icon={<ChevronRight />} disabled={busy} onClick={onNext}>
            Next section
          </Button>
        ) : (
          <Button variant="primary" icon={<Check />} loading={busy} onClick={onFinish}>
            Finish workout
          </Button>
        )}
      </div>
    </nav>
  )
}
