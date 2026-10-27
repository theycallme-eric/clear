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
 * The card's hierarchy is fixed (REQ-008): the movement heading with its
 * subordinate `Set X/Y` counter, the prescription and equipment, the compact
 * saved results with their Edit controls, the explicit Log set action, then the
 * coaching disclosure. The fields are not on the card at all: Log set opens
 * the shared half-sheet (`set-logging-sheet.tsx`, REQ-009), and the draft it
 * edits lives here, so collapsing the sheet loses nothing. The draft includes
 * the set's optional effort (`set-effort.tsx`, REQ-011), which starts every
 * new set unanswered and is recorded only by Log set.
 *
 * It is drawn with the shared block frame's parts (`block-renderers-frame.tsx`)
 * and with no frame of its own: the block it sits in is the card, so composing
 * it can never nest one.
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
import { useRef, useState, type ReactNode } from 'react'

import type { Enums } from '../data/database.types'

import {
  AlertTriangle,
  Button,
  CircleCheck,
  Input,
  Pencil,
  RefreshCw,
} from '../design-system/index'
import {
  exerciseName,
  modalityLabel,
  type PrescribedColumns,
  type PrescribedModality,
  prescribedSetCount,
  prescriptionText,
  restText,
  targetForSet,
} from '../state/prescription'
import { incrementFor } from '../state/progression'
import { prescribedRestSeconds, useRestTimer } from '../state/rest'
import { equipmentName } from '../state/review'
import {
  prefillFrom,
  useSetLogging,
  type LoggedSet,
  type PerformedSet,
  type SetPrefill,
  type SetSyncStatus,
} from '../state/set-logging'
import type { ExerciseProgress } from '../state/workout-progress'
import { AppDialog } from './app-dialog'
import { BlockPanel } from './block-renderers-frame'
import { ActionGroup } from './composition'
import { ExerciseCoaching } from './exercise-coaching'
import { Select } from './select'
import { SetEffortChoice, SetEffortReading, type SetEffort } from './set-effort'
import { SetLoggingSheet, SetMeasurementRow } from './set-logging-sheet'
import { useSetLoggingSheetPlacement } from './set-logging-sheet-context'

type WeightUnit = Enums<'weight_unit'>

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
  /**
   * Insertion interface for correcting a saved set (TASK-011 supplies it).
   * Given, each saved row carries an Edit control that opens the same sheet in
   * edit mode, and Save correction hands the corrected set here. Omitted, no
   * Edit control is drawn: a control that saved nothing would be a lie.
   */
  onCorrectSet?: (exerciseId: string, corrected: PerformedSet) => void
}

