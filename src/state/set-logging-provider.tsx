/**
 * EXE-02's one write path, made durable by EXE-07.
 *
 * `set-logging.ts` is the vocabulary: the set a renderer observed, the row it
 * maps to, and the seam (`useSetLogging`) the renderers call. `set-log-queue.ts`
 * is the durable half: what an unsent set looks like on disk and what a retry
 * is worth. This file is where the two meet, and it is still the mirror of
 * `block-completion-provider.tsx` — the same split, for the same reason. Every
 * structure that logs a set logs it here, so "each logged set is a row written
 * at log time" is a property of one module rather than a habit six renderers
 * have to keep.
 *
 * What it owns:
 *
 *   · **Attribution.** A set is written against a prescription that is in a
 *     block of *this* session, or it is not written at all. The exercise id a
 *     renderer hands over is resolved against the session's own prescriptions
 *     rather than trusted, which is the client-side half of the composite
 *     foreign key that refuses a superseded row (DATA-01d §3).
 *   · **The unit.** `weight_unit` is NOT NULL: the athlete's explicit per-set
 *     choice, otherwise the profile in force at write time. With no profile loaded there is no unit to
 *     stamp, and the set is refused rather than written in a guessed one —
 *     a kilogram recorded as a pound is an injury path, not a display bug.
 *   · **The id.** Minted before the entry is queued, so a retried flush
 *     collides with the first write instead of creating a phantom set.
 *   · **Local first, then the network (EXE-07).** The set is serialised to the
 *     durable queue inside the tap's own tick, and only then flushed. A tab
 *     killed between the two still has the set, and a reload picks it up.
 *     Nothing is held until the end of the workout, because a workout that
 *     ended in a crashed tab is exactly when the sets matter most (D7).
 *   · **Telling the truth about where a set is.** A queued set is drawn, and it
 *     is drawn as `syncing` or `failed` — never as confirmed. `logged` means a
 *     row exists, and it means nothing else.
 *
 * What it deliberately does not do is raise a failure per set. A refused flush
 * is retried on a backoff, on `online`, and when the tab comes back to the
 * foreground; the shell states the count once, through `sync`. `onFailure` is
 * left for the one refusal that is not a sync problem at all — a set that
 * cannot be accepted in the first place, because there is no unit to stamp.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { Enums } from '../data/database.types'
import { createError, ErrorCode, isErr, err, ok, type AppError } from './errors'
import {
  attempted,
  cleared,
  corrected,
  defaultQueueStorage,
  dispatched,
  enqueued,
  hasSustainedFailure,
  isAlreadyStored,
  isInsert,
  mutationKey,
  queuedSetLog,
  readSetLogQueue,
  reconciled,
  retryDelayMs,
  sendable,
  settled,
  writeSetLogQueue,
  type QueuedSetLog,
  type QueueStorage,
} from './set-log-queue'
import {
  loggedSetFromEntry,
  loggedSetFromRow,
  setLogViolation,
  SetLoggingContext,
  SetLogFlushContext,
  type LoggedSet,
  type PerformedSet,
  type SetLoggingApi,
  type SetLogEntry,
} from './set-logging'
import type { ExerciseProgress } from './workout-progress'
import { useWorkoutClients } from './workout-queries'

/** Sets the database holds, keyed by the prescription they belong to. */
type ConfirmedSets = Readonly<Record<string, readonly LoggedSet[]>>

