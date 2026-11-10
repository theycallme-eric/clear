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
 * `?state=for_time` and `?state=ladder` (TASK-010: C29, C30; R78, R86, R87,
 * R124) are the same consolidation of the reference's `for_time` and `ladder`
 * logging moments: the route's actual `ForTimeBlock` and `LadderBlock`, each
 * ended twice — by Finish and by its cap — over memory-only storage, so the
 * shared `TimedResultLog` shows "Work completed" with Complete beside
 * Incomplete at the starting point the route gives it (For Time: Finish
 * Complete, the cap Incomplete; the ladder: Incomplete with no rung, because
 * nothing was tracked), then the existing three effort faces, unanswered. The
 * reference's synthetic draft, Save/retry, rung tiles, Undo and overlay are
 * not copied.
 *
 * Not composed here, and owned by later tasks: the focused logging dialog,
 * its header, backdrop and contained scrolling (`refinements/logging-overlay.tsx`:
 * TASK-016, TASK-017, TASK-018, adopted for the timed families by TASK-046 and
 * closed on the routes by TASK-041), the EMOM's end log (TASK-011), the
 * ladder's rep-first rung tiles, live check-off and quiet Undo (TASK-013,
 * TASK-014), per-movement next-round actuals and loads, notes and the
 * categorical effort's writer (TASK-015, TASK-031, TASK-047) and the other
 * logging contexts.
 */
import { useState, type ReactNode } from 'react'

import { BlockCompletionProvider } from '../state/block-completion-provider'
import { writeAmrapState, writeForTimeState, type ShellStorage } from '../state/workout-persistence'
import type { BlockProgress } from '../state/workout-progress'
import { AmrapBlock } from '../ui/amrap-block'
import { ForTimeBlock } from '../ui/for-time-block'
import { Heading, HeadingSection } from '../ui/Heading'
import { LadderBlock } from '../ui/ladder-block'
import { QuantitySelector } from '../ui/refinements/quantity'
import {
  TimedResultLog,
  type AmrapResult,
  type CompletionResult,
  type CompletionResultLog,
} from '../ui/refinements/timed-result-log'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import {
  GALLERY_AMRAP_ATTEMPTS,
  GALLERY_FOR_TIME_ATTEMPTS,
  GALLERY_LADDER_ATTEMPTS,
  galleryAmrapProgress,
  galleryTimedProgress,
  type GalleryAmrapAttemptSpec,
  type GalleryRaceAttemptSpec,
} from './gallery-refinement-forms-data'

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
// TASK-010 — `?state=for_time` and `?state=ladder` (C29, C30)
// ─────────────────────────────────────────────────────────────────────────────

/** One ended race: the route's own renderer over its seeded memory clock. */
function GalleryRaceAttempt({
  attempt,
  family,
  render,
}: {
  attempt: GalleryRaceAttemptSpec
  family: 'for-time' | 'ladder'
  render: (block: BlockProgress, storage: ShellStorage) => ReactNode
}) {
  const [block] = useState(() => galleryTimedProgress(attempt.block, attempt.blockIndex))
  const [storage] = useState(() => {
    const memory = memoryStorage()
    writeForTimeState(memory, block.blockId, attempt.record(Date.now()))
    return memory
  })
  return (
    <HeadingSection className="clr-stack" data-gallery-race={`${family}-${attempt.id}`}>
      <Heading className="label">{attempt.title}</Heading>
      {/* The shell's own completion path, as for the AMRAP above: nothing is ever saved. */}
      <BlockCompletionProvider sessionId={GALLERY_SESSION_ID} blocks={[block]}>
        <div data-gallery-context="workout">{render(block, storage)}</div>
      </BlockCompletionProvider>
    </HeadingSection>
  )
}

/** The accepted `for_time` state: the route's For Time, finished under the cap and run into it. */
export function GalleryForTimeResults() {
  return (
    <GalleryCoachingClients>
      <div className="clr-stack" data-gallery-for-time-results="">
        {GALLERY_FOR_TIME_ATTEMPTS.map((attempt) => (
          <GalleryRaceAttempt
            key={attempt.id}
            attempt={attempt}
            family="for-time"
            render={(block, storage) => <ForTimeBlock block={block} storage={storage} />}
          />
        ))}
      </div>
    </GalleryCoachingClients>
  )
}

/** The accepted `ladder` state: the route's ladder, finished with nothing tracked and run into its cap. */
export function GalleryLadderResults() {
  return (
    <GalleryCoachingClients>
      <div className="clr-stack" data-gallery-ladder-results="">
        {GALLERY_LADDER_ATTEMPTS.map((attempt) => (
          <GalleryRaceAttempt
            key={attempt.id}
            attempt={attempt}
            family="ladder"
            render={(block, storage) => <LadderBlock block={block} storage={storage} />}
          />
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

/** A For Time or ladder log held in memory here; its consumer owns the record and its writer (TASK-010). */
function MemoryCompletionLog({
  format,
  initial,
  saved,
}: {
  format: CompletionResultLog['format']
  initial: CompletionResult
  saved?: boolean
}) {
  const [value, setValue] = useState<CompletionResult>(initial)
  return <TimedResultLog format={format} value={value} onChange={setValue} saved={saved} />
}

/** For Time after Finish under the cap: completion starts at Complete; effort unanswered. */
export function TimedResultLogForTimeFinished() {
  return <MemoryCompletionLog format="for_time" initial={{ completed: true, effort: null }} />
}

/** A ladder whose attempt ended with nothing tracked: Incomplete, and an effort face chosen. */
export function TimedResultLogLadderIncomplete() {
  return <MemoryCompletionLog format="ladder" initial={{ completed: false, effort: 'about_right' }} />
}

/** A ladder before its attempt ended: nothing chosen, neither completion nor effort. */
export function TimedResultLogLadderUnanswered() {
  return <MemoryCompletionLog format="ladder" initial={{ completed: null, effort: null }} />
}

/** A saved result: the completion keeps the saved answer, no longer offered as a choice. */
export function TimedResultLogForTimeSaved() {
  return <MemoryCompletionLog format="for_time" initial={{ completed: false, effort: null }} saved />
}
