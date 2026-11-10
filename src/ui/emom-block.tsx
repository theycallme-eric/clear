/**
 * EXE-03 — the EMOM renderer: fixed work at the top of every minute, and the
 * remainder of the minute as rest. This is the EMOM arm of the IA's
 * `TimedRenderer` (IA.md §3), and the readout inside it is its `SectionTimer` —
 * a real countdown with a deadline, unlike the session clock, drawn in the
 * shared whole timer body (`DeadlineTimer`, TASK-007: C19, R42).
 *
 * `emom-clarity.md` is a list of four things the old screen failed to say, and
 * all four are said here:
 *
 *   · **Which minute it is.** `MIN 4 OF 10`, at the head of the card, in the
 *     data face and the timer's own colour (§1). The number comes from the
 *     block's `timer_seconds`; a block that carries no window says `MIN 4` and
 *     runs until the user completes it, rather than inventing a last minute.
 *   · **Which movement is active now.** The minute decides it —
 *     `((minute - 1) % movements) + 1` — so a 2-movement EMOM alternates and a
 *     3-movement one rotates (§2). The live movement is named in words (`NOW`,
 *     `NEXT`) and carries `aria-current`; the others are not dimmed into
 *     unreadability, because the athlete reads ahead to the next minute and a
 *     40%-opacity row is a contrast failure rather than a hint.
 *   · **The alternation pattern.** Each movement states the minutes it covers —
 *     `ODD MIN` / `EVEN MIN` for two, the actual minute numbers for three or
 *     more, nothing at all for one (§3).
 *   · **What the timer's colour means.** It is the shipped `TimerDisplay`'s
 *     own low threshold, kept, and it is meaningful because the seconds handed
 *     to it are the seconds left of *this minute*: the readout turns to the urgency treatment
 *     in the last ten seconds of every minute and resets on the boundary
 *     (§4, option A). Nothing here sets a colour to say it.
 *
 * It draws with the shared block frame (`block-renderers-frame.tsx`): the one
 * card, the identity row and the single completion are `BlockPanel`'s, the
 * movements are rows of its list, and the countdown is handed to its `timer`
 * slot — one frame filling the block's width with its digits centred, never a
 * short readout inside an empty wider frame (R42), and never put inside
 * another. It reads the EMOM's own minute and no other clock (C21).
 *
 * Execution is hands-off (REQ-014). There is no set form, no "Minute done" and
 * no exertion prompt: each movement states the target its scheduled minute
 * prescribes — the same number every turn, or the next rung of a rising
 * sequence — and the clock moves it on. Rest is the block's and is honored
 * once per minute rather than once per movement, so the movements state none
 * of their own (`superset-circuit-clarity.md` §8) and the trailing window is
 * stated once at the foot of the card.
 *
 * Completion is the shell's, and this renderer supplies no measured outcome to
 * it. The clock running past a minute is the schedule, not work the athlete
 * reported (E01), so `minutes_completed` stays `null` rather than being filled
 * from the timer. The section's forward action is what saves the block.
 *
 * TASK-011 (C31, C32; R40, R43, R44, R84) — the end of the schedule and its
 * log. When the schedule ends — every prescribed minute run, or ended by the
 * user — the card's closing sentence gives way to the shared `TimedResultLog`
 * in its EMOM family (R43: "make this the log … rather than just saying it's
 * done"): no minutes-completed counter, no completion question, no
 * confirmation. The schedule as the block specifies it is assumed done (R84),
 * so nothing is asked about it; an exception is the athlete's note, reported
 * as the block's existing `notes` through the shell's one writer. That is the
 * whole outcome: no minutes tally, no elapsed time, and the EMOM's clock record
 * is never touched by it. An early finish says so truthfully (its minute and
 * FINISHED EARLY stay on the card) and is no more a completed schedule in the
 * saved row than a natural end is a measured one: both save `minutes_completed`
 * `null`. The note is this mount's draft — kept through a failed save and its
 * retry, never stored as a new field — and once the block's row is saved the
 * log steps aside: there is no correction writer for a saved row. The captions
 * R40 crossed out, NOT STARTED and WORK, are gone; the minute (`MIN 1 OF 10`),
 * each movement's minutes and target, Now/Next, REST, PAUSED, FINISHED EARLY
 * and COMPLETE stay (C32).
 *
 * Where the user is comes from `emom.ts` as pure arithmetic over a stored
 * timestamp, and `workout-persistence.ts` writes that timestamp down — so a
 * refresh at 3:40 into a ten-minute EMOM comes back at 3:40 and not at zero
 * (SES-01). The block's own four states are the shell's: it owns loading and
 * error for the session, and a block with no active prescriptions left is a
 * real, drawable case rather than an empty view — everything in it was swapped
 * out, and it says so.
 */
