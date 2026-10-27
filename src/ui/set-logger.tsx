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
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'

import type { Enums } from '../data/database.types'

import {
  AlertTriangle,
  Button,
  Checkbox,
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
import { movementCountdownSeconds } from '../state/movement-countdown'
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
import { MovementCountdown } from './movement-countdown'
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
  /** False when the containing movement already owns a stable countdown. */
  showCountdown?: boolean
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
   * Who logs this movement's next set. `'self'` is its own Log set; `'round'`
   * is a superset's one Log round (REQ-016), which then also names the set
   * number the round is entering, so the card's `Set X/Y` and the round agree.
   * Saved rows keep their own Edit either way.
   */
  logging?: 'self' | { readonly round: number }
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
  showCountdown = true,
  restSeconds,
  logging = 'self',
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
  const logsSelf = logging === 'self'
  const setNumber = logging === 'self' ? nextSetNumber(logged) : logging.round
  const rest = statesRest ? restText(prescription.rest_seconds) : null
  const name = exerciseName(prescription.exercise_id)
  const title = ordinal === undefined ? name : `${ordinal} ${name}`
  const equipment = equipmentName(prescription.equipment_used)
  const unloaded = incrementFor(prescription.equipment_used, 'kg') === null
  const restAfterSet = prescribedRestSeconds(
    restSeconds !== undefined ? restSeconds : statesRest ? prescription.rest_seconds : null,
  )
  const countdownSeconds = showCountdown ? movementCountdownSeconds(prescription, setNumber) : null

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

      {/*
        REQ-014: a timed set counts down here, on the movement, whatever the
        sheet is doing. Keyed to the set it times, so the next set starts from
        its own prescribed seconds; running out records nothing.
      */}
      {countdownSeconds === null ? null : (
        <MovementCountdown
          key={`${setNumber}:${countdownSeconds}`}
          seconds={countdownSeconds}
          movement={name}
        />
      )}

      <LoggedSetList
        sets={logged}
        onEdit={
          !correctable
            ? undefined
            : (set) => {
              // Reopening the row a minimised correction was opened on hands
              // that correction back; any other row starts from its result.
              setCorrection((current) =>
                current !== null && current.key === editKey(set)
                  ? current
                  : editDraft(set, prescription.modality),
              )
              sheet.setOpen(true)
            }
        }
      />

      {/* A superset's movements are entered together, by the block's Log round. */}
      {logsSelf ? (
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
      ) : null}

      {(logsSelf || edit !== null) && sheet.place(
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
              if (!logsSelf) collapse()
              return
            }
            log(performed)
          }}
          onCancel={() => {
            setCorrection(null)
            // With no new-set entry of its own, a finished correction closes.
            if (!logsSelf) collapse()
          }}
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
  const entry = readEntry({ mode, setNumber, draft, referenceUnit, weightUnit, modality, showLoad })

  // The sheet submits through the shared helper (CORE-05): this says only
  // whether the set was accepted, and the caret follows a refusal.
  const submit = (): boolean => {
    if (entry.performed === null || saving) return false
    onSubmit(entry.performed)
    return true
  }

  return (
    <SetLoggingSheet
      mode={mode}
      setNumber={setNumber}
      formLabel={`${mode === 'edit' ? 'Edit' : 'Log'} set ${setNumber} of ${name}`}
      context={context}
      measures={
        <SetMeasureFields
          entry={entry}
          draft={draft}
          onDraft={onDraft}
          measureLabel={measureLabel}
          modality={modality}
          showLoad={showLoad}
        />
      }
      effort={
        <SetEffortChoice
          setNumber={setNumber}
          value={draft.effort}
          onChange={(effort) => onDraft({ ...draft, effort })}
        />
      }
      saving={saving}
      blocked={entry.performed === null}
      onSubmit={submit}
      onCancel={onCancel}
      onClear={onClear}
      onCollapse={onCollapse}
    />
  )
}

/** What a draft says once read: the unit it is in, what is wrong, the set. */
interface SetEntryReading {
  readonly selectedUnit: WeightUnit | null
  readonly weightInvalid: boolean
  readonly measureInvalid: boolean
  /** The set the fields describe, or `null` while a field must refuse it. */
  readonly performed: PerformedSet | null
}

/**
 * The fields, as a set. Both measurements are optional — an empty field is
 * `null`, never zero — and an unreadable or negative one refuses the set
 * rather than logging it as not recorded.
 */
