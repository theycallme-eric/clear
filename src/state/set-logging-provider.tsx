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
 *   · **The unit.** `weight_unit` is NOT NULL and is stamped from the profile
 *     in force at write time. With no profile loaded there is no unit to
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
import { createError, ErrorCode, isErr, type AppError } from './errors'
import {
  attempted,
  defaultQueueStorage,
  enqueued,
  hasSustainedFailure,
  isAlreadyStored,
  queuedSetLog,
  readSetLogQueue,
  reconciled,
  retryable,
  retryDelayMs,
  settled,
  writeSetLogQueue,
  type QueuedSetLog,
  type QueueStorage,
} from './set-log-queue'
import {
  loggedSetFromEntry,
  loggedSetFromRow,
  SetLoggingContext,
  type LoggedSet,
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
   * The unit every row this session writes is stamped with, from the profile.
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

  const flushing = useRef(false)
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
  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    setSyncing(true)

    const sent = new Set<string>()
    try {
      for (;;) {
        const next = retryable(queueRef.current).find((item) => !sent.has(item.entry.id))
        if (next === undefined) break
        sent.add(next.entry.id)

        setInFlight(next.entry.id)
        const result = await setLogs.log(next.entry)
        setInFlight(null)

        if (isErr(result)) {
          if (isAlreadyStored(result.error)) {
            // The id is this queue's own, so a collision can only be the write
            // this entry already made. The set is stored; the retry was the
            // idempotent one the client-generated id exists to make possible.
            // What is stored is what this entry sent, so there is nothing to
            // read back.
            applyQueue((current) => settled(current, next.entry.id))
            confirm(next.entry.exerciseId, loggedSetFromEntry(next.entry, 'logged'))
            continue
          }

          // It stays queued either way: a refusal a retry cannot fix stops
          // being sent (`isStalled`) but is never discarded, because a set
          // that silently disappeared is the defect this module closes.
          applyQueue((current) => attempted(current, next.entry.id, result.error))
          continue
        }

        applyQueue((current) => settled(current, next.entry.id))
        confirm(next.entry.exerciseId, loggedSetFromRow(result.value))
      }
    } finally {
      flushing.current = false
      setInFlight(null)
      setSyncing(false)
      scheduleRef.current()
    }
  }, [applyQueue, confirm, setLogs])

  /** The next pass, on a doubling backoff. Nothing owed, nothing scheduled. */
  const schedule = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    if (retryable(queueRef.current).length === 0) return

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

  /** The queued sets as the screen reads them, keyed by prescription. */
  const pending = useMemo(() => {
    const byExercise: Record<string, LoggedSet[]> = {}

    for (const item of queue) {
      // One refused attempt is enough to stop calling it "syncing": the user
      // is entitled to know the set is only on this device.
      const status = item.attempts === 0 ? 'syncing' : 'failed'
      const sets = byExercise[item.entry.exerciseId] ?? []
      sets.push(loggedSetFromEntry(item.entry, status))
      byExercise[item.entry.exerciseId] = sets
    }

    return byExercise
  }, [queue])

  const api = useMemo<SetLoggingApi>(() => {
    const setsFor = (exerciseId: string): readonly LoggedSet[] =>
      [...(confirmed[exerciseId] ?? []), ...(pending[exerciseId] ?? [])].sort(
        (left, right) => left.setNumber - right.setNumber,
      )

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

        const entry: SetLogEntry = {
          id: newId === undefined ? crypto.randomUUID() : newId(),
          exerciseId,
          blockId: exercise.blockId,
          distanceUnit: exercise.prescription.distance_unit,
          weightUnit,
          performed,
        }

        // Durable before anything is sent. Everything after this line can fail
        // — the request, the tab, the phone — without losing the set.
        applyQueue((current) =>
          enqueued(current, queuedSetLog(entry, sessionId, new Date(now()).toISOString())),
        )
        void flush()
      },
      loggedSets: setsFor,
      isSaving(exerciseId) {
        return queue.some(
          (item) => item.entry.id === inFlight && item.entry.exerciseId === exerciseId,
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
    exercises,
    flush,
    inFlight,
    newId,
    now,
    onFailure,
    pending,
    queue,
    sessionId,
    syncing,
    weightUnit,
  ])

  return <SetLoggingContext value={api}>{children}</SetLoggingContext>
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