import { useMemo, useState } from 'react'

import { useBlockCompletion, type BlockOutcome } from '../state/block-completion'
import {
  clampEmomState,
  emomShape,
  emomView,
  EMOM_START,
  finishEmom,
  minuteAssignment,
  scheduledMinuteFor,
  startEmom,
  targetForMinute,
  type EmomShape,
  type EmomState,
  type EmomView,
} from '../state/emom'
import {
  prescribedTarget,
  prescriptionText,
  targetNumbers,
  targetText,
} from '../state/prescription'
import { useShellWeightUnit } from '../state/set-logging'
import {
  finishLabel,
  isClockPaused,
  pauseClock,
  resumeClock,
  type TimedLifecyclePhase,
} from '../state/timed-lifecycle'
import { emomMinuteDeadline } from '../state/countdown-urgency'
import { formatCountdownReading } from '../state/timed-clock'
import { useElapsedSeconds } from '../state/workout-clock'
import { usePersistedEmom, type ShellStorage } from '../state/workout-persistence'
import type { ExerciseProgress } from '../state/workout-progress'
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel, type BlockMovementMarker } from './block-renderers-frame'
import { ExerciseCoaching } from './exercise-coaching'
import { DeadlineTimer } from './refinements/deadline-timer'
import { liveMovementReadings } from './refinements/movement-readings'
import { TimedResultLog } from './refinements/timed-result-log'
import { TimedWorkoutActions } from './timed-workout-flow'

export interface EmomBlockProps extends BlockRendererProps {
  /** Injected by a test; the shell's own storage otherwise. */
  storage?: ShellStorage | null
  /** The wall clock the minute grid is read against. */
  now?: () => number
}

