/**
 * TASK-043 (REQ-019; C45; R82, R100) — the accepted set-logging moments,
 * `/gallery/refinements?state=anchor`, `?state=other-lift`,
 * `?state=timed-movement`, `?state=distance-movement`, `?state=extra-set` and
 * `?state=set-correction` (accepted gallery reference
 * eded158cfd928d382c9a9409e2c372270312741d, `GalleryLoggingMoment`).
 *
 * Deliberate consolidation of the reference's synthetic forms. The reference
 * drew a look-alike form with a synthetic Save and "Recorded" inside the
 * shared `LoggingOverlay`. Here each state renders the route's own
 * `StandardBlock` — its movement card, Rest, saved rows and Edit, and the
 * `ExerciseSetLogger` entry in the shared focused logging dialog it adopted —
 * over the shell's own `SetLoggingProvider` and the session's one rest
 * (`RestTimerProvider`), as `/workout` composes them. The fields, effort,
 * Save confirmation, correction, Clear set with Keep set, and the rest beside
 * the entry are the route's; nothing is copied.
 *
 * Memory only. The set-observation client below answers each write in memory
 * for this mount, so a Log set, Save correction or Clear set changes only the
 * gallery's copy; every other client refuses, the coaching library is the
 * gallery's in-memory one, and the block completion has no forward action
 * here. No account, no network, no route storage (`storage={null}`), and no
 * production writer is substituted: the provider, its queue and its writer
 * contract are the shell's.
 *
 * - `anchor`: the primary lift (back squat, Primary lift section).
 * - `other-lift`: another lift (Romanian deadlift, Accessory section).
 * - `timed-movement`: an unloaded timed set (plank, Seconds only).
 * - `distance-movement`: a loaded distance set (farmer carry, Weight/Unit and
 *   Distance in metres).
 * - `extra-set`: the prescribed three sets already logged, so the card counts
 *   `Extra set 4` and its Rest opens `Log set 4`.
 * - `set-correction`: one saved set whose Edit opens `Edit set 1` with Save
 *   correction / Cancel and Clear set (Keep set the safe action).
 */
import { useState, type ReactNode } from 'react'

import type { SetLogsClient } from '../data/workout'
import { BlockCompletionProvider } from '../state/block-completion-provider'
import { createError, err, ErrorCode, ok } from '../state/errors'
import { RestTimerProvider } from '../state/rest-provider'
import {
  CONTRACT_VERSION,
  exerciseSetLogRowSchema,
  type ExerciseSetLogRow,
  type Prescription,
  type SessionAcceptance,
} from '../state/schemas'
import { SetLoggingProvider } from '../state/set-logging-provider'
import type { SetObservationAck, SetObservationHead } from '../state/set-observation-mutation'
import { useWorkoutClients, WorkoutClientsContext } from '../state/workout-queries'
import type { BlockProgress } from '../state/workout-progress'
import { SectionLabelContext } from '../ui/section-label-context'
import { SetLoggingSheetHost } from '../ui/set-logging-sheet'
import { useSetLoggingSheetOpen } from '../ui/set-logging-sheet-context'
import { StandardBlock } from '../ui/standard-block'
import { RestTimerBar } from '../ui/workout-chrome'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import { galleryAmrapProgress } from './gallery-refinement-forms-data'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

/** The six set-logging moments this family adopted (TASK-043). */
export type GallerySetLoggingContext =
  | 'anchor'
  | 'other-lift'
  | 'timed-movement'
  | 'distance-movement'
  | 'extra-set'
  | 'set-correction'

/** A session id the gallery's block reports under; nothing is ever written for it. */
const GALLERY_SESSION_ID = '00000000-0000-4000-8000-000000009043'
const AT = '2026-11-10T09:00:00+00:00'
const noop = () => {}

function prescription(overrides: Partial<Prescription> & Pick<Prescription, 'exercise_id' | 'equipment'>): Prescription {
  return {
    session_function: 'accessory',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: 3,
    target_kind: 'fixed',
    target_value: 8,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: 90,
    tempo: null,
    load_type: 'absolute',
    load_value: 60,
    is_interval_exercise: false,
    ...overrides,
  } as Prescription
}

