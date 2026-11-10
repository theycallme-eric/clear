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
 * TASK-011 (C31; R43, R84) adds the EMOM family: the end of the schedule's
 * log, with no minutes-completed counter, no completion question and no
 * confirmation step. The schedule as the block specifies it is assumed done;
 * the one group holds the existing optional notes, where an exception — a
 * dropped rep, a skipped minute, a stop — is written in the athlete's own
 * words. The consumer owns the draft and reports it to the block's existing
 * `block_results.notes` through the shell's one writer; nothing here counts a
 * minute, and a note never changes the clock or the time it recorded.
 *
 * TASK-013 (C33, C34, C36; R69, R77, R88, R92, R93, R99, R118, R124) adds the
 * ladder's rung results to its result group: once the completion is answered
 * (or started at its starting point), "Rounds completed" — the rep-first
 * wrapping tiles of the shared `LadderCompletion`, the selected prefix and its
 * count — under Complete / Incomplete, as the accepted log composes them. The
 * consumer imports its tracked live progress into them at Finish or the cap
 * and owns every change; the log only draws them.
 *
 * TASK-014 (C38, C39, C60; R124, R130, R141; P04) adds the quiet completion
 * action between them — the ladder's `Undo finish · Resume ladder` — drawn by
 * this log so its look and alignment have one owner, offered and handled by
 * the consumer over its own attempt.
 *
 * TASK-015 (C37; R62, R69, R116; AC-C37-01, AC-R015-01, AC-R015-02) adds the
 * per-movement entries the accepted log draws between the result and the
 * feedback: one titled group per movement — the amount completed in the round
 * the partial belongs to, in the movement's own unit, and the actual load
 * used, in the athlete's unit, each only where it applies. Which round is the
 * consumer's, decided by TASK-030's `partialRoundFor` from the block's own
 * recorded progress (the AMRAP's recorded rounds, the ladder's stated rung,
 * the single-pass For Time answered Incomplete): the log draws its number and
 * never guesses one, so with no round recorded there is no amount field. A
 * load field appears only on a loaded movement (`loadApplies`, the set
 * logger's rule). Blank is not recorded; a typed `0` is a zero; nothing is
 * filled from a planned target or `load_value`; the same rules that build the
 * saved row (`movementActualFromDraft`) say inline what a value is refused on,
 * so what passes here is what saves. The consumer owns the typed entries and
 * their record (the AMRAP's and For Time's stored records, the ladder's
 * durable draft) and the shell saves them through its one completion path;
 * once the row is saved the fields keep their values and are no longer
 * offered. The AMRAP's "Reps into the next round" stays beside them: neither
 * is derived from the other.
 *
 * Shaped to be extended by the later owners of the same form rather than
 * replaced: the family is the `format` discriminant, and each later family or
 * group joins this form under the same title and group recipe — the EMOM's
 * applicable weights, notes for the other families and the categorical
 * effort's wider adoption (TASK-046, TASK-047), and the focused dialog, Save
 * and the four families' adoption into it (TASK-016–018, TASK-046, TASK-041).
 * None of those is drawn here.
 */
import type { ReactNode } from 'react'

import type { Enums } from '../../data/database.types'
import {
  loadApplies,
  movementActualFromDraft,
  movementAmountMax,
  type MovementActualDraft,
  type PrescribedColumnsWithEquipment,
  type TimedFamily,
} from '../../data/refinement-logging-rules'
import { isErr } from '../../state/errors'
import { exerciseName, modalityUnit } from '../../state/prescription'
import { Button, ChoiceGroup, Input } from '../../design-system/index'
import { useInvalidFocus } from '../formFocus'
import { Heading, HeadingSection } from '../Heading'
import { SetEffortChoice, type SetEffort } from '../set-effort'
import { LadderCompletion, type LadderCompletionProps } from './ladder'
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
  /** TASK-015: the per-movement entries, drawn after the counts. Omitted or null, none. */
  movements?: MovementEntryLog | null
  /** TASK-015: once the block's result is saved, the movement fields keep their values and are no longer offered. */
  saved?: boolean
}

/**
 * TASK-015 (C37): one movement of the block as the log needs it — its
 * identity and its prescription's columns (modality, distance unit, equipment,
 * the ladder's sequence), read for the field's unit, bound and whether a load
 * applies. Never read for a value.
 */
export interface MovementEntryExercise {
  /** `workout_exercises.id`, the identity the entry is saved under. */
  readonly exerciseId: string
  readonly prescription: PrescribedColumnsWithEquipment
}

/**
 * TASK-015 (C37, AC-R015-01): the per-movement partial and load entries, over
 * the consumer's own record. `partialRound` is the round a partial amount
 * belongs to, decided by the consumer from its recorded progress through
 * TASK-030's `partialRoundFor` (the AMRAP's recorded rounds + 1, the ladder's
 * stated rung + 1, the single-pass For Time's round 1 when Incomplete); null
 * means no partial applies, so no amount is asked. `values` are the entries
 * exactly as typed; `onChange` is the consumer's writer for one movement.
 */
