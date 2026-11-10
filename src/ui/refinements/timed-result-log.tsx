/**
 * TimedResultLog — the accepted timed-results log (accepted gallery reference
 * eded158cfd928d382c9a9409e2c372270312741d, `src/ui/refinements/
 * timed-result-log.tsx`; REUSE.md "Simple results"; LOGGING-FIELDS.md), in the
 * simple selected hierarchy (R90 A): the form's one title, then its result
 * group, then field labels — no Result / Movements / Feedback group titles.
 *
 * TASK-009 (C25–C28; G08; R54, R55, R56, R57, R79, R83, R85, R90) delivers
 * its AMRAP family. The AMRAP's existing score — rounds completed and the reps
 * into the next round, each nullable (`amrap.ts`, DATA-01d) — is one result
 * group of two `QuantitySelector` counts, so the rounds and the partial round
 * read as one coherent result rather than a run of floating lines (C26, R55).
 * Its consumer places it after the work and its prescription (C25, R54).
 *
 * Presentation over a controller it does not own. `value` is the consumer's
 * record and `onChange` its writer; the log keeps no draft, invents no field
 * and saves nothing (LOGGING-FIELDS.md: "Shared appearance does not create
 * shared data fields"). Blank stays blank and an entered zero stays zero all
 * the way through: the counts never emit `null` and there is no reset (C28).
 *
 * TASK-010 (C29, C30; R63, R76, R78, R80, R86, R87, R116, R124) adds the For
 * Time and ladder families: one result group asking "Work completed" with
 * Complete and Incomplete side by side in one row (the accepted
 * `.clr-timed-completion`), then one group with the existing three-face effort
 * (`SetEffortChoice`, unchanged faces, words and categories). Which answer the
 * completion starts at is the consumer's — it follows the work and the clock
 * it actually tracked, never a Finish alone — and the log only draws it. The
 * effort is optional: unanswered is `null`, never a default face, a number or
 * a session mood. R78 limits the completion question to work whose full
 * completion is meaningful, so the AMRAP family is not given one.
 *
 * Shaped to be extended by the later owners of the same form rather than
 * replaced: the family is the `format` discriminant, and each later family or
 * group joins this form under the same title and group recipe — the EMOM's
 * counter-free end log (TASK-011), the ladder's rung results and quiet Undo
 * (TASK-013, TASK-014), richer per-movement actuals and the categorical
 * effort's writer once they exist (TASK-031, TASK-015, TASK-047), and the
 * focused dialog, Save and the four families' adoption into it (TASK-016–018,
 * TASK-046, TASK-041). None of those is drawn here.
 */
import type { ReactNode } from 'react'

import { ChoiceGroup } from '../../design-system/index'
import { useInvalidFocus } from '../formFocus'
import { Heading, HeadingSection } from '../Heading'
import { SetEffortChoice, type SetEffort } from '../set-effort'
import { QuantitySelector } from './quantity'
import './tokens.css'
import './presentation.css'

/** The AMRAP's score as `amrap.ts` keeps it: `null` is unreported, zero is an observed zero. */
export interface AmrapResult {
  readonly roundsCompleted: number | null
  readonly partialRoundReps: number | null
}

/** The family whose result is logged. Later families widen this union (TASK-011, TASK-013, TASK-046). */
export interface AmrapResultLog {
  format: 'amrap'
  value: AmrapResult
  /** The consumer's writer, called with the whole next result on every tap. */
  onChange: (next: AmrapResult) => void
}

/**
 * TASK-010: a For Time or ladder result as its consumer keeps it. `completed`
 * is `true` Complete, `false` Incomplete and `null` not yet answered — no
 * starting point exists yet, so neither option is chosen. `effort` is the
 * existing categorical effort, `null` when unanswered.
 */
export interface CompletionResult {
  readonly completed: boolean | null
  readonly effort: SetEffort | null
}

export interface CompletionResultLog {
  format: 'for_time' | 'ladder'
  value: CompletionResult
  /** The consumer's writer, called with the whole next result on every choice. */
  onChange: (next: CompletionResult) => void
  /**
   * False when the block's record cannot hold the answer — a For Time with no
   * cap (no cap, no claim) — so the question is not asked. Asked otherwise.
   */
  askCompletion?: boolean
  /**
   * True once the block's result is saved. There is no correction writer for a
   * saved block result, so the completion keeps the answer that was saved and
   * is no longer offered as a choice (the chips' shared disabled role).
   */
  saved?: boolean
}

