import { Fragment, useState, type ReactNode } from 'react'
import { Button, ChoiceGroup, Input } from '../design-system/index'
import type { Enums } from '../data/database.types'
import {
  draftsAfterProgressChange,
  loadApplies,
  movementActualFromDraft,
  movementAmountMax,
  partialRoundFor,
  type MovementActualDraft,
} from '../data/refinement-logging-rules'
import { isErr } from '../state/errors'
import { exerciseName, modalityLabel, modalityUnit } from '../state/prescription'
import type { BlockProgress } from '../state/workout-progress'
import { ladderRungs, ladderUnit } from '../state/ladder'
import { QuantitySelector } from './quantity-selector'
import { Heading, HeadingSection } from './Heading'
import { LadderCompletion } from './ladder-rungs'
import { SetEffortChoice } from './set-effort'
import { useInvalidFocus } from './formFocus'
import { initialTimedResultDraft } from './timed-result-shell'
import '../styles/timed-workout.css'

export type TimedFormat = 'emom' | 'amrap' | 'for_time' | 'ladder'
export interface TimedResultDraft {
  completed: boolean | null
  count: number | null
  /**
   * AMRAP: reps into the round the window closed on — the shipped AMRAP's
   * partial-round count, kept beside the per-movement amounts (owner decision
   * in the logging contract). Blank (`null`, or absent) is not recorded; 0 is.
   */
  partialReps?: number | null
  highestRung: number | null
  effort: Enums<'set_effort'> | null
  notes: string
  measurements: Record<string, { amount: string; weight: string }>
}

/** Review proposal's explicit receipt; no numeric-RPE conversion or backend claim. */
export interface TimedResultReceipt {
  blockId: string
  format: TimedFormat
  elapsedSeconds: number
  capReached: boolean
  result: TimedResultDraft
  weightUnit: Enums<'weight_unit'> | null
}

function ResultGroup({ title, children }: { title?: string; children: ReactNode }) {
  return <HeadingSection className="clr-timed-log__group">
    {title && <Heading className="clr-timed-log__group-title">{title}</Heading>}
    {children}
  </HeadingSection>
}

/** The log's words for a save that did not land (the accepted reference's, eded158c…). */
const TIMED_LOG_SAVE_FAILED = 'Your log didn’t save. Try again.'

/** Nothing typed for a movement yet. */
const NO_ENTRY: MovementActualDraft = { amount: '', weight: '' }

/** A row id for the inline check only; the shell mints the real one. Never sent. */
const PROBE_ROW_ID = '00000000-0000-4000-8000-000000000000'

/**
 * A3 TASK-117 (TASK-015; C37, AC-R015-01): the round a movement's partial
 * amount belongs to, read from the log's own recorded progress by the rule the
 * shell saves it with (`partialRoundFor`, over the outcome `timedShellOutcome`
 * reports), so what the log offers is what saves: an AMRAP's round after the
 * recorded rounds (none until a rounds count is recorded; an explicit 0 gives
 * round 1); a For Time answered Incomplete, round 1 of a single pass and none
 * for a race of several rounds (it records no rounds count); a ladder's round
 * after the stated prefix while one is left; an EMOM never (the schedule is
 * assumed, so its movements take loads only). Null: no amount is asked.
 */
function partialRoundOfDraft(format: TimedFormat, block: BlockProgress, draft: TimedResultDraft): number | null {
  switch (format) {
    case 'emom':
      return partialRoundFor({ family: 'emom' })
    case 'amrap':
      return partialRoundFor({ family: 'amrap', outcome: draft.count === null ? {} : { roundsCompleted: draft.count } })
    case 'for_time':
      return partialRoundFor({
        family: 'for_time',
        outcome: draft.completed === null ? {} : { completedUnderCap: draft.completed },
        block: { rounds: block.rounds },
      })
    case 'ladder': {
      const rungCount = ladderRungs(block.exercises).length
      const highestRung = draft.completed === null ? null : draft.completed ? rungCount : draft.highestRung
      return partialRoundFor({ family: 'ladder', outcome: highestRung === null ? {} : { highestRung }, rungCount })
    }
  }
}

/** What a refused amount or load is told, in the field, by the same rule that builds the saved row (TASK-015). */
function refusalText(field: string, details: Record<string, unknown> | undefined, unit: string, partialRound: number | null): string {
  if (field === 'weight') return 'Enter a weight of zero or more'
  if (typeof details?.max === 'number') return `At most ${details.max} ${unit} in round ${partialRound}`
  return field === 'actual_distance' ? `Enter a distance in ${unit}, 0 or more` : `Enter ${unit} as a whole number, 0 or more`
}

