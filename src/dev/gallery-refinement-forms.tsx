/**
 * `/gallery/refinements?state=amrap` — the AMRAP's prescription and concise
 * scoring controls (TASK-009: C25, C26, C27, C28; G08; R52, R54, R55, R56, R57,
 * R79, R83, R85, R90), drawn by the consumer the `/workout` route draws.
 *
 * Deliberate consolidation of the accepted reference's logging moments
 * (eded158c…, `src/dev/gallery-refinement-forms.tsx`, `GalleryLoggingMoment`
 * with `context="amrap"`). The reference drew a synthetic form over a sample
 * block inside its focused logging dialog, with a synthetic Save and retry.
 * Here the state renders the route's actual `AmrapBlock` after its window has
 * ended — its work and prescription first, then the shared `TimedResultLog`
 * with its two framed `QuantitySelector` counts — over memory-only storage.
 * This file is the gallery's home for the logging forms; the other fifteen
 * contexts join it with their own tasks.
 *
 * Memory only. Each attempt's record is seeded into an in-memory
 * `ShellStorage` for this mount, so taps change only the gallery's copy; the
 * block reports to the shell's own `BlockCompletionProvider`, which saves only
 * on a section's forward action — absent here — through the gallery's refusing
 * block-result client; no history is read (`conditioningHistory={null}`), and
 * the Coaching and notes disclosure reads and writes the gallery's in-memory
 * library. Nothing reaches the network or the route's storage, and no
 * performed work is written anywhere.
 *
 * Not composed here, and owned by later tasks: the focused logging dialog,
 * its header, backdrop and contained scrolling (`refinements/logging-overlay.tsx`:
 * TASK-016, TASK-017, TASK-018, adopted for the AMRAP by TASK-046 and closed on
 * the routes by TASK-041), completion choices and the existing effort faces
 * (TASK-010), the EMOM, For Time and ladder logs (TASK-011, TASK-013,
 * TASK-046), per-movement next-round actuals and loads (TASK-031) and the
 * other logging contexts.
 */
import { useState } from 'react'

import { BlockCompletionProvider } from '../state/block-completion-provider'
import { writeAmrapState, type ShellStorage } from '../state/workout-persistence'
import { AmrapBlock } from '../ui/amrap-block'
import { Heading, HeadingSection } from '../ui/Heading'
import { QuantitySelector } from '../ui/refinements/quantity'
import { TimedResultLog, type AmrapResult } from '../ui/refinements/timed-result-log'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import { GALLERY_AMRAP_ATTEMPTS, galleryAmrapProgress, type GalleryAmrapAttemptSpec } from './gallery-refinement-forms-data'

/** One mount's storage, so the gallery never reads or writes the route's records. */
function memoryStorage(): ShellStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

/** A session id the gallery's blocks report under; nothing is ever written for it. */
const GALLERY_SESSION_ID = '00000000-0000-4000-8000-000000009000'

/** One ended attempt: the route's AMRAP over its own seeded memory record. */
function GalleryAmrapAttempt({ attempt }: { attempt: GalleryAmrapAttemptSpec }) {
  const [block] = useState(() => galleryAmrapProgress(attempt.block, attempt.blockIndex))
  const [storage] = useState(() => {
    const memory = memoryStorage()
    writeAmrapState(memory, block.blockId, attempt.record(Date.now()))
    return memory
  })
  return (
    <HeadingSection className="clr-stack" data-gallery-amrap={attempt.id}>
      <Heading className="label">{attempt.title}</Heading>
      {/*
        The shell's own completion path, over the gallery's clients: the block
        reports what it observed to it, and with no forward action here nothing
        is ever saved — the block-result writer refuses in any case.
      */}
      <BlockCompletionProvider sessionId={GALLERY_SESSION_ID} blocks={[block]}>
        <div data-gallery-context="workout">
          <AmrapBlock block={block} storage={storage} conditioningHistory={null} />
        </div>
      </BlockCompletionProvider>
    </HeadingSection>
  )
}

/** The accepted `amrap` state: the route's AMRAP, ended by its cap and ended early. */
export function GalleryAmrapResults() {
  return (
    <GalleryCoachingClients>
      <div className="clr-stack" data-gallery-amrap-results="">
        {GALLERY_AMRAP_ATTEMPTS.map((attempt) => (
          <GalleryAmrapAttempt key={attempt.id} attempt={attempt} />
        ))}
      </div>
    </GalleryCoachingClients>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Register specimens: the two shared owners alone (TASK-009)
// ─────────────────────────────────────────────────────────────────────────────

/** A count held in memory here; its consumer owns the real one. */
function MemoryQuantity({ label, initial }: { label: string; initial: number | null }) {
  const [value, setValue] = useState<number | null>(initial)
  return <QuantitySelector label={label} value={value} onChange={setValue} />
}

/** Blank: nothing reported. The minus is unavailable; the plus counts up from blank. */
export function QuantitySelectorBlank() {
  return <MemoryQuantity label="Rounds completed" initial={null} />
}

/** An observed zero: a zero, not a blank. The minus stops here. */
export function QuantitySelectorZero() {
  return <MemoryQuantity label="Reps into the next round" initial={0} />
}

/** A count: both framed actions available around the distinct value. */
export function QuantitySelectorCount() {
  return <MemoryQuantity label="Rounds completed" initial={6} />
}

/** The AMRAP's log held in memory here; its consumer owns the record and its writer. */
function MemoryAmrapLog({ initial }: { initial: AmrapResult }) {
  const [value, setValue] = useState<AmrapResult>(initial)
  return <TimedResultLog format="amrap" value={value} onChange={setValue} />
}

/** Nothing entered: both counts blank. */
export function TimedResultLogAmrapBlank() {
  return <MemoryAmrapLog initial={{ roundsCompleted: null, partialRoundReps: null }} />
}

/** Rounds and an observed zero partial round entered. */
export function TimedResultLogAmrapEntered() {
  return <MemoryAmrapLog initial={{ roundsCompleted: 4, partialRoundReps: 0 }} />
}
