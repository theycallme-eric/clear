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
 * It is drawn with the shared block frame's parts (`block-renderers-frame.tsx`)
 * — a movement, its notes and a field row — and with no frame of its own: the
 * block it sits in is the card, so composing it can never nest one.
 *
 * Two smaller rules the spec is explicit about, both visible here:
 *   · rest is never rendered as `Rest: 0s` — no rest is no line
 *     (`superset-circuit-clarity.md` §8);
 *   · a warmup set carries the word "Warmup", not a tint: colour is never the
 *     only cue.
 *
 * The set list also says where each set has *got to* (EXE-07). A set held by
 * the durable queue is drawn — the user performed it — but never as though the
 * database had it, and the difference is a word and a glyph before it is a hue.
 */
import { useState, type ReactNode } from 'react'

import type { Enums } from '../data/database.types'

import {
  AlertTriangle,
  Button,
  CircleCheck,
  Input,
  RefreshCw,
} from '../design-system/index'
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
import { prescribedRestSeconds, useRestTimer } from '../state/rest'
import {
  prefillFrom,
  useSetLogging,
  type LoggedSet,
  type PerformedSet,
  type SetPrefill,
  type SetSyncStatus,
} from '../state/set-logging'
import type { ExerciseProgress } from '../state/workout-progress'
import { BlockPanel } from './block-renderers-frame'
import { ExerciseCoaching } from './exercise-coaching'
import { useInvalidFocus } from './formFocus'
import { Select } from './select'

export interface ExerciseSetLoggerProps {
  exercise: ExerciseProgress
  /**
   * The label that names this movement's place in its block — `A1` in a
   * superset, `1.` in a circuit. Omitted for a standard block, where the
   * movement has no partner to be distinguished from.
   */
  ordinal?: string
  /**
   * Whether this movement states its own rest. False where rest belongs to the
   * block instead — a superset rests once after both movements, so a per-
   * movement line would state a rest the user is not meant to take
   * (`superset-circuit-clarity.md` §2). The prescription's `rest_seconds` is
   * untouched either way; this decides only who says it.
   */
  statesRest?: boolean
  /**
   * The rest a logged set of this movement is followed by (EXE-05), in
   * seconds. Omitted, it is the rest the movement states — its own
   * `rest_seconds` when `statesRest`, none otherwise — so the rest the card
   * says and the rest the bar starts cannot disagree. A superset passes the
   * block's `round_rest_seconds` to the movement that closes the pair and
   * nothing to the one before it.
   */
  restSeconds?: number | null
}

export function ExerciseSetLogger({
  exercise,
  ordinal,
  statesRest = true,
  restSeconds,
}: ExerciseSetLoggerProps) {
  const { logSet, loggedSets, isSaving, weightUnit } = useSetLogging()
  const restTimer = useRestTimer()

  const prescription = exercise.prescription
  const logged = loggedSets(exercise.exerciseId)
  const prescribed = prescribedSetCount(prescription)
  const setNumber = nextSetNumber(logged)
  const target = targetForSet(prescription, setNumber)
  const rest = statesRest ? restText(prescription.rest_seconds) : null
  const name = exerciseName(prescription.exercise_id)
  const restAfterSet = prescribedRestSeconds(
    restSeconds !== undefined ? restSeconds : statesRest ? prescription.rest_seconds : null,
  )

  /**
   * The set, then the rest it earns. The rest starts only for a set the shell
   * can accept — with no unit to stamp the set is refused, and a rest after a
   * set that was not recorded would be the app agreeing with itself about
   * nothing. A set logged while a rest runs replaces it: the provider holds one.
   */
  const log = (performed: PerformedSet) => {
    logSet(exercise.exerciseId, performed)
    if (restAfterSet === null || weightUnit === null) return
    restTimer.start({ exerciseId: exercise.exerciseId, label: name, seconds: restAfterSet })
  }

  return (
    <BlockPanel.Movement
      title={ordinal === undefined ? name : `${ordinal} ${name}`}
      detail={prescriptionText(prescription)}
    >
      {prescription.tempo === null ? null : (
        <BlockPanel.Note>Tempo {prescription.tempo}</BlockPanel.Note>
      )}
      {rest === null ? null : <BlockPanel.Note>{rest}</BlockPanel.Note>}

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
        onLog={log}
      />

      {/*
        No swap control here (U37): a movement is swapped in Review, before the
        session exists, and never from the card of a workout in progress.
      */}

      {/*
        EXE-05. Its own component with its own reads and write, so a panel
        whose library read failed leaves the set form above it untouched.
      */}
      <ExerciseCoaching exercise={exercise} />
    </BlockPanel.Movement>
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
    return <BlockPanel.Note>No sets logged yet.</BlockPanel.Note>
  }

  return (
    <ol
      aria-label="Logged sets"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-100)' }}
    >
      {[...sets]
        .sort((left, right) => left.setNumber - right.setNumber)
        .map((set) => (
          <li
            key={set.setNumber}
            style={{
              fontFamily: 'var(--font-data)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-100)',
            }}
          >
            <span>{loggedSetText(set)}</span>
            <SyncBadge status={set.status} />
          </li>
        ))}
    </ol>
  )
}

