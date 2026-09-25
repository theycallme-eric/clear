/**
 * Review — REV-01. The pre-workout briefing, and the handoff into SES-01.
 *
 * IA.md §4 gives this screen the composition it has: a header of the four
 * facts the workout was composed under, one card per section, and two actions.
 * Everything it renders comes from `reviewBriefing`, which is where the
 * decisions about *words* live; this file is the markup and the two things the
 * markup cannot be — starting, and discarding.
 *
 * **Start is where the session begins to exist.** Nothing has been written when
 * this screen mounts: generation answers a composed workout, not a row, and the
 * screen is handed the acceptance payload rather than a session id. So Start
 * does the two calls SES-01 defines, in order — `accept` persists the session,
 * its sections, blocks and prescriptions in one transaction, and `start` moves
 * it `prescribed → active` — and only then navigates to `/workout`. Doing it
 * here rather than at generation is what makes the other action honest:
 *
 * **Regenerate discards, and a discard that left rows behind would not be one.**
 * A workout the user rejected has written nothing, so there is nothing to
 * abandon, nothing orphaned in `prescribed`, and no half-session for Home to
 * offer to resume (`ResumableSession` is explicit that a prescribed session
 * belongs to Review). The confirm is therefore about the composition rather
 * than about data: it is gone, and the next one will be different.
 *
 * The states are the ones this screen can actually be in. Its content is
 * given to it, so there is no read to be loading or to fail, and no empty case
 * at all — `generationOutputSchema` refuses a workout with no sections, which
 * is what IA.md §4 means by "empty: n/a" here. What *is* asynchronous is the
 * handoff: the CTA carries its own pending state, and a failed accept or start
 * is a blocking `ErrorDialog` rather than a toast, because a user who pressed
 * Start and got a screen that did not move has to be told why before they
 * press it again.
 *
 * Atmosphere is `quiet` and is the route's, not this screen's: `/review` is
 * already in `SCREEN_ATMOSPHERE`, so `RootLayout` resolves it from the pathname
 * the day the journey that owns this screen routes it.
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  Clock,
  Crosshair,
  Gauge,
  Info,
  Play,
  RefreshCw,
  Target,
} from '../design-system/index'
import { useAuth } from '../state/auth-context'
import { createError, ErrorCode, isErr, type AppError } from '../state/errors'
import {
  ANCHOR_LABEL,
  DURATION_LABEL,
  GOAL_LABEL,
  INTENSITY_LABEL,
  reviewBriefing,
  type ReviewBlockView,
  type ReviewExerciseView,
  type ReviewFact,
  type ReviewSectionView,
} from '../state/review'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { useProfileQuery } from '../state/user-queries'
import { useWorkoutClients } from '../state/workout-queries'
import { ErrorDialog, ConfirmDialog } from '../ui/blocking-dialog'
import { Card } from '../ui/card'
import { CollapsibleSection } from '../ui/collapsible-section'
import { StructureBadge } from '../ui/workout-chrome'
import { WORKOUT_ROUTE } from './ActiveSessionPrompt'
import { Screen } from './Screen'

export const REVIEW_TITLE = 'Review'
export const START_LABEL = 'Start workout'
export const REGENERATE_LABEL = 'Regenerate'

export interface ReviewProps {
  /**
   * The composed workout together with the facts it was composed under —
   * what the Generate → Loading journey assembled, and what `accept` sends.
   * One prop for all three of IA.md §2's entry paths: a fresh generation, a
   * regeneration and a favourite restart differ in where it came from.
   */
  readonly acceptance: SessionAcceptance
  /** Discards this composition and asks for another. Confirmed before it fires. */
  readonly onRegenerate: () => void
  /** The persisted, running session — for a caller that has state to clear. */
  readonly onStarted?: (snapshot: SessionSnapshot) => void
}