export function EmomBlock({ block, storage, now = Date.now }: EmomBlockProps) {
  const shape = emomShape(block)

  // Restored once, and repaired: a record whose timestamp no clock can read
  // would otherwise freeze the grid at minute one.
  const emom = usePersistedEmom(
    block.blockId,
    (stored) => (stored === null ? EMOM_START : clampEmomState(stored)),
    storage,
  )

  // Read from the clock rather than accumulated, exactly as the session timer
  // is: a phone that locked for four minutes comes back to minute five. A
  // paused or finished grid reads its own stamps and does not tick (TASK-006).
  const elapsed = useElapsedSeconds(emomTicking(emom.state), now)
  const view = emomView(emom.state, shape, elapsed)

  const start = () => {
    emom.update(startEmom(emom.state, now()))
  }

  const counting = shape.size > 0 && view.phase !== 'untimed' && view.phase !== 'ready'

  // TASK-011 (C31, R84): the end log's one field, the athlete's note. A draft
  // of this mount, never a new stored field: it survives a failed save and its
  // retry because the section keeps this block mounted until it saves.
  const [notes, setNotes] = useState('')
  const { isBlockRecorded } = useBlockCompletion()
  const saved = isBlockRecorded(block.blockId)
  const ended = shape.size > 0 && view.phase === 'finished'
  const completion = useMemo(() => ({ outcome: endLogOutcome(ended ? notes : '') }), [ended, notes])

  return (
    // No measured outcome: the clock is the schedule, and a scheduled minute
    // is not athlete-reported work (E01) — not even once the schedule ends,
    // when it is assumed rather than counted (C31, R84). The one thing the
    // EMOM reports is the end log's note, to the block's existing `notes`; the
    // section's forward action saves the block.
    <BlockPanel
      block={block}
      timer={counting ? <MinuteCountdown view={view} /> : null}
      completion={completion}
    >
      {shape.size === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <>
          {view.phase === 'untimed' ? (
            // The block carries no clock, so there is no grid to draw and no
            // minute to assign a movement to. Saying which minute is active
            // would be inventing the one column the block does not have.
            <BlockPanel.Note>
              This block prescribes no clock. Work through the movements as prescribed.
            </BlockPanel.Note>
          ) : (
            <SectionTimer view={view} />
          )}

          <BlockPanel.MovementList label="Movements in this EMOM">
            {block.exercises.map((exercise) => (
              <EmomMovement
                key={exercise.exerciseId}
                exercise={exercise}
                shape={shape}
                view={view}
                marker={markerFor(exercise.position, view)}
              />
            ))}
          </BlockPanel.MovementList>

          {/*
            Once, at the foot of the card, and only when the block prescribes
            a window inside the minute: an EMOM that prescribes none rests for
            whatever is left of the minute, which is the structure rather than
            a number to print (`superset-circuit-clarity.md` §8).
          */}
          {shape.restSeconds > 0 && view.phase !== 'untimed' && (
            <BlockPanel.Note>{shape.restSeconds}s rest at the end of each minute</BlockPanel.Note>
          )}

          {/*
            TASK-006 (C17, C18; R39, R98): the shared action slot, after the
            work and its prescription — the minute's rest included — and before
            the card's coaching. Start EMOM; once it runs, a secondary Pause and
            the primary Finish early. A block with no clock has none.
          */}
          {view.phase !== 'untimed' && (
            <TimedWorkoutActions
              phase={emomLifecycle(view)}
              startLabel="Start EMOM"
              finishLabel={finishLabel('emom', shape.minutes !== null)}
              onStart={start}
              onPause={() => emom.update(pauseClock(emom.state, now()))}
              onResume={() => emom.update(resumeClock(emom.state, now()))}
              onFinish={() => emom.update(finishEmom(emom.state, now()))}
            />
          )}

          {/*
            The user ended the schedule before its last minute, which the card
            says in the minute it stopped: the actual timing, never rewritten
            into a completed schedule. A natural end needs no sentence: R43
            replaced "The clock has run every prescribed minute" with the log.
          */}
          {view.phase === 'finished' && view.endedEarly && (
            <BlockPanel.Note>{endedEarlyText(view)}</BlockPanel.Note>
          )}

          {/*
            TASK-011 (C31; R43, R84): the end log, after the work and its
            prescription, once the schedule has ended. No count to fill in and
            no completion to confirm; an exception goes in the notes. Once the
            block's row is saved there is no correction writer, so the log
            steps aside and the shell's "Block saved" says what happened.
          */}
          {ended && !saved && (
            <TimedResultLog format="emom" value={{ notes }} onChange={(next) => setNotes(next.notes)} />
          )}
        </>
      )}
    </BlockPanel>
  )
}

/**
 * TASK-011 (C31, AC-R011-02): what the end log reports — the athlete's note,
 * as written, when there is one; otherwise nothing. Never a minute count, an
 * elapsed time or a completion flag: the schedule is assumed, not measured,
 * and a blank note is not an observation.
 */
function endLogOutcome(notes: string): BlockOutcome {
  return notes.trim() === '' ? {} : { notes }
}

/** The start the grid ticks from: none before Start, while paused or once ended. */
function emomTicking(state: EmomState): string | null {
  return (state.finishedAt ?? null) === null && !isClockPaused(state) ? state.startedAt : null
}