function standard(movement: Prescription): Block {
  return {
    structure_type: 'standard',
    rounds: null,
    timer_type: 'none',
    timer_seconds: null,
    round_rest_seconds: null,
    rep_scheme: 'fixed',
    block_notes: null,
    exercises: [movement],
  }
}

interface MomentSpec {
  readonly section: string
  readonly block: Block
  readonly blockIndex: number
  /** Sets already saved against the movement: (weight kg, reps) per set. */
  readonly saved: ReadonlyArray<{ weight: number | null; reps: number }>
}

const SQUAT = prescription({
  exercise_id: 'back-squat', equipment: 'barbell', session_function: 'primary', target_value: 5, load_value: 100, rest_seconds: 120,
})

const MOMENTS: Readonly<Record<GallerySetLoggingContext, MomentSpec>> = {
  anchor: { section: 'Primary lift', block: standard(SQUAT), blockIndex: 90, saved: [] },
  'other-lift': {
    section: 'Accessory',
    block: standard(prescription({ exercise_id: 'romanian-deadlift', equipment: 'barbell', load_value: 70, rest_seconds: 90 })),
    blockIndex: 91,
    saved: [],
  },
  'timed-movement': {
    section: 'Accessory',
    block: standard(prescription({
      exercise_id: 'plank', equipment: 'bodyweight', load_type: 'bodyweight', load_value: null,
      modality: 'time', target_value: 30, rest_seconds: 60,
    })),
    blockIndex: 92,
    saved: [],
  },
  'distance-movement': {
    section: 'Accessory',
    block: standard(prescription({
      exercise_id: 'farmer-carry', equipment: 'dumbbell', modality: 'distance', distance_unit: 'm',
      target_value: 40, load_value: 24, rest_seconds: 90,
    })),
    blockIndex: 93,
    saved: [],
  },
  'extra-set': {
    section: 'Primary lift',
    block: standard(SQUAT),
    blockIndex: 94,
    saved: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }, { weight: 100, reps: 5 }],
  },
  'set-correction': {
    section: 'Primary lift',
    block: standard(prescription({
      exercise_id: 'back-squat', equipment: 'barbell', session_function: 'primary', target_value: 8, load_value: 60, rest_seconds: 120,
    })),
    blockIndex: 95,
    saved: [{ weight: 60, reps: 8 }],
  },
}

function galleryId(n: number): string {
  return `00000000-0000-4000-8000-${String(9_043_000 + n).padStart(12, '0')}`
}

/** The moment's block as the live shell hands it over, with its saved sets. */
function momentProgress({ block, blockIndex, saved }: MomentSpec): BlockProgress {
  const progress = galleryAmrapProgress(block, blockIndex)
  const exercises = progress.exercises.map((exercise) => ({
    ...exercise,
    setLogs: saved.map((set, index): ExerciseSetLogRow => exerciseSetLogRowSchema.parse({
      id: galleryId(blockIndex * 10 + index),
      workout_exercise_id: exercise.exerciseId,
      prescription_revision_status: 'active',
      set_number: index + 1,
      actual_reps: set.reps,
      actual_duration_seconds: null,
      actual_distance: null,
      actual_distance_unit: null,
      weight: set.weight,
      weight_unit: 'kg',
      rpe: null,
      is_warmup_set: false,
      created_at: AT,
      effort: null,
    })),
  }))
  return { ...progress, exercises }
}

/**
 * The set-observation contract answered in memory: each request's receipt is
 * its own, replays are answered as replays, and a clear removes only its row.
 * Nothing leaves this mount.
 */