export function Review({ acceptance, onRegenerate, onStarted }: ReviewProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { sessions } = useWorkoutClients()

  // The profile's unit, for an `absolute` load. Null while the query is
  // settling and null when it failed: `reviewBriefing` states such a load
  // without a unit rather than in one guessed from a default, so a slow
  // profile read costs a suffix and never a wrong number.
  const profile = useProfileQuery()
  const weightUnit =
    profile.state.status === 'ready' ? (profile.state.data?.weight_unit ?? null) : null

  const briefing = reviewBriefing(acceptance, weightUnit)

  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<AppError | null>(null)
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false)

  const userId = user?.id ?? null

  /**
   * The handoff. Not wrapped in `useCallback`: the compiler memoizes it, and a
   * hand-written dependency list here was one the compiler could not preserve —
   * which would have cost the whole component its optimization to save nothing.
   */
  async function start() {
    if (userId === null) {
      setFailure(createError(ErrorCode.AUTH_UNAUTHENTICATED))
      return
    }

    setStarting(true)
    setFailure(null)

    // Two calls, and the order is the requirement: there is no session to
    // start until acceptance has written one. A failure of either leaves the
    // user on this screen with the workout still in front of them — the
    // composition is in memory and is not lost by a write that did not land.
    const accepted = await sessions.accept(userId, acceptance)
    if (isErr(accepted)) {
      setStarting(false)
      setFailure(accepted.error)
      return
    }

    const started = await sessions.start(accepted.value.session.id)
    if (isErr(started)) {
      setStarting(false)
      setFailure(started.error)
      return
    }

    onStarted?.(accepted.value)
    await navigate(WORKOUT_ROUTE)
  }

  return (
    <Screen title={REVIEW_TITLE} heading={briefing.title}>
      <div
        className="clr-stack"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {briefing.overview !== null && <p style={{ margin: 0 }}>{briefing.overview}</p>}

        <BriefingHeader
          facts={briefing.facts}
          adjustment={briefing.adjustment}
          movementCount={briefing.movementCount}
        />

        {briefing.sections.map((section) => (
          <ReviewSectionCard key={section.key} section={section} />
        ))}

        <div className="clr-row">
          <Button
            variant="primary"
            size="lg"
            icon={<Play />}
            loading={starting}
            onClick={() => void start()}
          >
            {START_LABEL}
          </Button>
          {/*
            Second, and quiet. Regenerating is not a peer of starting: it throws
            away a composition the user has just been shown, so it does not sit
            beside the forward action as an equal offer.
          */}
          <Button
            variant="quiet"
            icon={<RefreshCw />}
            disabled={starting}
            onClick={() => setConfirmingRegenerate(true)}
          >
            {REGENERATE_LABEL}
          </Button>
        </div>
      </div>

      <RegenerateConfirmDialog
        open={confirmingRegenerate}
        onCancel={() => setConfirmingRegenerate(false)}
        onConfirm={() => {
          setConfirmingRegenerate(false)
          onRegenerate()
        }}
      />

      {failure !== null && (
        <ErrorDialog
          open
          error={failure}
          title="Couldn’t start this workout"
          actionLabel={START_LABEL}
          onRetry={() => void start()}
          onDismiss={() => setFailure(null)}
        />
      )}
    </Screen>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The header
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A glyph beside each fact. The label is the cue and the glyph is the
 * shorthand — never the other way round, which is why every one of them is
 * rendered next to its own `<dt>` rather than in place of it.
 */
const FACT_GLYPHS: Readonly<Record<string, ReactNode>> = {
  [INTENSITY_LABEL]: <Gauge size={16} />,
  [ANCHOR_LABEL]: <Target size={16} />,
  [GOAL_LABEL]: <Crosshair size={16} />,
  [DURATION_LABEL]: <Clock size={16} />,
}

const LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-100)',
}

const VALUE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h6-size)',
  color: 'var(--text-card-header)',
  margin: 0,
}

const DATA_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-label)',
  margin: 0,
}

const STACK_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column' }

/**
 * The four facts, as a description list, because that is what they are: four
 * terms and their values. A grid of divs would render the same and say nothing
 * about which value belongs to which label.
 */
function BriefingHeader({
  facts,
  adjustment,
  movementCount,
}: {
  facts: readonly ReviewFact[]
  adjustment: string | null
  movementCount: number
}) {
  return (
    <Card barWidth="lg">
      <div className="clr-stack--tight" style={STACK_STYLE}>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(7rem, 1fr))',
            gap: 'var(--spacing-300)',
            margin: 0,
          }}
        >
          {facts.map((fact) => (
            <div key={fact.label} style={STACK_STYLE}>
              <dt style={LABEL_STYLE}>
                {FACT_GLYPHS[fact.label]}
                {fact.label}
              </dt>
              <dd style={{ ...VALUE_STYLE, marginInlineStart: 0 }}>{fact.value}</dd>
            </div>
          ))}
        </dl>

        <p style={DATA_STYLE}>
          {movementCount} {movementCount === 1 ? 'movement' : 'movements'}
        </p>

        {/*
          A clamp that moved the session says so. The glyph carries it as well
          as the words — an adjustment is a difference from what was asked for,
          and a difference that only reads as a quieter colour is not a cue.
        */}
        {adjustment !== null && (
          <p style={{ ...DATA_STYLE, display: 'flex', gap: 'var(--spacing-200)' }}>
            <Info size={16} />
            {adjustment}
          </p>
        )}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A section
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One section of the briefing, disclosed and open.
 *
 * Open by default because this is a screen the user reads before agreeing to
 * it — a briefing that hid its own contents behind five taps would be asking
 * them to start a workout they have not seen. `CollapsibleSection` keeps
 * collapsed content in the accessibility tree either way, so closing one is
 * visual economy on a long session rather than removal.
 */