function readEntry({
  mode,
  setNumber,
  draft,
  referenceUnit,
  weightUnit,
  modality,
  showLoad,
}: {
  mode: 'new' | 'edit'
  setNumber: number
  draft: SetDraft
  referenceUnit: WeightUnit | undefined
  weightUnit: WeightUnit | null
  modality: PrescribedModality
  showLoad: boolean
}): SetEntryReading {
  // Zero is an observation too. A row with no observed weight supplies no
  // reference unit; an untouched empty form can follow the profile as it loads.
  const selectedUnit = draft.chosenUnit ?? referenceUnit ?? weightUnit
  const weightValue = showLoad ? parsed(draft.weight) : null
  const measureValue = parsed(draft.measure)

  const weightInvalid = weightValue === 'invalid' || isNegative(weightValue)
  const measureInvalid = measureValue === 'invalid' || isNegative(measureValue)

  return {
    selectedUnit,
    weightInvalid,
    measureInvalid,
    performed: weightInvalid || measureInvalid ? null : {
      setNumber,
      ...(showLoad && selectedUnit !== null && (mode === 'edit' || selectedUnit !== weightUnit)
        ? { weightUnit: selectedUnit } : {}),
      ...(typeof measureValue === 'number' ? measureField(measureValue, modality) : {}),
      ...(typeof weightValue === 'number' ? { weight: weightValue } : {}),
      // A new set states an effort only when one was chosen. A correction
      // states it either way, so a cleared answer is handed over as null.
      ...(mode === 'edit' || draft.effort !== null ? { effort: draft.effort } : {}),
    },
  }
}

/**
 * Weight, Unit and the measure, on one row. Changing the unit relabels the
 * number and never converts it; an unloaded movement omits both load fields.
 */
