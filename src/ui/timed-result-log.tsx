import { Fragment, useState, type ReactNode } from 'react'
import { Button, ChoiceGroup, Input } from '../design-system/index'
import type { Enums } from '../data/database.types'
import { exerciseName, modalityLabel } from '../state/prescription'
import type { BlockProgress } from '../state/workout-progress'
import { ladderRungs } from '../state/ladder'
import { QuantitySelector } from './quantity-selector'
import { Heading, HeadingSection } from './Heading'
import { LadderCompletion } from './ladder-rungs'
import { SetEffortChoice } from './set-effort'
import '../styles/timed-workout.css'

export type TimedFormat = 'emom' | 'amrap' | 'for_time' | 'ladder'
export interface TimedResultDraft {
  completed: boolean | null
  count: number | null
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

export function TimedResultLog({ block, format, finished, weightUnit, onSave, initial,
  hierarchy = 'simple', rungEmphasis = 'reps', accessibleName = 'Log section results', embedded = false,
}: {
  block: BlockProgress; format: TimedFormat; finished: boolean; weightUnit: Enums<'weight_unit'> | null
  onSave: (result: TimedResultDraft) => Promise<void>; initial?: TimedResultDraft
  hierarchy?: 'simple' | 'grouped'; rungEmphasis?: 'round' | 'reps'; accessibleName?: string; embedded?: boolean
}) {
  const rungs = ladderRungs(block.exercises)
  const [draft, setDraft] = useState<TimedResultDraft>(() => initial ?? {
    completed: format === 'emom' ? true : format === 'ladder' || format === 'for_time' ? finished : null,
    count: null, highestRung: format === 'ladder' && finished ? rungs.length : null,
    effort: null, notes: '', measurements: {},
  })
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
  const nextRung = (draft.highestRung ?? 0) + 1
  const hasNextRung = nextRung <= rungs.length
  const laddered = block.exercises.find(exercise => exercise.prescription.target_sequence !== null)
  const rungUnit = laddered ? modalityLabel(laddered.prescription).toLowerCase() : 'reps'
  const measurements = block.exercises.flatMap(exercise => {
    const p = exercise.prescription
    const loaded = p.equipment_used !== 'bodyweight' && p.load_type !== 'bodyweight' && p.equipment_used !== 'none'
    const amount = format === 'amrap' || (format === 'for_time' && !draft.completed)
      || (format === 'ladder' && !draft.completed && hasNextRung)
    if (!loaded && !amount) return []
    const name = exerciseName(p.exercise_id)
    const unit = modalityLabel(p)
    const target = format === 'ladder' ? p.target_sequence?.[nextRung - 1] ?? p.target_value : null
    return [<ResultGroup key={exercise.exerciseId} title={name}>
      {amount && <Input type="number" inputMode="numeric" min="0" step="1" max={target ?? undefined}
        label={format === 'amrap' ? 'Completed in next round' : format === 'ladder' ? `Completed in round ${nextRung}` : 'Completed'}
        aria-label={`${format === 'amrap' ? 'Next round' : format === 'ladder' ? `Round ${nextRung}` : 'Completed'} · ${name}`}
        unit={unit} value={draft.measurements[exercise.exerciseId]?.amount ?? ''}
        onChange={value => field(exercise.exerciseId, 'amount', value)} />}
      {loaded && <Input type="number" inputMode="decimal" min="0" step="any" label="Weight used" aria-label={`Weight · ${name}`}
        unit={weightUnit ?? undefined} value={draft.measurements[exercise.exerciseId]?.weight ?? ''}
        onChange={value => field(exercise.exerciseId, 'weight', value)} />}
    </ResultGroup>]
  })
  const Container = embedded ? Fragment : HeadingSection
  return <Container>
    <form className="clr-timed-log" data-log-hierarchy={hierarchy} aria-label={accessibleName} onSubmit={event => {
      event.preventDefault()
      if (saving) return
      setSaving(true); setFailure(null)
      void onSave(draft).catch(() => setFailure('Your log didn’t save. Try again.')).finally(() => setSaving(false))
    }}>
      {!embedded && <Heading className="clr-timed-log__title">Log results</Heading>}
      <ResultGroup title={hierarchy === 'grouped' && format !== 'emom' ? 'Result' : undefined}>
        {(format === 'ladder' || format === 'for_time') && <ChoiceGroup className="clr-timed-completion" legend="Work completed"
          value={draft.completed ? 'complete' : 'partial'}
          options={[{ value: 'complete', label: 'Complete' }, { value: 'partial', label: 'Incomplete' }]}
          onChange={next => {
            const complete = next === 'complete'
            progress(complete, format === 'ladder' ? (complete ? rungs.length : null) : draft.highestRung)
          }} />}
        {format === 'amrap' && <QuantitySelector label="Rounds completed" value={draft.count} onChange={count => patch({ count })} />}
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
      {failure !== null && <p role="alert">{failure}</p>}
      <div className="clr-timed-actions"><Button type="submit" variant="primary" loading={saving}>Save log</Button></div>
    </form>
  </Container>
}