/** What each status says and which glyph carries it. */
const SYNC_BADGE: Record<SetSyncStatus, { label: string; icon: ReactNode; color: string }> = {
  logged: { label: 'Saved', icon: <CircleCheck />, color: 'var(--icon-toast-positive)' },
  syncing: { label: 'Saving', icon: <RefreshCw />, color: 'var(--icon-toast-info)' },
  failed: { label: 'On this device only', icon: <AlertTriangle />, color: 'var(--icon-toast-negative)' },
}

/**
 * Where one set has got to (EXE-07). A set the database has not confirmed is
 * never drawn as though it had, and the difference is carried by a word and a
 * glyph before it is carried by a hue — colour is never the only cue.
 */
function SyncBadge({ status }: { status: SetSyncStatus }) {
  const badge = SYNC_BADGE[status]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacing-100)',
        color: badge.color,
        fontSize: 'var(--label-xs-size)',
        letterSpacing: 'var(--tracking-data)',
      }}
    >
      <span aria-hidden="true" style={{ display: 'flex' }}>
        {badge.icon}
      </span>
      {badge.label}
    </span>
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
  weightUnit: Enums<'weight_unit'> | null
  prefill: SetPrefill | null
  modality: PrescribedModality
  exerciseName: string
  saving: boolean
  onLog: (performed: PerformedSet) => void
}

/**
 * The set the user is in, and the two things they can say about it — the
 * weight and the measure. Both are optional: a set logged with neither is a
 * set performed and not measured, and nothing here blocks the workout on it.
 * There is no effort field and no warmup checkbox (REQ-015, U36); restoring
 * either is described in `docs/specs/generation/OPTIONAL_FEEDBACK_RESTORATION.md`.
 *
 * Prefilled from the last set actually performed, which is the requirement's
 * "previous weight/reps when history exists": on a resumed session that is the
 * set before this one, and within a session it is the set they just did. The
 * fields stay filled afterwards, because the next set is usually the same
 * weight and retyping it is the friction this screen exists to remove. The
 * prescription's target is never a prefill — it is printed as the target, and
 * an observed rep count is only ever one the user typed.
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
  const [chosenUnit, setChosenUnit] = useState<Enums<'weight_unit'> | undefined>()
  // Zero is an observation too. A row with no observed weight supplies no
  // reference unit; an untouched empty form can follow the profile as it loads.
  const referenceUnit = prefill !== null && prefill.weight !== null
    ? prefill.weightUnit
    : undefined
  const selectedUnit = chosenUnit ?? referenceUnit ?? weightUnit
  const weightValue = parsed(weight)
  const measureValue = parsed(measure)

  const weightInvalid = weightValue === 'invalid' || isNegative(weightValue)
  const measureInvalid = measureValue === 'invalid' || isNegative(measureValue)
  const blocked = weightInvalid || measureInvalid

  // The shared submit helper (CORE-05): this form says only whether the set
  // was accepted, and where the caret goes on a refusal is its decision.
  const onSubmit = useInvalidFocus()

  const submit = (): boolean => {
    if (blocked || saving) return false

    onLog({
      setNumber,
      ...(selectedUnit !== null && selectedUnit !== weightUnit
        ? { weightUnit: selectedUnit } : {}),
      ...(typeof measureValue === 'number' ? measureField(measureValue, modality) : {}),
      ...(typeof weightValue === 'number' ? { weight: weightValue } : {}),
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
      <BlockPanel.Note>
        {setNumber > prescribed
          ? `Extra set ${setNumber}`
          : `Set ${setNumber} of ${prescribed}`}
        {targetLabel === null ? '' : ` · Target ${targetLabel}`}
      </BlockPanel.Note>

      <BlockPanel.FieldRow>
        <Input
          label={selectedUnit === null ? 'Weight' : `Weight (${selectedUnit})`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={weight}
          onChange={(value) => {
            // Once the athlete types, a later profile refresh must not relabel
            // their number. Explicit Unit changes below never convert the text.
            if (selectedUnit !== null) setChosenUnit(selectedUnit)
            setWeight(value)
          }}
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
        <Select
          label="Unit"
          value={selectedUnit ?? ''}
          onChange={(value) => {
            if (value === 'kg' || value === 'lb') setChosenUnit(value)
          }}
          helperText="Changing units keeps the number. Enter the weight in the selected unit."
        >
          {selectedUnit === null ? <option value="" disabled>Choose unit</option> : null}
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </Select>
      </BlockPanel.FieldRow>

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