export interface SetLoggingProviderProps {
  /** The session being performed: stamped on a queued set so a resume can place it. */
  sessionId: string
  /**
   * Every active prescription in the session. The seam takes an exercise id,
   * and this is what turns that id into the prescription it names — and what
   * makes a set for an exercise the user is not performing a no-op rather than
   * a row attributed to somebody else's block.
   */
  exercises: readonly ExerciseProgress[]
  /**
   * The default unit, from the profile, unless the athlete chooses a per-set unit.
   * `null` while the profile is unread: no unit, no write.
   */
  weightUnit: Enums<'weight_unit'> | null
  /**
   * Where a set that cannot be *accepted* is shown: the shell's one error
   * surface. A set that was accepted and has not yet synced does not come
   * through here — that is `sync`, stated once, with a count.
   */
  onFailure: (error: AppError) => void
  /** The set-log id, injectable so a test can assert the row it wrote. */
  newId?: () => string
  /** Where the queue survives a reload. `null` disables durability, not logging. */
  storage?: QueueStorage | null
  /** The clock the queue is stamped from. */
  now?: () => number
  /** Backoff between flush passes, injectable so a test does not wait for one. */
  retryDelay?: (queue: readonly QueuedSetLog[]) => number
  /**
   * Whether saved sets can be corrected or cleared (REQ-013). The active
   * workout passes it; nothing else does, so no other screen gains an editor.
   */
  corrections?: boolean
  /** A correction's or a clear's own id, injectable so a test can name it. */
  newMutationId?: () => string
  children: ReactNode
}