function SetMeasureFields({
  entry,
  draft,
  onDraft,
  measureLabel,
  modality,
  showLoad,
}: {
  entry: SetEntryReading
  draft: SetDraft
  onDraft: (draft: SetDraft) => void
  measureLabel: string
  modality: PrescribedModality
  showLoad: boolean
}) {
  const { selectedUnit, weightInvalid, measureInvalid } = entry

  return (
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

// ─────────────────────────────────────────────────────────────────────────────
// A superset's round
// ─────────────────────────────────────────────────────────────────────────────

/*
 * REQ-016 — a superset's one Log round: the movements' results, entered
 * separately in one half-sheet and handed to the shell together. It lives
 * here because this file is the presentation layer's one `logSet` caller.
 *
 * Each movement keeps its own fields, in its own unit and modality, and its
 * own effort answer. Nothing typed for one is ever read for another, so a
 * result cannot be copied between partners.
 *
 * What a round records is what the athlete identified, never what the round
 * implies:
 *
 *   · a movement is logged when its **Performed** tick is set, and typing a
 *     result or choosing an effort for it sets that tick — an explicitly
 *     entered result saves without a second gesture;
 *   · a ticked movement with blank fields is performed and not measured, and
 *     its measurements are `null`, never a zero;
 *   · an unticked movement is not logged at all. Blank fields, a prefilled
 *     suggestion, its partner's result and the round's own advance are none
 *     of them evidence that it was performed, so its set stays missing;
 *   · nothing requires both movements. The action waits only for one movement
 *     to log, and an unreadable field refuses the round where it is.
 *
 * Every movement in a round logs the same set number — the round's — so a
 * partner that missed a round keeps a gap at that number rather than having
 * its next result slide into it.
 *
 * The rest is the block's and is started once, by the round (EXE-05). The
 * session clock is the shell's, and nothing here reads or restarts it.
 */

/**
 * The round the pair is entering: one past the highest set any of its
 * movements has recorded. A movement that missed a round keeps the gap.
 */
export function supersetRound(sets: readonly (readonly LoggedSet[])[]): number {
  return sets.reduce(
    (highest, logged) => logged.reduce((top, set) => Math.max(top, set.setNumber), highest),
    0,
  ) + 1
}

/** One movement's part of the round entry. */
interface MovementEntry {
  readonly draft: SetDraft
  /** Set only by the athlete — the tick, a typed result or an effort answer. */
  readonly performed: boolean
}

/**
 * The round's entries, by `workout_exercises.id`, for the round they are for.
 * The block holds it, not the sheet, so collapsing the sheet loses nothing.
 */
export interface RoundDraft {
  readonly round: number
  readonly entries: Readonly<Record<string, MovementEntry>>
}

export interface SupersetRoundSheetProps {
  /** The movements, in prescribed order, each with its block ordinal. */
  movements: readonly { readonly exercise: ExerciseProgress; readonly ordinal: string }[]
  round: number
  /** The block's rest, raised once per round logged. */
  roundRestSeconds: number | null
  /** The entry so far, or `null` before anything was entered. */
  held: RoundDraft | null
  onHeld: (draft: RoundDraft) => void
  onCollapse: () => void
}

export function SupersetRoundSheet({
  movements,
  round,
  roundRestSeconds,
  held,
  onHeld: setHeld,
  onCollapse,
}: SupersetRoundSheetProps) {
  const { logSet, loggedSets, isSaving, weightUnit } = useSetLogging()
  const restTimer = useRestTimer()

  const parts = movements.map(({ exercise, ordinal }) => {
    const prescription = exercise.prescription
    const prefill = prefillFrom(loggedSets(exercise.exerciseId))
    const prefilledWeight = prefill !== null && prefill.weight !== null
    const unloaded = incrementFor(prescription.equipment_used, 'kg') === null
    return {
      exercise,
      ordinal,
      name: exerciseName(prescription.exercise_id),
      fresh: newDraft(round, prefill, prescription),
      referenceUnit: prefilledWeight ? prefill.weightUnit : undefined,
      showLoad: !unloaded || prefilledWeight,
    }
  })

  // Collapsing and reopening hands back exactly what was typed. The entry
  // starts over only once the round itself moves on.
  const draft = held !== null && held.round === round ? held : { round, entries: {} }

  const update = (exerciseId: string, entry: MovementEntry) =>
    setHeld({ round, entries: { ...draft.entries, [exerciseId]: entry } })

  const readings = parts.map((part) => {
    const entry = draft.entries[part.exercise.exerciseId] ?? { draft: part.fresh, performed: false }
    return {
      part,
      entry,
      reading: readEntry({
        mode: 'new',
        setNumber: round,
        draft: entry.draft,
        referenceUnit: part.referenceUnit,
        weightUnit,
        modality: part.exercise.prescription.modality,
        showLoad: part.showLoad,
      }),
    }
  })

  const chosen = readings.filter(({ entry }) => entry.performed)
  const refused = chosen.some(({ reading }) => reading.performed === null)
  const saving = parts.some((part) => isSaving(part.exercise.exerciseId))

  const submit = (): boolean => {
    if (chosen.length === 0 || refused || saving) return false

    for (const { part, reading } of chosen) {
      if (reading.performed !== null) logSet(part.exercise.exerciseId, reading.performed)
    }

    // The round's one rest, after the pair. A round the shell cannot accept
    // — no unit to stamp — earns none.
    const rest = prescribedRestSeconds(roundRestSeconds)
    const closing = parts[parts.length - 1]
    if (rest !== null && weightUnit !== null && closing !== undefined) {
      restTimer.start({ exerciseId: closing.exercise.exerciseId, label: `round ${round}`, seconds: rest })
    }
    return true
  }

  return (
    <SetLoggingSheet
      mode="new"
      setNumber={round}
      entryName={`round ${round}`}
      formLabel={`Log round ${round} of ${parts.map((part) => part.name).join(' and ')}`}
      context="Tick each movement you performed. A blank field is saved as not recorded."
      measures={readings.map(({ part, entry, reading }) => {
        // Any explicit entry for this movement identifies it as performed.
        const enter = (next: SetDraft) =>
          update(part.exercise.exerciseId, { draft: next, performed: true })
        const prescription = part.exercise.prescription

        return (
          <div
            key={part.exercise.exerciseId}
            role="group"
            aria-label={`${part.ordinal} ${part.name}, set ${round}`}
            className="clr-stack clr-stack--tight"
          >
            <p style={ROUND_MOVEMENT_STYLE}>
              {[`${part.ordinal} ${part.name}`, prescriptionText(prescription)].join(' · ')}
            </p>
            <Checkbox
              label="Performed"
              checked={entry.performed}
              onChange={(performed) => update(part.exercise.exerciseId, { ...entry, performed })}
            />
            <SetMeasureFields
              entry={reading}
              draft={entry.draft}
              onDraft={enter}
              measureLabel={modalityLabel(prescription)}
              modality={prescription.modality}
              showLoad={part.showLoad}
            />
            <SetEffortChoice
              setNumber={round}
              value={entry.draft.effort}
              onChange={(effort) => enter({ ...entry.draft, effort })}
            />
          </div>
        )
      })}
      saving={saving}
      blocked={chosen.length === 0 || refused}
      onSubmit={submit}
      onCollapse={onCollapse}
    />
  )
}

const ROUND_MOVEMENT_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-sm-size)',
  letterSpacing: 'var(--tracking-data)',
}