export type TimedResultLogProps = AmrapResultLog | CompletionResultLog

/** The accepted completion question and its two answers, in their one row. */
export const WORK_COMPLETED_LEGEND = 'Work completed'
const COMPLETE = 'complete'
const INCOMPLETE = 'incomplete'

/** The accepted section-log legend for the existing effort faces. */
export const TIMED_EFFORT_LEGEND = 'Effort · optional'
/** What the effort's compact Clear acts on in a block's log. */
const EFFORT_SCOPE = 'this block'

/** One result group of the simple hierarchy: no group title, its fields in order. */
function ResultGroup({ children }: { children: ReactNode }) {
  return <HeadingSection className="clr-timed-log__group">{children}</HeadingSection>
}

/**
 * Nothing to submit here: every change is already the consumer's record. The
 * form still submits through the app's one helper, which prevents the default,
 * so the Enter key can never navigate away from a log; a later Save joins it.
 */
const NOTHING_TO_SUBMIT = () => true

/**
 * Inline in a block's card the form is deliberately unnamed, so it is not a
 * landmark: a section can hold more than one AMRAP, and two `form` landmarks
 * with one name are indistinguishable (axe `landmark-unique`). Its title heads
 * it instead. The focused dialog that later holds one log at a time names it
 * (TASK-016, TASK-046).
 */
export function TimedResultLog(props: TimedResultLogProps) {
  const invalidFocus = useInvalidFocus()
  return (
    <form
      className="clr-timed-log"
      data-log-hierarchy="simple"
      data-timed-format={props.format}
      noValidate
      onSubmit={invalidFocus(NOTHING_TO_SUBMIT)}
    >
      {/*
        The title heads the log at the level of the card's other groups ("Each
        round:"), so the log is the work's sibling in the outline, never a
        part of it.
      */}
      <Heading className="clr-timed-log__title">Log results</Heading>
      {props.format === 'amrap' ? <AmrapGroups {...props} /> : <CompletionGroups {...props} />}
    </form>
  )
}

function AmrapGroups({ value, onChange }: AmrapResultLog) {
  return (
    <ResultGroup>
      <QuantitySelector
        label="Rounds completed"
        value={value.roundsCompleted}
        onChange={(roundsCompleted) => onChange({ ...value, roundsCompleted })}
      />
      <QuantitySelector
        label="Reps into the next round"
        value={value.partialRoundReps}
        onChange={(partialRoundReps) => onChange({ ...value, partialRoundReps })}
      />
    </ResultGroup>
  )
}

/**
 * TASK-010: the result group, then the feedback group, neither titled (R90 A).
 *
 * Work completed (C29; R78, R86, R87): Complete and Incomplete share one row
 * as the two equal chips of one radiogroup — one tab stop, arrows and
 * Home/End, a tick with the colour. The renamed answers replace "All
 * completed" / "Stopped short" and the ladder's "Finished the ladder" / "Hit
 * the time cap". A radiogroup cannot be emptied, so once answered the athlete
 * corrects by choosing the other answer, never by clearing it.
 *
 * Effort (C30; R63, R76, R80, R116): the existing `SetEffortChoice`, so the
 * same Frown, Meh and Smile, the same words, categories, tick, focus and
 * compact Clear back to `null`. Nothing here turns a category into the
 * numeric block effort or reads it as the session's mood.
 */
function CompletionGroups({ value, onChange, askCompletion = true, saved = false }: CompletionResultLog) {
  return (
    <>
      {askCompletion && (
        <ResultGroup>
          <ChoiceGroup
            className="clr-timed-completion"
            legend={WORK_COMPLETED_LEGEND}
            options={[
              { value: COMPLETE, label: 'Complete', disabled: saved },
              { value: INCOMPLETE, label: 'Incomplete', disabled: saved },
            ]}
            value={value.completed === null ? undefined : value.completed ? COMPLETE : INCOMPLETE}
            onChange={(next) => {
              const chosen = Array.isArray(next) ? next[0] : next
              if (chosen === COMPLETE || chosen === INCOMPLETE) {
                onChange({ ...value, completed: chosen === COMPLETE })
              }
            }}
          />
        </ResultGroup>
      )}
      <ResultGroup>
        <SetEffortChoice
          scopeLabel={EFFORT_SCOPE}
          legend={TIMED_EFFORT_LEGEND}
          value={value.effort}
          onChange={(effort) => onChange({ ...value, effort })}
        />
      </ResultGroup>
    </>
  )
}