/** The grid's place, as the shared Start/Pause/Resume/Finish actions read it. */
function emomLifecycle(view: EmomView): TimedLifecyclePhase {
  switch (view.phase) {
    case 'ready':
      return 'ready'
    case 'work':
    case 'rest':
      return view.paused ? 'paused' : 'running'
    case 'untimed':
    case 'finished':
      return 'ended'
  }
}

/**
 * How an early end happened, truthfully: the user ended the schedule in the
 * minute it was in (TASK-006, Finish early). It is not a record of work
 * performed (E01), and it is not a completed schedule (TASK-011, AC-R011-02).
 */
function endedEarlyText(view: EmomView): string {
  return view.minutes === null
    ? `Finished in minute ${view.minute}. Continue when you are ready.`
    : `Finished early, in minute ${view.minute} of ${view.minutes}. Continue when you are ready.`
}

// ─────────────────────────────────────────────────────────────────────────────
// The clock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The countdown, as `BlockPanel`'s `timer`: the shared whole timer body
 * (TASK-007, C19), its own frame filling the block's width, drawn beside the
 * block's card rather than inside it.
 *
 * It is handed the seconds left of *this minute* rather than of the whole
 * block, which is what makes its warning mean "wrap up this minute" and reset
 * at every boundary. The warning is the shared one (TASK-008: C22, C23, C24,
 * C61; R126 names the EMOM), drawn by `DeadlineTimer` from the minute's own
 * deadline: the timer-low colour from ten seconds left, and in the last five
 * of a running minute the smooth breathe with the one soft screen-edge aura in
 * the same phase — an `urgent` claim on the view's one loop that outranks a
 * wait beside it. A paused grid holds the colour and loses the breathe and
 * the aura; once the last minute has elapsed the warning is over. Under
 * reduced motion the timer and the aura hold a steady .5, with the digits, the
 * colour and the phase word unchanged.
 */
function MinuteCountdown({ view }: { view: EmomView }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <DeadlineTimer reading={formatCountdownReading(view.secondsRemaining)} deadline={emomMinuteDeadline(view)} />
    </div>
  )
}

/**
 * The minute the user is in, inside the block's card: the minute out of the
 * window and the phase in words. Its one way in, and the running controls,
 * are the shared action slot after the movements (TASK-006, C17): the minute
 * is never marked done — every boundary moves the work on by itself
 * (REQ-014) — and Pause holds the grid where it is.
 *
 * Neither line is a live region: announcing a number every second makes the
 * rest of the screen unusable, so the minute and the movements' own Now/Next
 * are what a screen reader is meant to find.
 *
 * TASK-011 (C32, AC-R011-01; R40): the phase line is drawn only when it says
 * something the minute and the Now/Next markers do not. NOT STARTED (the
 * minute reads `MIN 1 OF 10` and the first movement is Next, beside Start)
 * and WORK (the minute and the movement marked Now) were the annotated,
 * redundant captions and are gone. REST — the transition inside the minute —
 * and the actual clock states PAUSED, FINISHED EARLY, FINISHED and COMPLETE
 * stay.
 */
function SectionTimer({ view }: { view: EmomView }) {
  const word = phaseWord(view)
  return (
    <div
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      <BlockPanel.Label style={{ color: 'var(--text-timer)' }}>{minuteText(view)}</BlockPanel.Label>
      {word !== null && <BlockPanel.Label>{word}</BlockPanel.Label>}
    </div>
  )
}

/**
 * The phase in words, where it adds to the minute; a paused grid and an early
 * finish say so (TASK-006). Null for the captions TASK-011 removed.
 */
function phaseWord(view: EmomView): string | null {
  if (view.paused) return 'PAUSED'
  if (view.phase === 'finished' && view.endedEarly) return view.minutes === null ? 'FINISHED' : 'FINISHED EARLY'
  return PHASE_WORDS[view.phase]
}

/** `MIN 4 OF 10`, or `MIN 4` for a block that carries no window. */
function minuteText(view: EmomView): string {
  return view.minutes === null
    ? `MIN ${view.minute}`
    : `MIN ${view.minute} OF ${view.minutes}`
}