export interface MovementEntryLog {
  readonly exercises: readonly MovementEntryExercise[]
  readonly partialRound: number | null
  /** The unit a typed load is stated in: the athlete's choice, else the profile's. */
  readonly weightUnit: Enums<'weight_unit'>
  readonly values: Readonly<Record<string, MovementActualDraft>>
  readonly onChange: (exerciseId: string, next: MovementActualDraft) => void
}

/** The unit a load is stated in where no shell supplies the profile's (a bare mount); the route always does. */
export const UNSCOPED_WEIGHT_UNIT: Enums<'weight_unit'> = 'kg'

/** The accepted load field's label. */
export const WEIGHT_USED_LABEL = 'Weight used'

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
  /**
   * TASK-013: the ladder's rounds completed — the rep-first result tiles,
   * drawn under the completion row in the same result group. Omitted or null,
   * none is drawn (before the ladder is answered, and for For Time).
   */
  rounds?: Omit<LadderCompletionProps, 'disabled'> | null
  /**
   * TASK-014: the quiet action under the completion row and before the rounds
   * (C39) — the ladder's `Undo finish · Resume ladder` while its accidental
   * Finish can still be undone. Omitted or null, none is drawn. The log owns
   * how it looks; the consumer owns whether it is offered and what it does.
   */
  completionAction?: CompletionAction | null
  /** TASK-015: the per-movement entries, between the result and the effort. Omitted or null, none. */
  movements?: MovementEntryLog | null
}

/**
 * TASK-014 (C39, C60; R124, R130, R141; P04): one quiet action in the result
 * group. `onAction` is the consumer's handler on its own state owner.
 */
export interface CompletionAction {
  /** The action's words, which are also its accessible name. */
  readonly label: string
  readonly onAction: () => void
}

/**
 * TASK-011: the EMOM's end log as its consumer keeps it. `notes` is the
 * athlete's own words, `''` when nothing was written. There is no count and no
 * completion answer: the schedule as specified is assumed (C31, R84).
 */
export interface EmomResult {
  readonly notes: string
}

export interface EmomResultLog {
  format: 'emom'
  value: EmomResult
  /** The consumer's writer, called with the whole next result on every edit. */
  onChange: (next: EmomResult) => void
}

export type TimedResultLogProps = AmrapResultLog | CompletionResultLog | EmomResultLog

/** The accepted optional notes label of the timed logs (accepted reference, LOGGING-FIELDS.md). */
export const TIMED_NOTES_LABEL = 'Notes · optional'

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
 * TASK-015: one movement's group — the accepted per-movement group, titled by
 * the movement's name (the one title the simple hierarchy keeps, because a
 * movement's fields are that movement's), its fields at the movement gap.
 */
function MovementGroup({ exerciseId, name, children }: { exerciseId: string; name: string; children: ReactNode }) {
  return (
    <HeadingSection className="clr-timed-log__group clr-timed-log__group--movement" data-timed-movement={exerciseId}>
      <Heading className="clr-timed-log__group-title">{name}</Heading>
      {children}
    </HeadingSection>
  )
}

const NO_ENTRY: MovementActualDraft = { amount: '', weight: '' }
/** A row id for the inline check only; the shell mints the real one. Never sent. */
const PROBE_ROW_ID = '00000000-0000-4000-8000-000000000000'

/** The amount field's words: the round the partial belongs to, from the consumer's recorded progress. */
function amountLabel(format: TimedFamily, partialRound: number): string {
  return format === 'for_time' ? 'Completed' : `Completed in round ${partialRound}`
}

/** What a refused amount or load is told, in the field, by the same rule that builds the row. */
function refusalText(field: string, details: Record<string, unknown> | undefined, unit: string, partialRound: number | null): string {
  if (field === 'weight') return 'Enter a weight of zero or more'
  if (typeof details?.max === 'number') return `At most ${details.max} ${unit} in round ${partialRound}`
  return field === 'actual_distance' ? `Enter a distance in ${unit}, 0 or more` : `Enter ${unit} as a whole number, 0 or more`
}

/**
 * TASK-015 (C37; AC-C37-01, AC-R015-01): the per-movement groups, in the
 * block's order. A movement gets an amount field only while a partial round
 * applies (the consumer's `partialRound`), labelled with that round and the
 * movement's own unit, bounded where the contract bounds it (a ladder's
 * target at that rung); a load field only where the set logger's rule says
 * the movement is loaded, in the athlete's unit. A movement with neither is
 * not drawn. The same rule that builds the saved row checks each entry and
 * says, in the field, what it is refused on; blank is never refused and never
 * recorded. Nothing here reads a planned target or `load_value` into a field.
 */