export function SetLoggingProvider({
  sessionId,
  exercises,
  weightUnit,
  onFailure,
  newId,
  storage,
  now = Date.now,
  retryDelay = retryDelayMs,
  corrections = false,
  newMutationId,
  children,
}: SetLoggingProviderProps) {
  const { setLogs } = useWorkoutClients()
  const queueStorage = storage === undefined ? defaultQueueStorage() : storage

  // Seeded from the snapshot, so a resumed session shows the sets it already
  // has — and prefills the next one from the last one actually performed.
  const [confirmed, setConfirmed] = useState<ConfirmedSets>(() => seedFrom(exercises))

  // Seeded from disk, reconciled against that same snapshot: a set whose write
  // landed but whose answer never arrived is already in the rows, and asking
  // the user about it — or sending it again — would be the app arguing with
  // itself. The reconciliation is written back immediately, so the durable
  // copy and the screen agree from the first render.
  const [queue, setQueue] = useState<readonly QueuedSetLog[]>(() => {
    const restored = reconciled(readSetLogQueue(queueStorage), storedSets(exercises))
    writeSetLogQueue(queueStorage, restored)
    return restored
  })

  const [inFlight, setInFlight] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  // The mutation in flight, read synchronously by a correction or a clear made
  // while its request is out: that one can no longer be rewritten or withdrawn.
  const inFlightRef = useRef<string | null>(null)

  // The queue is read inside an async pass and written inside a tap handler,
  // so the ref is the live copy and the state is the render's view of it.
  const queueRef = useRef(queue)
  const storageRef = useRef(queueStorage)
  useEffect(() => {
    storageRef.current = queueStorage
  })

  /**
   * The one place the queue changes. Disk first, then state: the durable copy
   * is never behind what the screen believes, which is the whole point of
   * having one.
   */
  const applyQueue = useCallback(
    (change: (current: readonly QueuedSetLog[]) => readonly QueuedSetLog[]) => {
      const next = change(queueRef.current)
      queueRef.current = next
      writeSetLogQueue(storageRef.current, next)
      setQueue(next)
    },
    [],
  )

  /** A set the database now holds. Never added twice: the set number is its identity. */
  const confirm = useCallback((exerciseId: string, set: LoggedSet) => {
    setConfirmed((current) => {
      const existing = current[exerciseId] ?? []
      if (existing.some((candidate) => candidate.setNumber === set.setNumber)) {
        return current
      }
      return { ...current, [exerciseId]: [...existing, set] }
    })
  }, [])

  /** A corrected row, as the database now holds it, in place of the one it was. */
  const replace = useCallback((exerciseId: string, set: LoggedSet) => {
    setConfirmed((current) => {
      const existing = (current[exerciseId] ?? []).filter((candidate) => candidate.id !== set.id)
      return { ...current, [exerciseId]: [...existing, set] }
    })
  }, [])

  /** A cleared row: gone from the screen once, and only once, the database says so. */
  const remove = useCallback((exerciseId: string, id: string) => {
    setConfirmed((current) => ({
      ...current,
      [exerciseId]: (current[exerciseId] ?? []).filter((candidate) => candidate.id !== id),
    }))
  }, [])

  const flushing = useRef<Promise<void> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRef = useRef<() => void>(() => {})

  /**
   * One pass over everything still owed, oldest first.
   *
   * Each entry is sent once per pass, and the next entry is re-read from the
   * live queue rather than from a snapshot taken at the start — so a set
   * logged while the pass is running goes out in the same pass instead of
   * waiting for a backoff it did nothing to earn.
   */
  const flush = useCallback((): Promise<void> => {
    if (flushing.current !== null) return flushing.current
    const pass = async () => {
      setSyncing(true)

      const sent = new Set<string>()
      try {
        for (;;) {
          const next = sendable(queueRef.current).find((item) => !sent.has(mutationKey(item)))
          if (next === undefined) break
          const key = mutationKey(next)
          sent.add(key)

          // Marked on disk before the request exists: from here on the
          // mutation may land whatever happens to its answer (REQ-013).
          inFlightRef.current = key
          setInFlight(key)
          applyQueue((current) => dispatched(current, key))

          if (next.kind === 'correct') {
            const result = await setLogs.correct(next.entry)
            inFlightRef.current = null
            setInFlight(null)
            if (isErr(result)) {
              applyQueue((current) => attempted(current, key, result.error))
              continue
            }
            applyQueue((current) => settled(current, key))
            replace(next.entry.exerciseId, loggedSetFromRow(result.value))
            continue
          }

          if (next.kind === 'clear') {
            const result = await setLogs.clear(next.entry)
            inFlightRef.current = null
            setInFlight(null)
            if (isErr(result)) {
              applyQueue((current) => attempted(current, key, result.error))
              continue
            }
            applyQueue((current) => settled(current, key))
            remove(next.entry.exerciseId, next.entry.id)
            continue
          }

          const result = await setLogs.log(next.entry)
          inFlightRef.current = null
          setInFlight(null)

          if (isErr(result)) {
            if (isAlreadyStored(result.error)) {
              // The id is this queue's own, so a collision can only be the write
              // this entry already made. The set is stored; the retry was the
              // idempotent one the client-generated id exists to make possible.
              // What is stored is what this entry sent, so there is nothing to
              // read back.
              applyQueue((current) => settled(current, key))
              confirm(next.entry.exerciseId, loggedSetFromEntry(next.entry, 'logged'))
              continue
            }

            // It stays queued either way: a refusal a retry cannot fix stops
            // being sent (`isStalled`) but is never discarded, because a set
            // that silently disappeared is the defect this module closes.
            applyQueue((current) => attempted(current, key, result.error))
            continue
          }

          applyQueue((current) => settled(current, key))
          confirm(next.entry.exerciseId, loggedSetFromRow(result.value))
        }
      } finally {
        inFlightRef.current = null
        setInFlight(null)
        setSyncing(false)
        scheduleRef.current()
      }
    }
    const pending = pass()
    flushing.current = pending
    const settlePass = () => {
      if (flushing.current === pending) flushing.current = null
    }
    void pending.then(settlePass, settlePass)
    return pending
  }, [applyQueue, confirm, remove, replace, setLogs])

  const flushBeforeContinue = useCallback(async () => {
    // Join an existing pass rather than starting a duplicate write. A failed
    // observation stays in the same durable queue with the same client id.
    await flush()
    const remaining = queueRef.current.filter((item) => item.sessionId === sessionId)
    if (remaining.length > 0) {
      return err(createError(remaining[0].lastErrorCode ?? ErrorCode.PERSISTENCE_WRITE_FAILED, {
        details: { unsyncedSets: remaining.length },
      }))
    }
    return ok(undefined)
  }, [flush, sessionId])

  /** The next pass, on a doubling backoff. Nothing owed, nothing scheduled. */
  const schedule = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    if (sendable(queueRef.current).length === 0) return

    timer.current = setTimeout(() => {
      timer.current = null
      void flush()
    }, retryDelay(queueRef.current))
  }, [flush, retryDelay])

  useEffect(() => {
    scheduleRef.current = schedule
  }, [schedule])

  /**
   * When to try again without being asked. A restored queue goes out on mount;
   * after that, the two moments a dead signal actually comes back are the
   * `online` event and the tab returning to the foreground — a phone in a
   * pocket between sets runs no timers worth trusting.
   */
  useEffect(() => {
    void flush()

    const resume = () => {
      void flush()
    }
    const onVisible = () => {
      if (globalThis.document?.visibilityState === 'visible') resume()
    }

    globalThis.addEventListener?.('online', resume)
    globalThis.addEventListener?.('visibilitychange', onVisible)

    return () => {
      globalThis.removeEventListener?.('online', resume)
      globalThis.removeEventListener?.('visibilitychange', onVisible)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
    }
  }, [flush])

  /**
   * What the queue says each row now is, keyed by prescription then row id:
   * the set its latest mutation states, or `null` for a row being cleared.
   * Every row with something queued is drawn unconfirmed — a correction that
   * has not landed is not a saved correction (REQ-013).
   */
  const pending = useMemo(() => {
    const byExercise: Record<string, Map<string, LoggedSet | null>> = {}
    const refused = new Set<string>()

    for (const item of queue) {
      // One refused attempt is enough to stop calling it "syncing": the user
      // is entitled to know the set is only on this device.
      if (item.attempts > 0) refused.add(item.entry.id)
      const status = refused.has(item.entry.id) ? 'failed' : 'syncing'
      const rows = byExercise[item.entry.exerciseId] ?? new Map<string, LoggedSet | null>()
      rows.set(item.entry.id, item.kind === 'clear' ? null : loggedSetFromEntry(item.entry, status))
      byExercise[item.entry.exerciseId] = rows
    }

    return byExercise
  }, [queue])

  const api = useMemo<SetLoggingApi>(() => {
    const setsFor = (exerciseId: string): readonly LoggedSet[] => {
      const rows = new Map((confirmed[exerciseId] ?? []).map((set) => [set.id, set]))
      for (const [id, set] of pending[exerciseId] ?? []) {
        if (set === null) rows.delete(id)
        else rows.set(id, set)
      }
      return [...rows.values()].sort((left, right) => left.setNumber - right.setNumber)
    }

    /** A correction or a clear, stamped and given its own identity. */
    const mutation = (entry: SetLogEntry): QueuedSetLog => ({
      ...queuedSetLog(entry, sessionId, new Date(now()).toISOString()),
      mutationId: newMutationId === undefined ? crypto.randomUUID() : newMutationId(),
    })

    /** The saved set a correction or clear addresses, by the id it was read under. */
    const target = (exerciseId: string, setId: string) => {
      const exercise = exercises.find((candidate) => candidate.exerciseId === exerciseId)
      const set = setsFor(exerciseId).find((candidate) => candidate.id === setId)
      return exercise === undefined || set === undefined ? null : { exercise, set }
    }

    const correctSet = (exerciseId: string, setId: string, performed: PerformedSet) => {
      const found = target(exerciseId, setId)
      if (found === null) return
      const { exercise, set } = found

      const { weightUnit: override, ...measurements } = performed
      if (override !== undefined && override !== 'kg' && override !== 'lb') {
        onFailure(createError(ErrorCode.VALIDATION_OUT_OF_RANGE, {
          details: { field: 'weight_unit' },
        }))
        return
      }

      // The set keeps its own identity: its number, its classification and
      // — absent an explicit choice — the unit it was recorded in, never the
      // profile's current one.
      const entry: SetLogEntry = {
        id: set.id,
        exerciseId,
        blockId: exercise.blockId,
        distanceUnit: exercise.prescription.distance_unit,
        weightUnit: override ?? set.weightUnit,
        performed: {
          ...measurements,
          setNumber: set.setNumber,
          ...(set.isWarmup ? { isWarmup: true } : {}),
        },
      }
      const violation = setLogViolation(entry)
      if (violation !== null) {
        onFailure(createError(ErrorCode.VALIDATION_OUT_OF_RANGE, { details: { ...violation } }))
        return
      }

      applyQueue((current) => corrected(current, mutation(entry), inFlightRef.current))
      void flush()
    }

    const clearSet = (exerciseId: string, setId: string) => {
      const found = target(exerciseId, setId)
      if (found === null) return
      const { exercise, set } = found

      const entry: SetLogEntry = {
        id: set.id,
        exerciseId,
        blockId: exercise.blockId,
        distanceUnit: exercise.prescription.distance_unit,
        weightUnit: set.weightUnit,
        performed: { setNumber: set.setNumber },
      }

      applyQueue((current) => cleared(current, mutation(entry), inFlightRef.current))
      void flush()
    }

    return {
      weightUnit,
      logSet(exerciseId, performed) {
        const exercise = exercises.find((candidate) => candidate.exerciseId === exerciseId)
        if (exercise === undefined) return

        // `exercise_set_logs_set_number_unique` would refuse this, and a write
        // that is certain to fail is worse than no write: it would put an
        // error in front of a user whose set is already recorded. A set still
        // in the queue counts — it is recorded, just not yet stored.
        if (setsFor(exerciseId).some((set) => set.setNumber === performed.setNumber)) {
          return
        }

        if (weightUnit === null) {
          onFailure(
            createError(ErrorCode.VALIDATION_REQUIRED_FIELD, {
              details: { field: 'weight_unit', reason: 'profile-unread' },
            }),
          )
          return
        }

        // The UI choice is an override, not another measurement. Resolve it
        // exactly once; the durable entry has only its outer canonical unit.
        const { weightUnit: override, ...measurements } = performed
        if (override !== undefined && override !== 'kg' && override !== 'lb') {
          onFailure(createError(ErrorCode.VALIDATION_OUT_OF_RANGE, {
            details: { field: 'weight_unit' },
          }))
          return
        }

        const entry: SetLogEntry = {
          id: newId === undefined ? crypto.randomUUID() : newId(),
          exerciseId,
          blockId: exercise.blockId,
          distanceUnit: exercise.prescription.distance_unit,
          weightUnit: override ?? weightUnit,
          performed: measurements,
        }

        // Durable before anything is sent. Everything after this line can fail
        // — the request, the tab, the phone — without losing the set.
        applyQueue((current) =>
          enqueued(current, queuedSetLog(entry, sessionId, new Date(now()).toISOString())),
        )
        void flush()
      },
      loggedSets: setsFor,
      ...(corrections ? { correctSet, clearSet } : {}),
      isSaving(exerciseId) {
        return queue.some(
          (item) =>
            isInsert(item) && mutationKey(item) === inFlight && item.entry.exerciseId === exerciseId,
        )
      },
      sync: {
        unsyncedCount: queue.length,
        sustainedFailure: hasSustainedFailure(queue),
        syncing,
      },
      retrySync() {
        void flush()
      },
    }
  }, [
    applyQueue,
    confirmed,
    corrections,
    exercises,
    flush,
    inFlight,
    newId,
    newMutationId,
    now,
    onFailure,
    pending,
    queue,
    sessionId,
    syncing,
    weightUnit,
  ])

  return (
    <SetLoggingContext value={api}>
      <SetLogFlushContext value={flushBeforeContinue}>{children}</SetLogFlushContext>
    </SetLoggingContext>
  )
}

/** The snapshot's own logs, lowest set first, keyed by prescription. */
function seedFrom(exercises: readonly ExerciseProgress[]): ConfirmedSets {
  const seeded: Record<string, readonly LoggedSet[]> = {}

  for (const exercise of exercises) {
    seeded[exercise.exerciseId] = [...exercise.setLogs]
      .map(loggedSetFromRow)
      .sort((left, right) => left.setNumber - right.setNumber)
  }

  return seeded
}

/** Every set the snapshot says is already stored, in the queue's own terms. */
function storedSets(
  exercises: readonly ExerciseProgress[],
): readonly { id: string; exerciseId: string; setNumber: number }[] {
  return exercises.flatMap((exercise) =>
    exercise.setLogs.map((row) => ({
      id: row.id,
      exerciseId: exercise.exerciseId,
      setNumber: row.set_number,
    })),
  )
}