/**
 * TASK-011 (C32, R40): `ready` and `work` draw no caption — the minute and the
 * Now/Next markers already say it. `untimed` is never drawn here (a block with
 * no clock has no minute line); it keeps its word for completeness.
 */
const PHASE_WORDS: Readonly<Record<EmomView['phase'], string | null>> = {
  untimed: 'NO CLOCK',
  ready: null,
  work: null,
  rest: 'REST',
  finished: 'COMPLETE',
}

// ─────────────────────────────────────────────────────────────────────────────
// The rotation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which movement is live. During the rest remainder — and before the clock is
 * started — it is the movement the *next* minute opens with, labelled `NEXT`
 * rather than `NOW`: the user is resting, and being told to start is the one
 * thing the card must not say.
 */
function markerFor(position: number, view: EmomView): BlockMovementMarker {
  switch (view.phase) {
    case 'work':
      return position === view.activePosition ? 'now' : null
    case 'ready':
      return position === view.activePosition ? 'next' : null
    case 'rest':
      return position === view.nextPosition ? 'next' : null
    case 'untimed':
    case 'finished':
      return null
  }
}

/**
 * One movement of the rotation, as a row of the block's list, read rather than
 * logged. The live one is `BlockPanel.MovementItem`'s to mark — a word, and
 * `aria-current` — so colour is never the cue.
 *
 * Its target is the one its scheduled minute prescribes: the current minute
 * when the movement is live, otherwise its next turn. A sequence also states
 * its whole progression, so a rising target is never a surprise at the
 * boundary. Rest is the block's, stated once per minute at the foot of the
 * card: a per-movement rest line here would be a rest the user is not meant to
 * take.
 */
function EmomMovement({
  exercise,
  shape,
  view,
  marker,
}: {
  exercise: ExerciseProgress
  shape: EmomShape
  view: EmomView
  marker: BlockMovementMarker
}) {
  const prescription = exercise.prescription
  const timed = view.phase !== 'untimed'
  const assignment = timed ? minuteAssignment(exercise.position, shape) : null
  const target = prescribedTarget(prescription)
  // R31, C10 (TASK-003): the same name, compact equipment and prescribed load
  // Review shows, through its formatters and the profile's unit. A target,
  // never a performed weight.
  const readings = liveMovementReadings(prescription, useShellWeightUnit())

  return (
    <BlockPanel.MovementItem marker={marker}>
      {assignment !== null && <BlockPanel.Label>{assignment}</BlockPanel.Label>}

      <BlockPanel.Movement
        title={`${exercise.position}. ${readings.name}`}
        detail={timed ? scheduledTargetText(exercise, shape, view) : prescriptionText(prescription)}
        load={readings.load}
        // C03, R132: the compact equipment beside the name, as Review shows it.
        context={readings.equipment}
      >
        {timed && target?.kind === 'sequence' && (
          <BlockPanel.Note>
            Each turn: {targetNumbers(target)}
          </BlockPanel.Note>
        )}
        {prescription.tempo === null ? null : (
          <BlockPanel.Note>Tempo {prescription.tempo}</BlockPanel.Note>
        )}

        {/* EXE-05, on demand: not an entry the minute asks for. Swaps are Review's (U37). */}
        <ExerciseCoaching exercise={exercise} />
      </BlockPanel.Movement>
    </BlockPanel.MovementItem>
  )
}

/**
 * The target a movement's scheduled minute prescribes, in words. Once the
 * clock has nothing further for it — finished, or past the window — the row
 * states the prescription's target as written rather than a minute's.
 */
function scheduledTargetText(
  exercise: ExerciseProgress,
  shape: EmomShape,
  view: EmomView,
): string {
  const prescription = exercise.prescription
  const minute = scheduledMinuteFor(exercise.position, view, shape)
  if (minute === null) return targetText(prescription)

  const target = targetForMinute(prescription, minute, shape.size)
  return `MIN ${minute} · ${targetText(prescription, target)}`
}