function MovementGroups({ format, movements, saved }: { format: TimedFamily; movements: MovementEntryLog; saved: boolean }) {
  const { partialRound, weightUnit, values, onChange } = movements
  return (
    <>
      {movements.exercises.map(({ exerciseId, prescription }) => {
        const amountApplies = partialRound !== null
        const load = loadApplies(prescription)
        if (!amountApplies && !load) return null
        const name = exerciseName(prescription.exercise_id)
        const value = values[exerciseId] ?? NO_ENTRY
        const unit = modalityUnit(prescription)
        const max = movementAmountMax(prescription, format, partialRound)
        const checked = movementActualFromDraft(
          { id: PROBE_ROW_ID, workoutExerciseId: exerciseId, prescription, partialRound, weightUnit, draft: value },
          format,
        )
        const refused = isErr(checked) ? String(checked.error.details?.field ?? '') : null
        const refusedDetails = isErr(checked) ? checked.error.details : undefined
        const amountRefused = refused !== null && refused !== 'weight'
        const weightRefused = refused === 'weight'
        return (
          <MovementGroup key={exerciseId} exerciseId={exerciseId} name={name}>
            {amountApplies && (
              <Input
                type="number"
                inputMode={prescription.modality === 'distance' ? 'decimal' : 'numeric'}
                min="0"
                step={prescription.modality === 'distance' ? 'any' : '1'}
                max={max ?? undefined}
                label={amountLabel(format, partialRound)}
                aria-label={`${format === 'for_time' ? 'Completed' : `Round ${partialRound}`} · ${name}`}
                unit={unit}
                value={value.amount}
                disabled={saved}
                invalid={amountRefused}
                errorText={amountRefused ? refusalText(refused, refusedDetails, unit, partialRound) : undefined}
                onChange={(amount: string) => onChange(exerciseId, { ...value, amount })}
              />
            )}
            {load && (
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                label={WEIGHT_USED_LABEL}
                aria-label={`Weight · ${name}`}
                unit={weightUnit}
                value={value.weight}
                disabled={saved}
                invalid={weightRefused}
                errorText={weightRefused ? refusalText('weight', refusedDetails, unit, partialRound) : undefined}
                onChange={(weight: string) => onChange(exerciseId, { ...value, weight })}
              />
            )}
          </MovementGroup>
        )
      })}
    </>
  )
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
      {props.format === 'amrap' ? (
        <AmrapGroups {...props} />
      ) : props.format === 'emom' ? (
        <EmomGroups {...props} />
      ) : (
        <CompletionGroups {...props} />
      )}
    </form>
  )
}

/**
 * TASK-011: one untitled group (R90 A) holding the existing optional notes —
 * the public multiline field, as the reference and every other notes field in
 * the app draw it. No QuantitySelector, no minutes tally, no Work completed
 * row and no confirmation: completion of the schedule as specified is the
 * default (C31, R84), and an exception is the athlete's words, not a number.
 */
function EmomGroups({ value, onChange }: EmomResultLog) {
  return (
    <ResultGroup>
      <Input
        label={TIMED_NOTES_LABEL}
        multiline
        rows={2}
        value={value.notes}
        onChange={(notes: string) => onChange({ notes })}
      />
    </ResultGroup>
  )
}

function AmrapGroups({ value, onChange, movements = null, saved = false }: AmrapResultLog) {
  return (
    <>
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
      {/* TASK-015 (C37): each movement's next-round amount and load, after the counts; neither derived from the other. */}
      {movements !== null && <MovementGroups format="amrap" movements={movements} saved={saved} />}
    </>
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
 * Rounds completed (TASK-013: C33, C34): a ladder's rep-first tiles follow
 * the answer in the same group — the ordered prefix it refines, with its
 * count — disabled with the answer once the result is saved.
 *
 * The completion action (TASK-014: C39, C60; R124, R130, R141; P04) sits
 * between them: below Complete / Incomplete, before Rounds completed. It is
 * the existing small quiet button — no frame, no fill at rest, the shared
 * control height, left-aligned — whose visible text starts exactly where the
 * dynamic rounds-completed count's text starts: the group's content edge. Its
 * inherited inline inset is given back outside its box, so none is left on
 * the text (R141: "do not keep the quiet button's extra visible text inset")
 * while its focus frame still clears the letters; its height is untouched, so
 * the touch target stays usable. It asks nothing further: no confirmation
 * (R124).
 *
 * Effort (C30; R63, R76, R80, R116): the existing `SetEffortChoice`, so the
 * same Frown, Meh and Smile, the same words, categories, tick, focus and
 * compact Clear back to `null`. Nothing here turns a category into the
 * numeric block effort or reads it as the session's mood.
 */
function CompletionGroups({
  format,
  value,
  onChange,
  askCompletion = true,
  saved = false,
  rounds = null,
  completionAction = null,
  movements = null,
}: CompletionResultLog) {
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
          {/* TASK-014 (C39, C60): the quiet action, under the answer and before the rounds. */}
          {completionAction !== null && !saved && (
            <div className="clr-timed-undo" data-timed-undo="">
              <Button variant="quiet" size="sm" onClick={completionAction.onAction}>
                {completionAction.label}
              </Button>
            </div>
          )}
          {/* TASK-013 (C33, C34): the rounds completed, under the answer they refine. */}
          {rounds !== null && <LadderCompletion {...rounds} disabled={saved} />}
        </ResultGroup>
      )}
      {/* TASK-015 (C37): each movement's partial amount and load, between the result and the effort. */}
      {movements !== null && <MovementGroups format={format} movements={movements} saved={saved} />}
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