export function ExerciseSetLogger({
  exercise,
  ordinal,
  statesRest = true,
  restSeconds,
  onCorrectSet,
}: ExerciseSetLoggerProps) {
  const { logSet, loggedSets, isSaving, weightUnit, correctSet, clearSet } = useSetLogging()
  const correctable = onCorrectSet !== undefined || correctSet !== undefined
  const restTimer = useRestTimer()
  const sheet = useSetLoggingSheetPlacement(exercise.exerciseId)
  const logButton = useRef<HTMLButtonElement>(null)

  const prescription = exercise.prescription
  const logged = loggedSets(exercise.exerciseId)
  const prescribed = prescribedSetCount(prescription)
  const setNumber = nextSetNumber(logged)
  const rest = statesRest ? restText(prescription.rest_seconds) : null
  const name = exerciseName(prescription.exercise_id)
  const title = ordinal === undefined ? name : `${ordinal} ${name}`
  const equipment = equipmentName(prescription.equipment_used)
  const unloaded = incrementFor(prescription.equipment_used, 'kg') === null
  const restAfterSet = prescribedRestSeconds(
    restSeconds !== undefined ? restSeconds : statesRest ? prescription.rest_seconds : null,
  )

  // The entry being made. It outlives the sheet, so a collapse and a reopen
  // hand back exactly what was typed; it starts over only when the shell's set
  // list moves the set number on.
  const prefill = prefillFrom(logged)
  const fresh = newDraft(setNumber, prefill, prescription)
  const [draft, setDraft] = useState<SetDraft>(fresh)
  const entry = draft.key === fresh.key ? draft : fresh

  // A correction in progress, when the caller can save one. It names the row
  // it was opened on by id, so it can only ever save over that observation.
  const [correction, setCorrection] = useState<SetDraft | null>(null)
  const correctedSet =
    correction === null || !correctable
      ? undefined
      : logged.find((set) => editKey(set) === correction.key)
  // The wrong-movement recovery, armed: the set a confirmed clear removes.
  const [clearing, setClearing] = useState<LoggedSet | null>(null)
  const edit =
    correction === null || correctedSet === undefined
      ? null
      : { set: correctedSet, draft: correction }
  const mode = edit === null ? 'new' : 'edit'
  const sheetSetNumber = edit === null ? setNumber : edit.set.setNumber
  const sheetModality = edit === null ? prescription.modality : edit.draft.modality

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

  const openNew = () => {
    setCorrection(null)
    sheet.setOpen(true)
  }

  const collapse = () => {
    sheet.setOpen(false)
    logButton.current?.focus()
  }

  return (
    <BlockPanel.Movement
      title={title}
      counter={setNumber > prescribed ? `Extra set ${setNumber}` : `Set ${setNumber}/${prescribed}`}
      detail={prescriptionText(prescription)}
      context={`Equipment · ${equipment}`}
    >
      {/*
        Tempo stays in the prescription's structured columns; it is not
        printed here (REQ-009). No rest is no line.
      */}
      {rest === null ? null : <BlockPanel.Note>{rest}</BlockPanel.Note>}

      <LoggedSetList
        sets={logged}
        onEdit={
          !correctable
            ? undefined
            : (set) => {
              setCorrection(editDraft(set, prescription.modality))
              sheet.setOpen(true)
            }
        }
      />

      <ActionGroup>
        <Button
          buttonRef={logButton}
          variant="secondary"
          aria-expanded={sheet.open}
          onClick={openNew}
        >
          Log set
        </Button>
      </ActionGroup>

      {sheet.place(
        <SetSheetForm
          key={mode}
          mode={mode}
          setNumber={sheetSetNumber}
          exerciseName={name}
          context={[title, prescriptionText(prescription), equipment].join(' · ')}
          draft={edit === null ? entry : edit.draft}
          onDraft={edit === null ? setDraft : setCorrection}
          referenceUnit={
            edit !== null
              ? edit.set.weightUnit
              : prefill !== null && prefill.weight !== null ? prefill.weightUnit : undefined
          }
          weightUnit={weightUnit}
          measureLabel={modalityLabel(edit === null ? prescription : {
            ...prescription,
            modality: sheetModality,
            distance_unit: edit.set.distanceUnit,
          })}
          modality={sheetModality}
          showLoad={
            !unloaded || (edit === null ? (prefill?.weight ?? null) : edit.set.weight) !== null
          }
          saving={edit === null && isSaving(exercise.exerciseId)}
          onSubmit={(performed) => {
            if (edit !== null) {
              const corrected = { ...unshownMeasurements(edit.set, sheetModality), ...performed }
              if (onCorrectSet !== undefined) onCorrectSet(exercise.exerciseId, corrected)
              else correctSet?.(exercise.exerciseId, edit.set.id, corrected)
              setCorrection(null)
              return
            }
            log(performed)
          }}
          onCancel={() => setCorrection(null)}
          onClear={edit === null || clearSet === undefined ? undefined : () => setClearing(edit.set)}
          onCollapse={collapse}
        />,
      )}

      {/*
        REQ-013: a set logged against the wrong movement is cleared here, after
        confirmation, and logged again on the right one with its own Log set.
        Nothing is moved: the result is removed, and only this one.
      */}
      <AppDialog
        open={clearing !== null}
        critical
        title={clearing === null ? undefined : `Clear set ${clearing.setNumber} of ${name}?`}
        onClose={() => setClearing(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setClearing(null)}>
              Keep set
            </Button>
            <Button
              variant="critical"
              onClick={() => {
                if (clearing !== null) clearSet?.(exercise.exerciseId, clearing.id)
                setClearing(null)
                setCorrection(null)
                collapse()
              }}
            >
              Clear set
            </Button>
          </>
        }
      >
        {clearing === null ? null : <p style={{ margin: 0, fontFamily: 'var(--font-data)' }}>{loggedSetText(clearing)}</p>}
      </AppDialog>

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
 * The sets behind the user, compact, each with its Edit control where a
 * correction can be saved. An untouched movement draws no list and no
 * placeholder sentence: its counter already says `Set 1/3`.
 */
function LoggedSetList({
  sets,
  onEdit,
}: {
  sets: readonly LoggedSet[]
  onEdit?: (set: LoggedSet) => void
}) {
  if (sets.length === 0) return null

  return (
    <ol
      aria-label="Logged sets"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-100)' }}
    >
      {[...sets]
        .sort((left, right) => left.setNumber - right.setNumber)
        .map((set) => (
          <li
            key={set.id}
            style={{
              fontFamily: 'var(--font-data)',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 'var(--spacing-100)',
            }}
          >
            <span>{loggedSetText(set)}</span>
            <SetEffortReading value={set.effort} />
            <SyncBadge status={set.status} />
            {onEdit === undefined ? null : (
              <Button
                variant="quiet"
                size="sm"
                icon={<Pencil size={16} />}
                aria-label={`Edit set ${set.setNumber}`}
                onClick={() => onEdit(set)}
                style={{ marginInlineStart: 'auto' }}
              >
                Edit
              </Button>
            )}
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
// The entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the fields hold, as typed. `key` names the set the entry is for —
 * `new:2` or `edit:1` — so an entry for a set already logged is never reused.
 */
interface SetDraft {
  readonly key: string
  /** Edit retains the measurement being changed even if its prescription differs. */
  readonly modality: PrescribedModality
  readonly weight: string
  readonly measure: string
  /** A unit the athlete chose or committed to by typing; never converted. */
  readonly chosenUnit?: WeightUnit
  /** This set's own effort answer; `null` is unanswered, never a middle choice. */
  readonly effort: SetEffort | null
}

/**
 * The next set's starting entry. The weight is the last set actually
 * performed — the next set is usually the same weight, and retyping it is the
 * friction this screen exists to remove. The measure is the prescription's
 * reps or seconds for this set, as an editable suggestion; with no prescribed
 * number it is the last set performed. Neither is an observation until the
 * athlete presses Log set.
 */
function newDraft(
  setNumber: number,
  prefill: SetPrefill | null,
  prescription: PrescribedColumns,
): SetDraft {
  return {
    key: `new:${setNumber}`,
    modality: prescription.modality,
    weight: numberField(prefill?.weight),
    measure: numberField(
      suggestedMeasure(prescription, setNumber) ?? measurePrefill(prefill, prescription.modality),
    ),
    // Each set is asked afresh: the last set's answer is not this one's.
    effort: null,
  }
}

/** A correction's key: the row it was opened on, never just its set number. */
function editKey(set: LoggedSet): string {
  return `edit:${set.id}`
}

/** A saved set, back in the fields, in the unit and values it was saved with. */
function editDraft(set: LoggedSet, prescribedModality: PrescribedModality): SetDraft {
  const modality = observedModality(set, prescribedModality)
  return {
    key: editKey(set),
    modality,
    weight: numberField(set.weight),
    measure: numberField(measurePrefill(set, modality)),
    chosenUnit: set.weightUnit,
    effort: set.effort,
  }
}

/** A correction opens an actual measurement, never an unrelated prescribed value. */
function observedModality(set: LoggedSet, prescribed: PrescribedModality): PrescribedModality {
  if (measurePrefill(set, prescribed) !== null) return prescribed
  if (set.reps !== null) return 'reps'
  if (set.durationSeconds !== null) return 'time'
  if (set.distance !== null) return 'distance'
  return prescribed
}

/** The compact field changes one measurement; other recorded values stay intact. */
function unshownMeasurements(set: LoggedSet, shown: PrescribedModality): Partial<PerformedSet> {
  return {
    ...(shown !== 'reps' && set.reps !== null ? { reps: set.reps } : {}),
    ...(shown !== 'time' && set.durationSeconds !== null ? { durationSeconds: set.durationSeconds } : {}),
    ...(shown !== 'distance' && set.distance !== null ? { distance: set.distance } : {}),
  }
}

/**
 * The prescribed number for this set, where the prescription states reps or
 * seconds: a fixed target or this set's ladder rung, and the bottom of a range
 * — the least the prescription asks for, never more than it asked.
 */
function suggestedMeasure(prescription: PrescribedColumns, setNumber: number): number | null {
  if (prescription.modality === 'distance') return null
  const target = targetForSet(prescription, setNumber)
  if (target === null) return null

  switch (target.kind) {
    case 'fixed':
      return target.value
    case 'range':
      return target.min
    case 'sequence':
      return null
  }
}

interface SetSheetFormProps {
  mode: 'new' | 'edit'
  setNumber: number
  exerciseName: string
  context: string
  draft: SetDraft
  onDraft: (draft: SetDraft) => void
  /** The observed number's own unit, where the entry started from one. */
  referenceUnit: WeightUnit | undefined
  weightUnit: WeightUnit | null
  measureLabel: string
  modality: PrescribedModality
  /** False for an unloaded movement with no load to carry forward. */
  showLoad: boolean
  saving: boolean
  onSubmit: (performed: PerformedSet) => void
  onCancel: () => void
  /** Edit mode, where the shell can clear a saved set: arms the confirmation. */
  onClear?: () => void
  onCollapse: () => void
}

/**
 * The set the user is in, and the two things they can say about it — the
 * weight and the measure. Both are optional: a set logged with neither is a
 * set performed and not measured, and nothing here blocks the workout on it.
 *
 * Weight, Unit and the measure sit on one row. Changing the unit relabels the
 * number and never converts it; an unloaded movement omits both load fields.
 * A write that the shell refuses leaves every field exactly as typed, because
 * the entry is only replaced once the shell's list moves the set number on.
 */
function SetSheetForm({
  mode,
  setNumber,
  exerciseName: name,
  context,
  draft,
  onDraft,
  referenceUnit,
  weightUnit,
  measureLabel,
  modality,
  showLoad,
  saving,
  onSubmit,
  onCancel,
  onClear,
  onCollapse,
}: SetSheetFormProps) {
  // Zero is an observation too. A row with no observed weight supplies no
  // reference unit; an untouched empty form can follow the profile as it loads.
  const selectedUnit = draft.chosenUnit ?? referenceUnit ?? weightUnit
  const weightValue = showLoad ? parsed(draft.weight) : null
  const measureValue = parsed(draft.measure)

  const weightInvalid = weightValue === 'invalid' || isNegative(weightValue)
  const measureInvalid = measureValue === 'invalid' || isNegative(measureValue)
  const blocked = weightInvalid || measureInvalid

  // The sheet submits through the shared helper (CORE-05): this says only
  // whether the set was accepted, and the caret follows a refusal.
  const submit = (): boolean => {
    if (blocked || saving) return false

    onSubmit({
      setNumber,
      ...(showLoad && selectedUnit !== null && (mode === 'edit' || selectedUnit !== weightUnit)
        ? { weightUnit: selectedUnit } : {}),
      ...(typeof measureValue === 'number' ? measureField(measureValue, modality) : {}),
      ...(typeof weightValue === 'number' ? { weight: weightValue } : {}),
      // A new set states an effort only when one was chosen. A correction
      // states it either way, so a cleared answer is handed over as null.
      ...(mode === 'edit' || draft.effort !== null ? { effort: draft.effort } : {}),
    })
    return true
  }

  const measures = (
    <SetMeasurementRow>
      {showLoad ? (
        <Input
          label="Weight"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={draft.weight}
          onChange={(value) => {
            // Once the athlete types, a later profile refresh must not relabel
            // their number. Explicit Unit changes below never convert the text.
            onDraft({
              ...draft,
              weight: value,
              ...(selectedUnit !== null ? { chosenUnit: selectedUnit } : {}),
            })
          }}
          invalid={weightInvalid}
          errorText={weightInvalid ? 'Enter a weight of zero or more' : undefined}
        />
      ) : null}
      {showLoad ? (
        <Select
          label="Unit"
          value={selectedUnit ?? ''}
          onChange={(value) => {
            if (value === 'kg' || value === 'lb') onDraft({ ...draft, chosenUnit: value })
          }}
        >
          {selectedUnit === null ? <option value="" disabled>Choose</option> : null}
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </Select>
      ) : null}
      <Input
        label={measureLabel}
        type="number"
        inputMode={modality === 'distance' ? 'decimal' : 'numeric'}
        min={0}
        step="any"
        value={draft.measure}
        onChange={(value) => onDraft({ ...draft, measure: value })}
        invalid={measureInvalid}
        errorText={measureInvalid ? 'Enter zero or more' : undefined}
      />
    </SetMeasurementRow>
  )

  return (
    <SetLoggingSheet
      mode={mode}
      setNumber={setNumber}
      formLabel={`${mode === 'edit' ? 'Edit' : 'Log'} set ${setNumber} of ${name}`}
      context={context}
      measures={measures}
      effort={
        <SetEffortChoice
          setNumber={setNumber}
          value={draft.effort}
          onChange={(effort) => onDraft({ ...draft, effort })}
        />
      }
      saving={saving}
      blocked={blocked}
      onSubmit={submit}
      onCancel={onCancel}
      onClear={onClear}
      onCollapse={onCollapse}
    />
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
  prefill: Pick<SetPrefill, 'reps' | 'durationSeconds' | 'distance'> | null,
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