function ReviewSectionCard({ section }: { section: ReviewSectionView }) {
  return (
    <Card>
      <CollapsibleSection
        // A plain label rather than a `Heading`: the trigger *is* a button, and
        // a heading nested inside one is read as part of the control's name
        // instead of as an outline entry. `SessionSectionCard` makes the same
        // call for the same reason.
        label={
          <span className="clr-row" style={{ gap: 'var(--spacing-200)' }}>
            <span style={VALUE_STYLE}>{section.title}</span>
            <span style={DATA_STYLE}>
              {section.movementCount}{' '}
              {section.movementCount === 1 ? 'movement' : 'movements'}
            </span>
          </span>
        }
        defaultExpanded
      >
        <div className="clr-stack--tight" style={STACK_STYLE}>
          {section.notes !== null && <p style={{ margin: 0 }}>{section.notes}</p>}
          {section.blocks.map((block) => (
            <ReviewBlockRows key={block.key} block={block} />
          ))}
        </div>
      </CollapsibleSection>
    </Card>
  )
}

function ReviewBlockRows({ block }: { block: ReviewBlockView }) {
  return (
    <div className="clr-stack--tight" style={STACK_STYLE}>
      <div className="clr-row" style={{ justifyContent: 'space-between' }}>
        <StructureBadge identity={block.identity} />
        {block.roundRest !== null && <span style={DATA_STYLE}>{block.roundRest}</span>}
      </div>
      {block.notes !== null && <p style={{ margin: 0 }}>{block.notes}</p>}
      {block.exercises.map((exercise) => (
        <ReviewExerciseRow key={exercise.key} exercise={exercise} />
      ))}
    </div>
  )
}

/**
 * One prescription. Every reading is a separate element rather than one
 * assembled sentence: `prescriptionText` already refuses to produce a string
 * anything would want to parse back, and the load, the rest and the tempo are
 * three different facts that a screen reader should be able to stop between.
 */
function ReviewExerciseRow({ exercise }: { exercise: ReviewExerciseView }) {
  return (
    <div style={STACK_STYLE}>
      <div className="clr-row" style={{ flexWrap: 'wrap', gap: 'var(--spacing-200)' }}>
        <p style={{ ...VALUE_STYLE, textTransform: 'capitalize' }}>{exercise.name}</p>
        <span style={DATA_STYLE}>{exercise.prescription}</span>
      </div>
      <div className="clr-row" style={{ flexWrap: 'wrap', gap: 'var(--spacing-200)' }}>
        <span style={{ ...DATA_STYLE, textTransform: 'capitalize' }}>
          {exercise.equipment}
        </span>
        {exercise.load !== null && <span style={DATA_STYLE}>{exercise.load}</span>}
        {exercise.rest !== null && <span style={DATA_STYLE}>{exercise.rest}</span>}
        {exercise.tempo !== null && <span style={DATA_STYLE}>Tempo {exercise.tempo}</span>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Discarding
// ─────────────────────────────────────────────────────────────────────────────

export interface RegenerateConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  /** The safe exit: cancel, Esc and the backdrop all land here. */
  onCancel: () => void
}

/**
 * The question regenerating asks, in the words pattern 4 of the export's
 * `patterns.md` asks for: the title names the consequence, the body says
 * exactly what is lost, and the confirm repeats the verb.
 *
 * `critical` because it is irreversible — generation is not deterministic, so
 * the workout on screen cannot be got back — and the body says so rather than
 * leaving the frame to imply it. What it does *not* claim is that anything is
 * deleted: nothing was written, and a confirm that said "delete" would be
 * describing a different operation.
 */
export function RegenerateConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: RegenerateConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      critical
      title="Discard this workout?"
      confirmLabel="Discard and regenerate"
      cancelLabel="Keep it"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      This workout has not been saved, so nothing is lost from your history. It
      is gone from here, though: generating again composes a new one, and this
      one cannot be brought back.
    </ConfirmDialog>
  )
}