function memorySetLogs(seeded: readonly ExerciseSetLogRow[]): SetLogsClient {
  const heads = new Map<string, SetObservationHead>(seeded.map((row) => [
    row.id, { revision: row.mutation_revision, mutation_id: row.last_mutation_id ?? row.id, cleared: false, row },
  ]))
  const receipts = new Map<string, SetObservationAck>()
  return {
    async log() {
      return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
    },
    async mutate(mutation) {
      const replay = receipts.get(mutation.mutation_id)
      if (replay !== undefined) return ok({ ...replay, outcome: 'replayed' })
      const previous = heads.get(mutation.observation_id)
      if ((previous?.revision ?? 0) !== mutation.expected_revision) {
        return err(createError(ErrorCode.PERSISTENCE_CONFLICT))
      }
      const row = mutation.operation === 'clear' ? null : exerciseSetLogRowSchema.parse({
        id: mutation.observation_id,
        workout_exercise_id: mutation.exercise_id,
        prescription_revision_status: 'active',
        set_number: mutation.set_number,
        actual_reps: null,
        actual_duration_seconds: null,
        actual_distance: null,
        actual_distance_unit: null,
        weight: null,
        weight_unit: 'kg',
        rpe: null,
        is_warmup_set: false,
        effort: null,
        ...(previous?.row ?? {}),
        created_at: previous?.row?.created_at ?? new Date().toISOString(),
        ...mutation.values,
        mutation_revision: mutation.revision,
        last_mutation_id: mutation.mutation_id,
      })
      const head: SetObservationHead = {
        revision: mutation.revision, mutation_id: mutation.mutation_id, cleared: row === null, row,
      }
      const ack: SetObservationAck = { outcome: 'applied', mutation, head }
      heads.set(mutation.observation_id, head)
      receipts.set(mutation.mutation_id, ack)
      return ok(ack)
    },
  }
}

/**
 * The gallery's clients, with only the set observations answered in memory.
 * Also the circuit-round state's (TASK-021, `gallery-refinement-circuit.tsx`).
 */
export function MemorySetLogClients({ seeded, children }: { seeded: readonly ExerciseSetLogRow[]; children: ReactNode }) {
  const outer = useWorkoutClients()
  const [clients] = useState(() => ({ ...outer, setLogs: memorySetLogs(seeded) }))
  return <WorkoutClientsContext value={clients}>{children}</WorkoutClientsContext>
}

/**
 * The footer's rest, unless the open entry draws it (as `Workout.tsx` does).
 * Also the superset state's (TASK-044, `gallery-refinement-group-logging.tsx`).
 */
export function GalleryFooterRest() {
  return useSetLoggingSheetOpen() ? null : <RestTimerBar />
}

/** One accepted set-logging moment: the route's standard block, in memory. */
export function GallerySetLoggingMoment({ context }: { context: GallerySetLoggingContext }) {
  const spec = MOMENTS[context]
  const [block] = useState(() => momentProgress(spec))
  const seeded = block.exercises.flatMap((exercise) => exercise.setLogs)
  return (
    <GalleryCoachingClients>
      <MemorySetLogClients seeded={seeded}>
        <BlockCompletionProvider sessionId={GALLERY_SESSION_ID} blocks={[block]}>
          <SetLoggingProvider
            sessionId={GALLERY_SESSION_ID}
            exercises={block.exercises}
            weightUnit="kg"
            storage={null}
            onFailure={noop}
            // As the route offers them: Edit, Save correction and Clear set.
            corrections
          >
            <RestTimerProvider>
              <SetLoggingSheetHost>
                <div className="clr-stack" data-gallery-set-logging={context} data-contract={CONTRACT_VERSION}>
                  <SectionLabelContext value={spec.section}>
                    <StandardBlock block={block} />
                  </SectionLabelContext>
                  <GalleryFooterRest />
                </div>
              </SetLoggingSheetHost>
            </RestTimerProvider>
          </SetLoggingProvider>
        </BlockCompletionProvider>
      </MemorySetLogClients>
    </GalleryCoachingClients>
  )
}

export function GalleryAnchorSet() {
  return <GallerySetLoggingMoment context="anchor" />
}

export function GalleryOtherLiftSet() {
  return <GallerySetLoggingMoment context="other-lift" />
}

export function GalleryTimedMovementSet() {
  return <GallerySetLoggingMoment context="timed-movement" />
}

export function GalleryDistanceMovementSet() {
  return <GallerySetLoggingMoment context="distance-movement" />
}

export function GalleryExtraSet() {
  return <GallerySetLoggingMoment context="extra-set" />
}

export function GallerySetCorrection() {
  return <GallerySetLoggingMoment context="set-correction" />
}
