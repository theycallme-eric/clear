/**
 * TASK-005 (C16, G11, R29, R36) — the grouped Coaching and notes disclosure in
 * the accepted `cards` state (`/gallery/refinements?state=cards`) and its
 * register specimens, drawn by the actual owner the live block draws:
 * `GroupExerciseCoaching` in `WorkoutCard`'s `coaching` slot.
 *
 * The owner reads the library through the workout clients and writes each
 * note to its prescription's row. The gallery has neither an account nor a
 * row, so this module supplies memory-only controllers through the same seam
 * (REUSE.md: `src/dev` supplies synthetic data and controllers). Nothing here
 * reaches the network: the catalog is a fixed in-memory answer per slug
 * (`gallery-refinement-coaching-data.ts`), a note is kept in a map for as long
 * as the specimen is mounted, and every other client refuses. The route keeps
 * the real ones.
 */
import { useState, type ReactNode } from 'react'

import type { ExercisesClient } from '../data/exercises'
import type { WorkoutClients } from '../data/workout'
import { createError, err, ErrorCode, ok } from '../state/errors'
import { QueryClient, QueryClientContext } from '../state/query'
import type { SessionAcceptance } from '../state/schemas'
import { WorkoutClientsContext } from '../state/workout-queries'
import { structureIdentity } from '../state/workout-progress'
import { GroupExerciseCoaching } from '../ui/exercise-coaching'
import { HeadingSection } from '../ui/Heading'
import { WorkoutCard } from '../ui/refinements/workout-card'
import { CIRCUIT_BLOCK, SUPERSET_BLOCK } from './gallery-refinement-cards-data'
import {
  GALLERY_CATALOG,
  galleryExerciseProgress,
  galleryRow,
  STATES_CATALOG,
  type CatalogAnswer,
} from './gallery-refinement-coaching-data'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

/** Every client but the coaching one refuses: the gallery reaches nothing else. */
function refusing<T>(): T {
  return new Proxy({}, {
    get: () => async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
  }) as T
}

interface MemoryCoaching {
  catalog: Readonly<Record<string, CatalogAnswer>>
  /** Prescription ids whose note write fails, as a refused write would. */
  failingNotes: ReadonlySet<string>
}

function memoryExercises({ catalog, failingNotes }: MemoryCoaching): ExercisesClient {
  const notes = new Map<string, string | null>()
  return {
    async definition(slug) {
      const answer = catalog[slug]
      if (answer === 'read fails') return err(createError(ErrorCode.PERSISTENCE_READ_FAILED))
      return ok(answer ?? null)
    },
    async saveNotes(id, note) {
      const row = galleryRow(id)
      // A refused write, or one that matched no row, is reported, never kept.
      if (row === undefined || failingNotes.has(id)) return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      notes.set(id, note)
      return ok({ ...row, exercise_notes: notes.get(id) ?? null })
    },
  }
}

/** The seam the owner reads, filled with memory-only controllers for one specimen. */
export function GalleryCoachingClients({
  catalog = GALLERY_CATALOG,
  failingNotes = new Set(),
  children,
}: Partial<MemoryCoaching> & { children?: ReactNode }) {
  const [cache] = useState(() => new QueryClient())
  const [clients] = useState<WorkoutClients>(() => ({
    sessions: refusing(),
    blockResults: refusing(),
    history: refusing(),
    setLogs: refusing(),
    exercises: memoryExercises({ catalog, failingNotes }),
    conditioning: refusing(),
    candidates: refusing(),
    anchors: refusing(),
    favorites: refusing(),
  }))
  return (
    <QueryClientContext value={cache}>
      <WorkoutClientsContext value={clients}>{children}</WorkoutClientsContext>
    </QueryClientContext>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Register specimens
// ─────────────────────────────────────────────────────────────────────────────

function LiveCard({ block, blockIndex, title }: { block: Block; blockIndex: number; title: string }) {
  const identity = structureIdentity(block)
  return (
    <HeadingSection>
      <WorkoutCard
        context="workout"
        title={title}
        structure={identity}
        coaching={<GroupExerciseCoaching format={identity.format} exercises={galleryExerciseProgress(block, blockIndex)} />}
      />
    </HeadingSection>
  )
}

/** A superset's one disclosure: written guidance for both movements. */
export function GroupExerciseCoachingSuperset() {
  return (
    <GalleryCoachingClients>
      <LiveCard block={SUPERSET_BLOCK} blockIndex={1} title="Accessory" />
    </GalleryCoachingClients>
  )
}

/**
 * A circuit whose movements answer differently: written guidance (kb swing),
 * blank cues and regression (mountain climber), a failed read with its retry
 * (plank); the plank's note write fails and keeps its text while the others save.
 */
export function GroupExerciseCoachingStates() {
  const plank = galleryExerciseProgress(CIRCUIT_BLOCK, 2)[2]!.exerciseId
  return (
    <GalleryCoachingClients catalog={STATES_CATALOG} failingNotes={new Set([plank])}>
      <LiveCard block={CIRCUIT_BLOCK} blockIndex={2} title="Conditioning" />
    </GalleryCoachingClients>
  )
}