/**
 * A3 TASK-105 (F3; TASK-048, AC-R032-01/03): `saveFailed` is a failure the
 * block keeps beyond this form — a ladder's durable attempt notes it, so it is
 * said again after a reload or a refused forward-action save — until a save
 * succeeds. The form's own failure (a Save log refused while it is open) is
 * said in the same words; either way there is one alert. A3 TASK-116 keeps an
 * AMRAP's and a For Time's the same way, on their own records.
 *
 * A3 TASK-116 (TASK-010, C29; R78): `askCompletion` is false when the block's
 * record cannot hold the answer — a For Time with no cap (no cap, no claim) —
 * so "Work completed" is not asked. Asked otherwise, for For Time and ladder.
 * A For Time's partial amounts belong to a race answered Incomplete, never to
 * one nobody answered.
 *
 * A3 TASK-117 (F3; TASK-015, TASK-047; C37, AC-C37-01, AC-R015-01/02): each
 * movement's group is drawn by the rules the shell saves it with
 * (`src/data/refinement-logging-rules.ts`). An amount field only while a
 * partial round applies (`partialRoundOfDraft`) — an AMRAP's none until a
 * rounds count is recorded, a For Time's only for a single pass answered
 * Incomplete, an EMOM's never — in the movement's own unit (a distance takes a
 * decimal), bounded where the contract bounds it (`movementAmountMax`); a load
 * field only on a loaded movement (`loadApplies`, the set logger's rule), in
 * the athlete's unit. A movement with neither has no group. Blank is not
 * recorded and a typed 0 is a 0; nothing is filled from a planned target or
 * load. The rule that builds the saved row (`movementActualFromDraft`) says,
 * in the field, what an entry is refused on. A changed round count clears the
 * amounts and keeps the loads (`draftsAfterProgressChange`), as a changed
 * answer or rung already did.
 */
