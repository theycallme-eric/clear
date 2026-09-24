/**
 * EXE-02 — the one path a set is written through, as a component.
 *
 * `set-logging.ts` is the vocabulary: the set a renderer observed, the row it
 * maps to, and the seam (`useSetLogging`) the renderers call. This file is the
 * half that *does* something with it, and it is the mirror of
 * `block-completion-provider.tsx` on purpose — the same split, for the same
 * reason. Every structure that logs a set logs it here, so "each logged set is
 * a row written at log time" is a property of one module rather than a habit
 * six renderers have to keep.
 *
 * What it owns:
 *
 *   · **Attribution.** A set is written against a prescription that is in a
 *     block of *this* session, or it is not written at all. The exercise id a
 *     renderer hands over is resolved against the session's own prescriptions
 *     rather than trusted, which is the client-side half of the composite
 *     foreign key that refuses a superseded row (DATA-01d §3).
 *   · **The unit.** `weight_unit` is NOT NULL and is stamped from the profile
 *     in force at write time. With no profile loaded there is no unit to
 *     stamp, and the set is refused rather than written in a guessed one —
 *     a kilogram recorded as a pound is an injury path, not a display bug.
 *   · **The id.** Minted before the request, so EXE-07's retried flush can
 *     collide with the first write instead of creating a phantom set.
 *   · **Live writes.** One insert per set, at the moment the user logs it.
 *     Nothing is held until the end of the workout, because a workout that
 *     ended in a crashed tab is exactly when the sets matter most (D7).
 *
 * What it does not own: how a failure is shown. The shell has one error
 * surface for the session's lifecycle, for `block_results` and for this.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'

import type { Enums } from '../data/database.types'
import { createError, ErrorCode, isErr, type AppError } from './errors'
import {
  loggedSetFromRow,
  SetLoggingContext,
  type LoggedSet,
  type SetLoggingApi,
  type PerformedSet,
} from './set-logging'
import type { ExerciseProgress } from './workout-progress'
import { useWorkoutClients } from './workout-queries'

/** Sets already recorded, keyed by the prescription they belong to. */
type LoggedSets = Readonly<Record<string, readonly LoggedSet[]>>

export interface SetLoggingProviderProps {
  /**
   * Every active prescription in the session. The seam takes an exercise id,
   * and this is what turns that id into the prescription it names — and what
   * makes a set for an exercise the user is not performing a no-op rather than
   * a row attributed to somebody else's block.
   */
  exercises: readonly ExerciseProgress[]
  /**
   * The unit every row this session writes is stamped with, from the profile.
   * `null` while the profile is unread: no unit, no write.
   */
  weightUnit: Enums<'weight_unit'> | null
  /** Where a failed write is shown: the shell's one error surface. */
  onFailure: (error: AppError) => void
  /** The set-log id, injectable so a test can assert the row it wrote. */
  newId?: () => string
  children: ReactNode
}

export function SetLoggingProvider({
  exercises,
  weightUnit,
  onFailure,
  newId,
  children,
}: SetLoggingProviderProps) {
  const { setLogs } = useWorkoutClients()

  // Seeded from the snapshot, so a resumed session shows the sets it already
  // has — and prefills the next one from the last one actually performed.
  const [logged, setLogged] = useState<LoggedSets>(() => seedFrom(exercises))
  const [saving, setSaving] = useState<readonly string[]>([])

  const write = useCallback(
    async (exercise: ExerciseProgress, performed: PerformedSet, unit: Enums<'weight_unit'>) => {
      const id = newId === undefined ? crypto.randomUUID() : newId()

      setSaving((current) => [...current, exercise.exerciseId])
      const result = await setLogs.log({
        id,
        exerciseId: exercise.exerciseId,
        blockId: exercise.blockId,
        distanceUnit: exercise.prescription.distance_unit,
        weightUnit: unit,
        performed,
      })
      setSaving((current) => removeFirst(current, exercise.exerciseId))

      if (isErr(result)) {
        // Nothing is added to the logged sets: a set is drawn as logged
        // because a row came back, never because one was attempted.
        onFailure(result.error)
        return
      }

      const stored = loggedSetFromRow(result.value)
      setLogged((current) => ({
        ...current,
        [exercise.exerciseId]: [...(current[exercise.exerciseId] ?? []), stored],
      }))
    },
    [newId, onFailure, setLogs],
  )

  const api = useMemo<SetLoggingApi>(
    () => ({
      weightUnit,
      logSet(exerciseId, performed) {
        const exercise = exercises.find(
          (candidate) => candidate.exerciseId === exerciseId,
        )
        if (exercise === undefined) return

        // `exercise_set_logs_set_number_unique` would refuse this, and a write
        // that is certain to fail is worse than no write: it would put an
        // error in front of a user whose set is already recorded.
        const already = logged[exerciseId] ?? []
        if (already.some((set) => set.setNumber === performed.setNumber)) return

        if (weightUnit === null) {
          onFailure(
            createError(ErrorCode.VALIDATION_REQUIRED_FIELD, {
              details: { field: 'weight_unit', reason: 'profile-unread' },
            }),
          )
          return
        }

        void write(exercise, performed, weightUnit)
      },
      loggedSets(exerciseId) {
        return logged[exerciseId] ?? []
      },
      isSaving(exerciseId) {
        return saving.includes(exerciseId)
      },
    }),
    [exercises, logged, onFailure, saving, weightUnit, write],
  )

  return <SetLoggingContext value={api}>{children}</SetLoggingContext>
}

/** The snapshot's own logs, lowest set first, keyed by prescription. */
function seedFrom(exercises: readonly ExerciseProgress[]): LoggedSets {
  const seeded: Record<string, readonly LoggedSet[]> = {}

  for (const exercise of exercises) {
    seeded[exercise.exerciseId] = [...exercise.setLogs]
      .map(loggedSetFromRow)
      .sort((left, right) => left.setNumber - right.setNumber)
  }

  return seeded
}

/**
 * One occurrence, not all of them: two sets of the same exercise can be in
 * flight, and clearing the flag on the first answer would say the second had
 * landed.
 */
function removeFirst(values: readonly string[], value: string): readonly string[] {
  const at = values.indexOf(value)
  return at === -1 ? values : [...values.slice(0, at), ...values.slice(at + 1)]
}
