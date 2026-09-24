/**
 * EXE-02 — one prescription, performed: what it asks for, what has been logged
 * against it, and the control that logs the next set.
 *
 * This is the IA's `ActiveExerciseCard` interior (IA.md §3), and it is its own
 * component rather than part of the standard renderer because every structure
 * that logs sets composes it — a superset's A1/A2, a circuit's numbered
 * movements. That also makes it the single place `logSet` is called from in the
 * presentation layer, which is the property `src/test/set-logging-ownership`
 * asserts: one writer, one row, written at log time.
 *
 * Everything it displays is read from the prescription's columns through
 * `prescription.ts` — the target kind decides whether the screen says `8`,
 * `8–10` or `15-12-9-6-3`, and the modality decides whether the field the user
 * fills in is reps, seconds or a distance in its own unit. No string is parsed
 * anywhere in this file, because there is no string to parse.
 *
 * Two smaller rules the spec is explicit about, both visible here:
 *   · rest is never rendered as `Rest: 0s` — no rest is no line
 *     (`superset-circuit-clarity.md` §8);
 *   · a warmup set carries the word "Warmup", not a tint: colour is never the
 *     only cue.
 */
import { useState } from 'react'

import { Button, Checkbox, Input } from '../design-system/index'
import {
  exerciseName,
  modalityLabel,
  type PrescribedModality,
  prescribedSetCount,
  prescriptionText,
  restText,
  targetForSet,
  targetText,
} from '../state/prescription'
import {
  prefillFrom,
  RPE_MAX,
  RPE_MIN,
  useSetLogging,
  type LoggedSet,
  type PerformedSet,
  type SetPrefill,
} from '../state/set-logging'
import type { ExerciseProgress } from '../state/workout-progress'
import { useInvalidFocus } from './formFocus'
import { Heading, HeadingSection } from './Heading'

export interface ExerciseSetLoggerProps {
  exercise: ExerciseProgress
  /**
   * The label that names this movement's place in its block — `A1` in a
   * superset, `1.` in a circuit. Omitted for a standard block, where the
   * movement has no partner to be distinguished from.
   */
  ordinal?: string
}

export function ExerciseSetLogger({ exercise, ordinal }: ExerciseSetLoggerProps) {
  const { logSet, loggedSets, isSaving, weightUnit } = useSetLogging()

  const prescription = exercise.prescription
  const logged = loggedSets(exercise.exerciseId)
  const prescribed = prescribedSetCount(prescription)
  const setNumber = nextSetNumber(logged)
  const target = targetForSet(prescription, setNumber)
  const rest = restText(prescription.rest_seconds)
  const name = exerciseName(prescription.exercise_id)

  return (
    <HeadingSection
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <Heading style={{ margin: 0, textTransform: 'uppercase' }}>
        {ordinal === undefined ? name : `${ordinal} ${name}`}
      </Heading>

      <p style={{ margin: 0, fontFamily: 'var(--font-data)', letterSpacing: 'var(--tracking-data)' }}>
        {prescriptionText(prescription)}
      </p>

      {prescription.tempo === null ? null : (
        <p style={{ margin: 0 }}>Tempo {prescription.tempo}</p>
      )}
      {rest === null ? null : <p style={{ margin: 0 }}>{rest}</p>}

      <LoggedSetList sets={logged} />

      <SetEntryForm
        key={setNumber}
        setNumber={setNumber}
        prescribed={prescribed}
        targetLabel={target === null ? null : targetText(prescription, target)}
        measureLabel={modalityLabel(prescription)}
        weightUnit={weightUnit}
        prefill={prefillFrom(logged)}
        modality={prescription.modality}
        exerciseName={name}
        saving={isSaving(exercise.exerciseId)}
        onLog={(performed) => logSet(exercise.exerciseId, performed)}
      />
    </HeadingSection>
  )
}

/** The lowest set number not yet recorded — set 1 for an untouched movement. */
function nextSetNumber(logged: readonly LoggedSet[]): number {
  let candidate = 1
  const taken = new Set(logged.map((set) => set.setNumber))
  while (taken.has(candidate)) candidate += 1
  return candidate
}

// ─────────────────────────────────────────────────────────────────────────────
// What is already recorded
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The sets behind the user. The empty case says so rather than rendering
 * nothing: "no sets logged" and "this movement has no set list" look identical
 * on a blank card, and only one of them is true.
 */
function LoggedSetList({ sets }: { sets: readonly LoggedSet[] }) {
  if (sets.length === 0) {
    return <p style={{ margin: 0 }}>No sets logged yet.</p>
  }

  return (
    <ol
      aria-label="Logged sets"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-100)' }}
    >
      {[...sets]
        .sort((left, right) => left.setNumber - right.setNumber)
        .map((set) => (
          <li key={set.setNumber} style={{ fontFamily: 'var(--font-data)' }}>
            {loggedSetText(set)}
          </li>
        ))}
    </ol>
  )
}

/**
 * One recorded set, in the units it was recorded in. A null field says
 * nothing — it was not recorded, which is not the same as zero — and zero is
 * printed, because a failed attempt is a result (DATA_MODEL §8).
 */