export function TimedResultLog({ block, format, finished, weightUnit, onSave, initial,
  value, onDraftChange, completionAction, hierarchy = 'simple', rungEmphasis = 'reps', accessibleName = 'Log section results', embedded = false,
  saveFailed = false, askCompletion = true,
}: {
  block: BlockProgress; format: TimedFormat; finished: boolean; weightUnit: Enums<'weight_unit'> | null
  onSave: (result: TimedResultDraft) => Promise<void>; initial?: TimedResultDraft
  value?: TimedResultDraft; onDraftChange?: (next: TimedResultDraft) => void; completionAction?: ReactNode
  hierarchy?: 'simple' | 'grouped'; rungEmphasis?: 'round' | 'reps'; accessibleName?: string; embedded?: boolean
  saveFailed?: boolean; askCompletion?: boolean
}) {
  const rungs = ladderRungs(block.exercises)
  const [localDraft, setLocalDraft] = useState<TimedResultDraft>(() => initial ?? initialTimedResultDraft(format, finished, rungs.length))
  const draft = value ?? localDraft
  const setDraft = (next: TimedResultDraft | ((current: TimedResultDraft) => TimedResultDraft)) => {
    const result = typeof next === 'function' ? next(draft) : next
    if (onDraftChange) onDraftChange(result); else setLocalDraft(result)
  }
  const onSubmit = useInvalidFocus()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const patch = (part: Partial<TimedResultDraft>) => setDraft(previous => ({ ...previous, ...part }))
  const field = (id: string, kind: 'amount' | 'weight', value: string) => setDraft(previous => ({
    ...previous, measurements: { ...previous.measurements, [id]: {
      amount: previous.measurements[id]?.amount ?? '', weight: previous.measurements[id]?.weight ?? '', [kind]: value,
    } },
  }))
  // A partial quantity belongs to a particular round. Preserve weights when
  // completion/progress changes, but never attach the old quantity to a new rung.
  const progress = (completed: boolean, highestRung: number | null) => setDraft(previous => ({
    ...previous, completed, highestRung,
    measurements: Object.fromEntries(Object.entries(previous.measurements)
      .map(([id, value]) => [id, { ...value, amount: '' }])),
  }))
  // A3 TASK-105 (TASK-013/TASK-015, AC-R013-01/03): a ladder's partial work
  // belongs to the round after the stated prefix, so it is asked only once a
  // prefix is stated (zero included) and a round is left — nothing stated is
  // not round 0, and no field is offered for a round nobody named. A3 TASK-117
  // reads every family's round by the same rule the shell saves it with.
  const partialRound = partialRoundOfDraft(format, block, draft)
  // A3 TASK-105 (C33, AC-R013-02): the rung's unit is the ladder's shared
  // reading (`ladderUnit`), the same `reps` / `sec` / `m` its prescription grid
  // states — never a longer word than the round it names.
  const rungUnit = ladderUnit(block.exercises)
  const measurements = block.exercises.flatMap(exercise => {
    const p = exercise.prescription
    // A3 TASK-117 (TASK-015): a load only where one can attach — the set logger's rule, which the saved row also applies.
    const loaded = loadApplies(p)
    const amount = partialRound !== null
    if (!loaded && !amount) return []
    const name = exerciseName(p.exercise_id)
    const unit = modalityLabel(p)
    const entry = draft.measurements[exercise.exerciseId] ?? NO_ENTRY
    const max = movementAmountMax(p, format, partialRound)
    // The rule that builds the saved row, read here so what passes is what saves. Its unit is never stamped here.
    const checked = movementActualFromDraft({
      id: PROBE_ROW_ID, workoutExerciseId: exercise.exerciseId, prescription: p, partialRound, weightUnit: weightUnit ?? 'kg', draft: entry,
    }, format)
    const refused = isErr(checked) ? String(checked.error.details?.field ?? '') : null
    const details = isErr(checked) ? checked.error.details : undefined
    const amountRefused = refused !== null && refused !== 'weight'
    const weightRefused = refused === 'weight'
    return [<ResultGroup key={exercise.exerciseId} title={name}>
      {amount && <Input type="number" inputMode={p.modality === 'distance' ? 'decimal' : 'numeric'} min="0"
        step={p.modality === 'distance' ? 'any' : '1'} max={max ?? undefined}
        label={format === 'amrap' ? 'Completed in next round' : format === 'ladder' ? `Completed in round ${partialRound}` : 'Completed'}
        aria-label={`${format === 'amrap' ? 'Next round' : format === 'ladder' ? `Round ${partialRound}` : 'Completed'} · ${name}`}
        unit={unit} value={entry.amount} invalid={amountRefused}
        errorText={amountRefused ? refusalText(refused, details, modalityUnit(p), partialRound) : undefined}
        onChange={value => field(exercise.exerciseId, 'amount', value)} />}
      {loaded && <Input type="number" inputMode="decimal" min="0" step="any" label="Weight used" aria-label={`Weight · ${name}`}
        unit={weightUnit ?? undefined} value={entry.weight} invalid={weightRefused}
        errorText={weightRefused ? refusalText('weight', details, modalityUnit(p), partialRound) : undefined}
        onChange={value => field(exercise.exerciseId, 'weight', value)} />}
    </ResultGroup>]
  })
  const Container = embedded ? Fragment : HeadingSection
  return <Container>
    <form className="clr-timed-log" data-log-hierarchy={hierarchy} aria-label={accessibleName} onSubmit={onSubmit(() => {
      if (saving) return false
      setSaving(true); setFailure(null)
      return onSave(draft).then(() => true, () => { setFailure(TIMED_LOG_SAVE_FAILED); return false }).finally(() => setSaving(false))
    })}>
      {!embedded && <Heading className="clr-timed-log__title">Log results</Heading>}
      <ResultGroup title={hierarchy === 'grouped' && format !== 'emom' ? 'Result' : undefined}>
        {(format === 'ladder' || format === 'for_time') && askCompletion && <ChoiceGroup className="clr-timed-completion" legend="Work completed"
          value={draft.completed ? 'complete' : 'partial'}
          options={[{ value: 'complete', label: 'Complete' }, { value: 'partial', label: 'Incomplete' }]}
          onChange={next => {
            const complete = next === 'complete'
            progress(complete, format === 'ladder' ? (complete ? rungs.length : null) : draft.highestRung)
          }} />}
        {completionAction}
        {/* A3 TASK-117 (TASK-015): a changed count moves the partial round, so its amounts clear and its loads stay. */}
        {format === 'amrap' && <QuantitySelector label="Rounds completed" value={draft.count} onChange={count => setDraft(previous => ({
          ...previous, count, measurements: draftsAfterProgressChange(previous.measurements, previous.count, count),
        }))} />}
        {format === 'amrap' && <QuantitySelector label="Reps into the next round" value={draft.partialReps ?? null} onChange={partialReps => patch({ partialReps })} />}
        {format === 'ladder' && <LadderCompletion rungs={rungs} unit={rungUnit} completedThrough={draft.highestRung}
          emphasis={rungEmphasis} onChange={highestRung => progress(highestRung === rungs.length, highestRung)} />}
      </ResultGroup>
      {hierarchy === 'grouped' && measurements.length > 0
        ? <ResultGroup title="Movements">{measurements}</ResultGroup> : measurements}
      <ResultGroup title={hierarchy === 'grouped' ? 'Feedback' : undefined}>
        <SetEffortChoice scopeLabel="this section" legend="Effort · optional" value={draft.effort}
          onChange={effort => patch({ effort })} />
        <Input label="Notes · optional" multiline rows={2} value={draft.notes} onChange={notes => patch({ notes })} />
      </ResultGroup>
      {(failure !== null || saveFailed) && <p role="alert">{failure ?? TIMED_LOG_SAVE_FAILED}</p>}
      <div className="clr-timed-actions"><Button type="submit" variant="primary" loading={saving}>Save log</Button></div>
    </form>
  </Container>
}
