/**
 * TASK-006 (REQ-006; C17, C18; G05; R39, R48, R66, R68, R98) — the timed
 * Start/Pause/Resume/Finish action hierarchy, one owner for every timed format.
 *
 * Accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `/gallery/refinements?state=ladder-4` and `?state=ladder-12`; the reviewed R7
 * `TimedWorkoutFlow` whose shown Start/Pause/Resume/Finish flows R98 accepted.
 *
 * Deliberate consolidation, recorded in the task note: R7's `TimedWorkoutFlow`
 * replaced every timed renderer with one isolated proposal (its own schedule,
 * score, result log and an in-memory result adapter). Here the route's format
 * controllers — `EmomBlock`, `AmrapBlock`, `ForTimeBlock`, `LadderBlock` — keep
 * their clocks, schedules, scores and writes (LOGGING-FIELDS.md), and compose
 * this one owner for the part R7 and the accepted gallery share: the actions.
 *
 *   · **The lifecycle** (C18, R68, R98). Ready: one primary Start, in the
 *     format's own words. Running: a secondary Pause beside the format's
 *     primary Finish. Paused: Resume in Pause's place, still secondary, beside
 *     the same Finish. Ended: nothing — a second Start would discard the
 *     attempt, and a reached cap cannot be resumed.
 *   · **The wording** is the format's (G05: "Retain format-specific Finish/
 *     Finish early wording within the shared lifecycle"): `finishLabel` in
 *     `state/timed-lifecycle.ts`. A window that can still run — an EMOM's
 *     minutes, an AMRAP's — is ended *early*; a race or a ladder is finished.
 *     A window the block does not prescribe has nothing to end early, so it
 *     says Finish, as the AMRAP already did (R48).
 *   · **The slot** (C17, R39, R48, R66). One responsive, full-width row: the
 *     shared `.clr-timed-actions` recipe, whose cells share the card's width
 *     equally, so a lone Start fills the row and a running pair splits it. The
 *     consumer places it — after the work and its prescription, before the
 *     card's Coaching and notes, or at the long ladder's top, after its
 *     identity and cap — and nowhere else: no sticky copy, no duplicate.
 *
 * Section Finish is not Finish workout (AC-R006-02): this row ends one block's
 * attempt and nothing more. The workout's own completion stays the shell's
 * forward action in the footer.
 *
 * Undo finish (TASK-014; C38, C39; R124): an accidental Finish is reversed
 * from the attempt's result log, not from this row — the quiet `Undo finish ·
 * Resume ladder` under its Complete / Incomplete (`TimedResultLog`'s
 * completion action). The attempt comes back to this row as it was before
 * Finish (running, or paused), and `leadRef` lets its consumer put the focus
 * back on the row's lead control.
 *
 * Presentation only. Pause semantics are `state/timed-lifecycle.ts`; what each
 * action does is the consumer's handler on its own state owner.
 */
import type { Ref } from 'react'

import { Button, Pause, Play, Stop } from '../design-system/index'
import type { TimedLifecyclePhase } from '../state/timed-lifecycle'
import './refinements/tokens.css'
import './refinements/presentation.css'

/** Where the slot sits in the card: after the work (C17), or the long ladder's top (R66). */
export type TimedActionPlacement = 'after-work' | 'top'

export interface TimedWorkoutActionsProps {
  phase: TimedLifecyclePhase
  /** The format's own Start words — `Start EMOM`, `Start ladder`. */
  startLabel: string
  /**
   * The format's own end words — `Finish`, `Finish early`. Omitted where the
   * format has no Finish: a schedule runs on with nothing to press.
   */
  finishLabel?: string
  onStart: () => void
  /** Omitted where the format has no Pause (a schedule). */
  onPause?: () => void
  onResume?: () => void
  onFinish?: () => void
  /** Where the consumer has placed the slot; it names the placement, nothing more. */
  placement?: TimedActionPlacement
  /**
   * TASK-014: the lead control — Start, Pause or Resume, one element through
   * every phase — so a consumer can return focus to it when the attempt comes
   * back (Undo finish): the control the athlete left the attempt by is gone.
   */
  leadRef?: Ref<HTMLButtonElement>
}

/**
 * One timed block's actions, in the shared full-width slot.
 *
 * The lead control keeps its place in the row through every phase — Start,
 * then Pause, then Resume — so the button under a keyboard or a thumb stays the
 * same element and focus is not lost when its words change.
 */
export function TimedWorkoutActions({
  phase,
  startLabel,
  finishLabel: finish,
  onStart,
  onPause,
  onResume,
  onFinish,
  placement = 'after-work',
  leadRef,
}: TimedWorkoutActionsProps) {
  if (phase === 'ended') return null

  const toggle = phase === 'paused' ? onResume : phase === 'running' ? onPause : undefined
  const ending = phase === 'ready' || finish === undefined || onFinish === undefined ? null : finish
  if (phase !== 'ready' && toggle === undefined && ending === null) return null

  const lead =
    phase === 'ready' ? (
      <Button variant="primary" icon={<Play />} onClick={onStart} buttonRef={leadRef}>
        {startLabel}
      </Button>
    ) : toggle === undefined ? null : (
      <Button variant="secondary" icon={phase === 'paused' ? <Play /> : <Pause />} onClick={toggle} buttonRef={leadRef}>
        {phase === 'paused' ? 'Resume' : 'Pause'}
      </Button>
    )

  return (
    <div className="clr-timed-actions" data-timed-actions={placement} data-timed-phase={phase}>
      {lead}
      {ending === null ? null : (
        <Button variant="primary" icon={<Stop />} onClick={onFinish}>
          {ending}
        </Button>
      )}
    </div>
  )
}