export function loggedSetText(set: LoggedSet): string {
  const parts: string[] = [`Set ${set.setNumber}`]

  if (set.reps !== null) parts.push(`${set.reps} reps`)
  if (set.durationSeconds !== null) parts.push(`${set.durationSeconds} sec`)
  if (set.distance !== null) {
    parts.push(`${set.distance} ${set.distanceUnit ?? ''}`.trim())
  }
  if (set.weight !== null) parts.push(`${set.weight} ${set.weightUnit}`)
  if (set.rpe !== null) parts.push(`RPE ${set.rpe}`)
  if (set.isWarmup) parts.push('Warmup')

  return parts.join(' · ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging the next set
// ─────────────────────────────────────────────────────────────────────────────

interface SetEntryFormProps {
  setNumber: number
  prescribed: number
  /** `8 reps`, `8–10 reps`, `400 m` — null when the row carries no target. */
  targetLabel: string | null
  measureLabel: string
  weightUnit: string | null
  prefill: SetPrefill | null
  modality: PrescribedModality
  exerciseName: string
  saving: boolean
  onLog: (performed: PerformedSet) => void
}

/**
 * The set the user is in, and the four things they can say about it.
 *
 * Prefilled from the last set actually performed, which is the requirement's
 * "previous weight/reps when history exists": on a resumed session that is the
 * set before this one, and within a session it is the set they just did. The
 * fields stay filled afterwards, because the next set is usually the same
 * weight and retyping it is the friction this screen exists to remove.
 */
function SetEntryForm({
  setNumber,
  prescribed,
  targetLabel,
  measureLabel,
  weightUnit,
  prefill,
  modality,
  exerciseName: name,
  saving,
  onLog,
}: SetEntryFormProps) {
  const [weight, setWeight] = useState(() => numberField(prefill?.weight))
  const [measure, setMeasure] = useState(() => numberField(measurePrefill(prefill, modality)))
  const [rpe, setRpe] = useState('')
  const [warmup, setWarmup] = useState(false)

  const weightValue = parsed(weight)
  const measureValue = parsed(measure)
  const rpeValue = parsed(rpe)

  const weightInvalid = weightValue === 'invalid' || isNegative(weightValue)
  const measureInvalid = measureValue === 'invalid' || isNegative(measureValue)
  const rpeInvalid =
    rpeValue === 'invalid' ||
    (typeof rpeValue === 'number' && (rpeValue < RPE_MIN || rpeValue > RPE_MAX))
  const blocked = weightInvalid || measureInvalid || rpeInvalid

  // The shared submit helper (CORE-05): this form says only whether the set
  // was accepted, and where the caret goes on a refusal is its decision.
  const onSubmit = useInvalidFocus()

  const submit = (): boolean => {
    if (blocked || saving) return false

    onLog({
      setNumber,
      ...(typeof measureValue === 'number' ? measureField(measureValue, modality) : {}),
      ...(typeof weightValue === 'number' ? { weight: weightValue } : {}),
      ...(typeof rpeValue === 'number' ? { rpe: rpeValue } : {}),
      ...(warmup ? { isWarmup: true } : {}),
    })

    // Nothing is cleared here: once the row comes back the form remounts on
    // the new set number, prefilled from the set just logged. A write that
    // failed leaves every field exactly as the user typed it.
    return true
  }

  return (
    <form
      onSubmit={onSubmit(submit)}
      aria-label={`Log set ${setNumber} of ${name}`}
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <p style={{ margin: 0 }}>
        {setNumber > prescribed
          ? `Extra set ${setNumber}`
          : `Set ${setNumber} of ${prescribed}`}
        {targetLabel === null ? '' : ` · Target ${targetLabel}`}
      </p>

      <div
        className="clr-row"
        style={{ flexWrap: 'wrap', gap: 'var(--spacing-200)', alignItems: 'flex-start' }}
      >
        <Input
          label={weightUnit === null ? 'Weight' : `Weight (${weightUnit})`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={weight}
          onChange={setWeight}
          invalid={weightInvalid}
          errorText={weightInvalid ? 'Enter a weight of zero or more' : undefined}
        />
        <Input
          label={measureLabel}
          type="number"
          inputMode="numeric"
          min={0}
          step="any"
          value={measure}
          onChange={setMeasure}
          invalid={measureInvalid}
          errorText={measureInvalid ? 'Enter zero or more' : undefined}
        />
        <Input
          label="RPE"
          type="number"
          inputMode="decimal"
          min={RPE_MIN}
          max={RPE_MAX}
          step="any"
          value={rpe}
          onChange={setRpe}
          invalid={rpeInvalid}
          errorText={rpeInvalid ? `RPE runs ${RPE_MIN} to ${RPE_MAX}` : undefined}
        />
      </div>

      <Checkbox label="Warmup set" checked={warmup} onChange={setWarmup} />

      <Button type="submit" variant="primary" size="lg" loading={saving} disabled={blocked}>
        Log set {setNumber}
      </Button>
    </form>
  )
}

/** A number the user has not typed is an empty field, never a zero. */
function numberField(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

/**
 * What the field holds: a number, nothing, or something that is not a number.
 * The third is its own answer because an unreadable field must refuse the set
 * rather than log it as not recorded.
 */
function parsed(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : 'invalid'
}

function isNegative(value: number | null | 'invalid'): boolean {
  return typeof value === 'number' && value < 0
}

/** The prefill for whichever measurement this prescription actually asks for. */
function measurePrefill(
  prefill: SetPrefill | null,
  modality: PrescribedModality,
): number | null {
  if (prefill === null) return null

  switch (modality) {
    case 'reps':
      return prefill.reps
    case 'time':
      return prefill.durationSeconds
    case 'distance':
      return prefill.distance
  }
}

/** The measurement lands in the column its modality names, and no other. */
function measureField(
  value: number,
  modality: PrescribedModality,
): Partial<PerformedSet> {
  switch (modality) {
    case 'reps':
      return { reps: value }
    case 'time':
      return { durationSeconds: value }
    case 'distance':
      return { distance: value }
  }
}
