/** Accepted rep-first and compact ladder owners; legacy route adoption stays separate. */
import type { ExerciseProgress } from '../../state/workout-progress'
import type { Enums } from '../../data/database.types'
import { exerciseName, modalityLabel } from '../../state/prescription'
import { equipmentName, loadText } from '../../state/review'
import { Chip } from '../../design-system/index'
import { ladderRungs, rungLabel, rungNumbers, type LadderRung } from '../../state/ladder'
import './presentation.css'
/** End-log variant: ordered completion, wrapping week-strip-style element frames.
 * Existing live/read-only and highest-reached radio owners remain unchanged.
 */
export function LadderCompletion({ rungs, unit, completedThrough, onChange, emphasis = 'reps' }: {
  rungs: readonly LadderRung[]
  unit: string
  completedThrough: number | null
  onChange: (number: number) => void
  emphasis?: 'round' | 'reps'
}) {
  if (rungs.length === 0) return null
  return <fieldset className="clr-ladder-completion" data-rung-emphasis={emphasis}>
    <legend className="label">Rounds completed</legend>
    <div className="clr-ladder-completion__tiles">
      {rungs.map(rung => {
        const selected = completedThrough !== null && rung.number <= completedThrough
        const target = rungNumbers(rung)
        return <Chip key={rung.number} className="clr-ladder-completion__tile" selected={selected}
          style={{ width: '100%', minHeight: 'calc(var(--control-height) * 2)', padding: 'var(--spacing-200) var(--spacing-100)', justifyContent: 'center' }}
          aria-label={`Round ${rung.number}: ${rungLabel(rung, unit)}`}
          onClick={() => onChange(selected ? rung.number - 1 : rung.number)}>
          <span className="clr-ladder-completion__content" aria-hidden="true">
            <span className="clr-ladder-completion__round">R{emphasis === 'reps' ? rung.number : ''}</span>
            <span className="clr-ladder-completion__number">{emphasis === 'round' ? rung.number : target}</span>
            <span className="clr-ladder-completion__target">{emphasis === 'round' ? `${target} ` : ''}{unit}</span>
          </span>
        </Chip>
      })}
    </div>
    <p className="clr-ladder-completion__status" aria-live="polite">{completedThrough ?? 0} of {rungs.length} rounds completed</p>
  </fieldset>
}

/** Compact prescription; an optional ordered progress action checks off whole rounds. */
export function LadderPrescription({ exercises, weightUnit, completedThrough = null, onProgress }: {
  exercises: readonly ExerciseProgress[]; weightUnit: Enums<'weight_unit'> | null
  completedThrough?: number | null; onProgress?: (rung: number) => void
}) {
  const rungs = ladderRungs(exercises)
  return <div className="clr-ladder-prescription">
    <div className="clr-ladder-prescription__summary">
      {exercises.map(exercise => {
        const p = exercise.prescription
        const sequence = p.target_sequence
        const difference = sequence && sequence.length > 1 ? sequence[1] - sequence[0] : null
        const linear = sequence && difference !== null && sequence.every((n, i) => i === 0 || n - sequence[i - 1] === difference)
        const target = sequence
          ? linear ? `${sequence[0]} → ${sequence.at(-1)} ${modalityLabel(p).toLowerCase()} · ${difference! > 0 ? '+' : ''}${difference} per round` : `${sequence.join('–')} ${modalityLabel(p).toLowerCase()}`
          : `${p.target_value ?? '—'} ${modalityLabel(p).toLowerCase()}`
        const rawLoad = p.load_type === null ? null : loadText(p.load_type, p.load_value, weightUnit)
        const load = rawLoad?.toLowerCase() === equipmentName(p.equipment_used)?.toLowerCase() ? null : rawLoad
        return <p key={exercise.exerciseId}><strong>{exerciseName(p.exercise_id)}</strong> · {target}{load ? ` · ${load}` : ''}</p>
      })}
    </div>
    <ol className="clr-ladder-prescription__grid" aria-label="Prescribed ladder rounds">
      {rungs.map((rung, index) => {
        const content = <><span className="label">R{rung.number}</span>
          {exercises.map(exercise => {
            const p = exercise.prescription
            return <span key={exercise.exerciseId}>{p.target_sequence?.[index] ?? p.target_value ?? '—'}{p.modality === 'reps' ? ' ×' : ` ${modalityLabel(p).toLowerCase()}`} {exerciseName(p.exercise_id)}</span>
          })}</>
        return <li key={rung.number}>
          {onProgress ? <Chip selected={rung.number <= (completedThrough ?? 0)} className="clr-ladder-prescription__round"
            aria-label={`Complete round ${rung.number}`} onClick={() => onProgress(rung.number <= (completedThrough ?? 0) ? rung.number - 1 : rung.number)}>{content}</Chip>
            : <div className="clr-chamfer clr-chamfer--sm clr-chamfer--structure clr-ladder-prescription__round">{content}</div>}
        </li>
      })}
    </ol>
    {onProgress && <p className="clr-ladder-completion__status" role="status">{completedThrough ?? 0} of {rungs.length} rounds completed</p>}
  </div>
}
