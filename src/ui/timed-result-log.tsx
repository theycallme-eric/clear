import { useState } from 'react'
import { Button, Checkbox, ChoiceGroup, Input } from '../design-system/index'
import type { Enums } from '../data/database.types'
import { exerciseName, modalityLabel } from '../state/prescription'
import type { BlockProgress } from '../state/workout-progress'
import { ladderRungs } from '../state/ladder'
import { Card } from './card'
import { QuantitySelector } from './quantity-selector'
import { Heading } from './Heading'
import { SET_EFFORT_CHOICES } from './set-effort'

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

export function TimedResultLog({ block, format, finished, weightUnit, onSave, initial }: {
  block: BlockProgress; format: TimedFormat; finished: boolean; weightUnit: Enums<'weight_unit'> | null
  onSave: (result: TimedResultDraft) => Promise<void>; initial?: TimedResultDraft
}) {
  const rungs = ladderRungs(block.exercises)
  const [draft, setDraft] = useState<TimedResultDraft>(() => initial ?? {
    completed: format === 'ladder' || format === 'for_time' ? finished : null, count: null,
    highestRung: format === 'ladder' && finished ? rungs.length : null,
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
  return <form className="clr-timed-log" aria-label="Log section results" onSubmit={event => {
    event.preventDefault()
    if (saving) return
    setSaving(true); setFailure(null)
    void onSave(draft).catch(() => setFailure('Your log didn’t save. Try again.')).finally(() => setSaving(false))
  }}>
    <Heading className="label">Log results</Heading>
    {(format === 'ladder' || format === 'for_time') && <ChoiceGroup legend="Work completed" value={draft.completed ? 'complete' : 'partial'}
      options={[{ value: 'complete', label: 'All completed' }, { value: 'partial', label: 'Stopped short' }]}
      onChange={next => {
        const complete = next === 'complete'
        patch({ completed: complete, highestRung: format === 'ladder' ? (complete ? rungs.length : null) : draft.highestRung })
      }} />}
    {format === 'amrap' && <Card heading="Your score">
      <QuantitySelector label="Rounds completed" value={draft.count} onChange={count => patch({ count })} />
    </Card>}
    {format === 'emom' && <QuantitySelector label="Minutes completed" value={draft.count}
      max={block.timerSeconds === null ? undefined : Math.floor(block.timerSeconds / 60)} onChange={count => patch({ count })} />}
    {format === 'ladder' && <Card heading="Rungs completed">
      <div className="clr-timed-rung-checks">
        {rungs.map(rung => <Checkbox key={rung.number} label={`Round ${rung.number} · ${rung.targets.join(' / ')}`}
          checked={draft.highestRung !== null && rung.number <= draft.highestRung}
          onChange={checked => {
            const highestRung = checked ? rung.number : rung.number - 1
            patch({ highestRung, completed: highestRung === rungs.length })
          }} />)}
      </div>
    </Card>}
    {block.exercises.map(exercise => {
      const p = exercise.prescription
      const loaded = p.equipment_used !== 'bodyweight' && p.load_type !== 'bodyweight' && p.equipment_used !== 'none'
      const amount = format === 'amrap' || (format === 'for_time' && !draft.completed) || (format === 'ladder' && !draft.completed)
      if (!loaded && !amount) return null
      const name = exerciseName(p.exercise_id)
      const unit = modalityLabel(p)
      return <Card key={exercise.exerciseId} heading={name}>
        {amount && <Input type="number" inputMode="numeric" min="0" step="1"
          label={format === 'amrap' ? 'Next round' : format === 'ladder' ? 'Next rung' : 'Completed'}
          aria-label={`${format === 'amrap' ? 'Next round' : format === 'ladder' ? 'Next rung' : 'Completed'} · ${name}`}
          unit={unit} value={draft.measurements[exercise.exerciseId]?.amount ?? ''}
          onChange={value => field(exercise.exerciseId, 'amount', value)} />}
        {loaded && <Input type="number" inputMode="decimal" min="0" step="any" label="Weight used" aria-label={`Weight · ${name}`}
          unit={weightUnit ?? undefined} value={draft.measurements[exercise.exerciseId]?.weight ?? ''}
          onChange={value => field(exercise.exerciseId, 'weight', value)} />}
      </Card>
    })}
    <ChoiceGroup legend="Effort · optional" options={[...SET_EFFORT_CHOICES].reverse().map(({ value, label }) => ({ value, label }))} value={draft.effort ?? undefined}
      onChange={next => {
        const choice = SET_EFFORT_CHOICES.find(option => option.value === next)
        if (choice) patch({ effort: choice.value })
      }} />
    <Input label="Notes · optional" multiline rows={2} value={draft.notes} onChange={notes => patch({ notes })} />
    {failure !== null && <p role="alert">{failure}</p>}
    <div className="clr-timed-actions"><Button type="submit" variant="primary" loading={saving}>Save log</Button></div>
  </form>
}
