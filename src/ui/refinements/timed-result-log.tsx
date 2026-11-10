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
 * Shaped to be extended by the later owners of the same form rather than
 * replaced: the family is the `format` discriminant, and each later family or
 * group joins this form under the same title and group recipe —
 * completion choices and the existing effort faces (TASK-010), the EMOM's
 * counter-free end log (TASK-011), the ladder's results (TASK-013), richer
 * per-movement actuals once their writers exist (TASK-031), and the focused
 * dialog, Save and the four families' adoption into it (TASK-016–018,
 * TASK-046, TASK-041). None of those is drawn here.
 */
import type { ReactNode } from 'react'

import { useInvalidFocus } from '../formFocus'
import { Heading, HeadingSection } from '../Heading'
import { QuantitySelector } from './quantity'
import './tokens.css'
import './presentation.css'

/** The AMRAP's score as `amrap.ts` keeps it: `null` is unreported, zero is an observed zero. */
export interface AmrapResult {
  readonly roundsCompleted: number | null
  readonly partialRoundReps: number | null
}

/** The family whose result is logged. Later families widen this union (TASK-010, TASK-011, TASK-013, TASK-046). */
export interface AmrapResultLog {
  format: 'amrap'
  value: AmrapResult
  /** The consumer's writer, called with the whole next result on every tap. */
  onChange: (next: AmrapResult) => void
}

export type TimedResultLogProps = AmrapResultLog

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
export function TimedResultLog({ format, value, onChange }: TimedResultLogProps) {
  const invalidFocus = useInvalidFocus()
  return (
    <form
      className="clr-timed-log"
      data-log-hierarchy="simple"
      data-timed-format={format}
      noValidate
      onSubmit={invalidFocus(NOTHING_TO_SUBMIT)}
    >
      {/*
        The title heads the log at the level of the card's other groups ("Each
        round:"), so the log is the work's sibling in the outline, never a
        part of it.
      */}
      <Heading className="clr-timed-log__title">Log results</Heading>
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
    </form>
  )
}
