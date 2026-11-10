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
 * nothing was tracked), then the existing three effort faces, unanswered.
 * Since TASK-013 the ladder's log also draws its rep-first "Rounds completed"
 * tiles under the answer, nothing stated (its clocks were seeded as an older
 * build kept them, under the For Time key, which the route's ladder adopts
 * once into its own durable attempt). The reference's synthetic draft,
 * Save/retry, Undo and overlay are not copied.
 *
 * `?state=emom` (TASK-011: C31, C32; R40, R43, R84) is the same
 * consolidation of the reference's `emom` logging moment: the route's actual
 * `EmomBlock`, ended twice over memory-only storage — every prescribed minute
 * run (COMPLETE), and ended early in minute 4 of 8 (FINISHED EARLY, its actual
 * stop stated) — so the shared `TimedResultLog` shows its EMOM family: no
 * minutes-completed counter, no completion question, only the optional notes
 * for an exception. Typing a note reports it to the shell's own completion
 * path, which saves nothing here. The same file supplies the `cards` state's
 * live EMOM (`GalleryLiveEmom`): the route's own block, ready, with its minute,
 * minute assignment and Next marker and no NOT STARTED caption. Both run under
 * the shell's own completion and set-logging providers — the latter only so
 * the prescribed load reads in the gallery's known unit, as the route reads
 * the profile's; an EMOM logs no set.
 *
 * Not composed here, and owned by later tasks: the focused logging dialog,
 * its header, backdrop and contained scrolling (`refinements/logging-overlay.tsx`:
 * TASK-016, TASK-017, TASK-018, adopted for the timed families by TASK-046 and
 * closed on the routes by TASK-041), the ladder's quiet Undo (TASK-014; its
 * rep-first tiles and live check-off are TASK-013's, drawn by the route's own
 * ladder in `ladder-4` / `ladder-12` and here), per-movement next-round
 * actuals and loads (the EMOM's applicable weights among them) and the
 * categorical effort's writer (TASK-015, TASK-031, TASK-047), new notes
 * behaviour (TASK-015, TASK-045) and the other logging contexts.
 */
import { useState, type ReactNode } from 'react'

import { BlockCompletionProvider } from '../state/block-completion-provider'
import { ladderRungs, ladderUnit } from '../state/ladder'
import { ladderPartialRound } from '../state/ladder-recovery'
import type { SessionAcceptance } from '../state/schemas'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { writeAmrapState, writeEmomState, writeForTimeState, type ShellStorage } from '../state/workout-persistence'
import type { BlockProgress } from '../state/workout-progress'
import { AmrapBlock } from '../ui/amrap-block'
import { EmomBlock } from '../ui/emom-block'
import { ForTimeBlock } from '../ui/for-time-block'
import { Heading, HeadingSection } from '../ui/Heading'
import { LadderBlock } from '../ui/ladder-block'
import { QuantitySelector } from '../ui/refinements/quantity'
import {
  TimedResultLog,
  type AmrapResult,
  type CompletionResult,
  type CompletionResultLog,
  type EmomResult,
} from '../ui/refinements/timed-result-log'
import { SectionLabelContext } from '../ui/section-label-context'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import { galleryLadderProgress } from './gallery-refinement-flow-data'
import {
  GALLERY_AMRAP_ATTEMPTS,
  GALLERY_EMOM_ATTEMPTS,
  GALLERY_FOR_TIME_ATTEMPTS,
  GALLERY_LADDER_ATTEMPTS,
  galleryAmrapProgress,
  galleryTimedProgress,
  type GalleryAmrapAttemptSpec,
  type GalleryEmomAttemptSpec,
  type GalleryRaceAttemptSpec,
} from './gallery-refinement-forms-data'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

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
// TASK-011 — `?state=emom` and the `cards` state's live EMOM (C31, C32)
// ─────────────────────────────────────────────────────────────────────────────

/** The gallery's known unit; the route reads the profile's. */
const GALLERY_WEIGHT_UNIT = 'kg' as const

const noop = () => {}

/**
 * The shell around one gallery EMOM, as the route draws it: the shell's own
 * completion path (the block reports to it; with no forward action here
 * nothing is saved, and the block-result writer refuses in any case) and its
 * set-logging context, which carries the unit a prescribed load is stated in.
 * Memory only: no queue storage, and an EMOM logs no set.
 */
function GalleryEmomShell({ block, children }: { block: BlockProgress; children: ReactNode }) {
  return (
    <BlockCompletionProvider sessionId={GALLERY_SESSION_ID} blocks={[block]}>
      <SetLoggingProvider
        sessionId={GALLERY_SESSION_ID}
        exercises={block.exercises}
        weightUnit={GALLERY_WEIGHT_UNIT}
        storage={null}
        onFailure={noop}
      >
        {children}
      </SetLoggingProvider>
    </BlockCompletionProvider>
  )
}

/** One ended EMOM: the route's own renderer over its seeded memory grid. */
function GalleryEmomAttempt({ attempt }: { attempt: GalleryEmomAttemptSpec }) {
  const [block] = useState(() => galleryTimedProgress(attempt.block, attempt.blockIndex))
  const [storage] = useState(() => {
    const memory = memoryStorage()
    writeEmomState(memory, block.blockId, attempt.record(Date.now()))
    return memory
  })
  return (
    <HeadingSection className="clr-stack" data-gallery-emom={attempt.id}>
      <Heading className="label">{attempt.title}</Heading>
      <GalleryEmomShell block={block}>
        <div data-gallery-context="workout">
          <EmomBlock block={block} storage={storage} />
        </div>
      </GalleryEmomShell>
    </HeadingSection>
  )
}

/** The accepted `emom` state: the route's EMOM, every minute run and ended early. */
export function GalleryEmomResults() {
  return (
    <GalleryCoachingClients>
      <div className="clr-stack" data-gallery-emom-results="">
        {GALLERY_EMOM_ATTEMPTS.map((attempt) => (
          <GalleryEmomAttempt key={attempt.id} attempt={attempt} />
        ))}
      </div>
    </GalleryCoachingClients>
  )
}

/**
 * The `cards` state's live EMOM: the route's own `EmomBlock`, ready, over
 * memory-only storage and under the section label the live shell provides —
 * the minute ahead (`MIN 1 OF 10`), each movement's minutes and target, Next
 * on the first, and Start (C32: no NOT STARTED caption). Its ids are the same
 * gallery ids the other live cards use, so its coaching reads the same
 * in-memory library. Rendered inside the cards state's `GalleryCoachingClients`.
 */
export function GalleryLiveEmom({ block, blockIndex, sectionLabel }: { block: Block; blockIndex: number; sectionLabel: string }) {
  const [progress] = useState(() => galleryTimedProgress(block, blockIndex))
  const [storage] = useState(memoryStorage)
  return (
    <GalleryEmomShell block={progress}>
      <SectionLabelContext value={sectionLabel}>
        <EmomBlock block={progress} storage={storage} />
      </SectionLabelContext>
    </GalleryEmomShell>
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
  // TASK-013: a ladder's log draws its rounds completed once answered — here
  // over the accepted four-rung ladder, the prefix held in memory.
  const [block] = useState(() => galleryLadderProgress(4))
  const [completedThrough, setCompletedThrough] = useState<number | null>(null)
  const rungs = ladderRungs(block.exercises)
  const shown = value.completed === true ? rungs.length : completedThrough
  const rounds =
    format !== 'ladder' || value.completed === null
      ? null
      : {
          rungs,
          unit: ladderUnit(block.exercises),
          completedThrough: shown,
          partialRound: value.completed ? null : ladderPartialRound(shown, rungs.length),
          onChange: (through: number) => {
            setCompletedThrough(through)
            setValue({ ...value, completed: through === rungs.length })
          },
        }
  return (
    <TimedResultLog
      format={format}
      value={value}
      saved={saved}
      rounds={rounds}
      onChange={(next) => {
        if (next.completed === false && value.completed !== false) setCompletedThrough(null)
        setValue(next)
      }}
    />
  )
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

/** An EMOM end log held in memory here; its consumer owns the note and its writer (TASK-011). */
function MemoryEmomLog({ initial }: { initial: EmomResult }) {
  const [value, setValue] = useState<EmomResult>(initial)
  return <TimedResultLog format="emom" value={value} onChange={setValue} />
}

/** The EMOM's end log: no counter and no completion question, the notes blank. */
export function TimedResultLogEmomBlank() {
  return <MemoryEmomLog initial={{ notes: '' }} />
}

/** The EMOM's end log with an exception written in the notes. */
export function TimedResultLogEmomNoted() {
  return <MemoryEmomLog initial={{ notes: 'Dropped to 10 swings from minute 7.' }} />
}
