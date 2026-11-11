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
 * closed on the routes by TASK-041), the ladder's quiet Undo (TASK-014: the
 * route's ladder offers it only after an athlete's Finish, which neither
 * attempt here has — an older build's finished clock and a reached cap are
 * never undone; it is drawn in `ladder-4` / `ladder-12`; its rep-first tiles
 * and live check-off are TASK-013's, drawn there and here), per-movement next-round
 * actuals and loads (the EMOM's applicable weights among them) and the
 * categorical effort's wider adoption (TASK-046, TASK-047), new notes
 * behaviour (TASK-045, TASK-046) and the other logging contexts.
 *
 * TASK-015 (C37; AC-C37-01, AC-R015-01, AC-R015-02): `?state=amrap`,
 * `?state=for_time` and `?state=ladder` now also show the per-movement
 * partial and load entries, because the route's own blocks draw them: the
 * AMRAP finished early (3 rounds) asks each movement's round-4 amount and the
 * kettlebell swing's load, with one entry seeded in its memory record; the
 * AMRAP run into its cap with nothing entered asks only the load, because no
 * rounds count is recorded; the For Time run into its cap (Incomplete) asks
 * each movement's round-1 amount and the wall ball's load, one entry seeded;
 * the one finished under the cap (Complete) asks loads only; the ladders ask
 * the round after a stated rung once one is stated, bounded by that rung's
 * target. Every timed state now runs under the shell's set-logging context
 * too (as the EMOM did), so a load is stated in the gallery's known unit as
 * the route states the profile's. Memory only: typing changes the gallery's
 * copy; nothing is saved.
 *
 * TASK-018 (C44, C57, C58, C59; P01, P02, P03): `?state=ladder-long` is the
 * accepted long dialog's viewport, outline and scrollbar contract — the shared
 * `LoggingOverlay` (`refinements/logging-overlay.tsx`, created by this task)
 * holding the twelve-round ladder's `TimedResultLog` over the register's
 * memory controller. It is a provider reference, not a route: the route's
 * ladder keeps its log inline in its card (`?state=ladder`, unchanged) until
 * TASK-046 moves the timed families into the frame, and TASK-041 closes the
 * geometry on the routes. The selected header and backdrop are TASK-016's.
 * No Save, no writer, nothing leaves memory.
 *
 * TASK-016 (C40, C41, C43; R104–R106, R110, R113, R127): the same frame now
 * draws the selected dialog — the A / Balanced backdrop, the dialog's title
 * as the held log's one title (the log's own "Log results" heading is
 * dropped inside it), and the framed icon-only X, named "Close log", on the
 * title's visible top. `?state=ladder-long` shows it with a title that wraps
 * on a phone. The register adds a Workout feedback specimen (the owner's
 * wrapped-title example, R106): the shared `FeelingRow` and notes field in
 * memory, no writer — the Summary's debrief moves into the dialog with
 * TASK-045, and `?state=anchor` / `?state=superset` arrive with their
 * route consumers (TASK-043, TASK-044).
 *
 * TASK-017 (C05, C42, C47; R108, R109, R111, R112): no new state and no
 * gallery-only form. The shared logging rhythm reaches the states above
 * through the route's own blocks: `?state=for_time` (and `amrap`, `ladder`,
 * `ladder-long`) shows the capped race's two movement groups slightly further
 * apart than the log's other sections, Work completed and Effort at the
 * label gap, and the ladder's count at its count gap after the tiles. The
 * superset round's helper paragraph is removed in the route's own
 * `SupersetRoundSheet`; `?state=superset` is still TASK-044's to add with
 * that consumer, where it will show the same groups.
 *
 * TASK-046 (REQ-019, C45; G07; R43, R100): the four timed-result families
 * now log in the shared focused dialog, through the route's own blocks, so
 * `?state=emom`, `?state=amrap`, `?state=for_time` and `?state=ladder` show
 * the actual adoption with no change here: each ended attempt's card holds
 * one "Log results" action where its log was (the ladder's, secondary before
 * its attempt ends), and the same log — every field, starting point, entry
 * and effort above — opens in `LoggingOverlay` titled "Log results", closed
 * by its framed X or Escape with every entry kept for the reopen. The
 * dialog's owner is `refinements/timed-result-dialog.tsx`; the register's
 * `TimedResultDialog` specimens below hold it over memory. Still memory only:
 * no Save is drawn and nothing is written (the route saves through the
 * section's forward action). Where the notes above say the route's logs are
 * inline in their cards, that was true until this task.
 */
import { useState, type ReactNode } from 'react'

import { partialRoundFor } from '../data/refinement-logging-rules'
import { Button, Input } from '../design-system/index'
import { BlockCompletionProvider } from '../state/block-completion-provider'
import { ladderRungs, ladderUnit } from '../state/ladder'
import { ladderPartialRound } from '../state/ladder-recovery'
import type { SessionAcceptance } from '../state/schemas'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { writeAmrapState, writeEmomState, writeForTimeState, type ShellStorage } from '../state/workout-persistence'
import type { BlockProgress } from '../state/workout-progress'
import { AmrapBlock } from '../ui/amrap-block'
import { EmomBlock } from '../ui/emom-block'
import { FeelingRow } from '../ui/feeling-row'
import { ForTimeBlock } from '../ui/for-time-block'
import { Heading, HeadingSection } from '../ui/Heading'
import { LadderBlock } from '../ui/ladder-block'
import { LoggingOverlay } from '../ui/refinements/logging-overlay'
import { QuantitySelector } from '../ui/refinements/quantity'
import {
  TimedResultLog,
  type AmrapResult,
  type CompletionResult,
  type CompletionResultLog,
  type EmomResult,
  type MovementEntryLog,
} from '../ui/refinements/timed-result-log'
import { TimedResultDialog } from '../ui/refinements/timed-result-dialog'
import { SectionLabelContext } from '../ui/section-label-context'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import { AMRAP_BLOCK } from './gallery-refinement-cards-data'
import { galleryLadderProgress, type LadderRoundCount } from './gallery-refinement-flow-data'
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

/** The gallery's known unit; the route reads the profile's. */
const GALLERY_WEIGHT_UNIT = 'kg' as const

const noop = () => {}

/**
 * The shell around one gallery timed block, as the route draws it: the shell's
 * own completion path (the block reports to it; with no forward action here
 * nothing is saved, and the block-result writer refuses in any case) and its
 * set-logging context, which carries the unit a prescribed load is stated in
 * and, since TASK-015, the unit a typed actual load is stated in. Memory only:
 * no queue storage, and a timed block logs no set.
 */
function GalleryTimedShell({ block, children }: { block: BlockProgress; children: ReactNode }) {
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

/** One ended attempt: the route's AMRAP over its own seeded memory record. */
function GalleryAmrapAttempt({ attempt }: { attempt: GalleryAmrapAttemptSpec }) {
  const [block] = useState(() => galleryAmrapProgress(attempt.block, attempt.blockIndex))
  const [storage] = useState(() => {
    const memory = memoryStorage()
    writeAmrapState(memory, block.blockId, attempt.record(Date.now(), block))
    return memory
  })
  return (
    <HeadingSection className="clr-stack" data-gallery-amrap={attempt.id}>
      <Heading className="label">{attempt.title}</Heading>
      <GalleryTimedShell block={block}>
        <div data-gallery-context="workout">
          <AmrapBlock block={block} storage={storage} conditioningHistory={null} />
        </div>
      </GalleryTimedShell>
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
    writeForTimeState(memory, block.blockId, attempt.record(Date.now(), block))
    return memory
  })
  return (
    <HeadingSection className="clr-stack" data-gallery-race={`${family}-${attempt.id}`}>
      <Heading className="label">{attempt.title}</Heading>
      {/* The shell's own completion path and unit, as for the AMRAP above: nothing is ever saved. */}
      <GalleryTimedShell block={block}>
        <div data-gallery-context="workout">{render(block, storage)}</div>
      </GalleryTimedShell>
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
      <GalleryTimedShell block={block}>
        <div data-gallery-context="workout">
          <EmomBlock block={block} storage={storage} />
        </div>
      </GalleryTimedShell>
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
    <GalleryTimedShell block={progress}>
      <SectionLabelContext value={sectionLabel}>
        <EmomBlock block={progress} storage={storage} />
      </SectionLabelContext>
    </GalleryTimedShell>
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

/**
 * TASK-015 (C37): the AMRAP's per-movement entries held in memory here, over
 * the route fixture's two-movement AMRAP — a loaded kettlebell swing and a
 * bodyweight burpee. The round the amounts belong to follows the rounds count
 * (`partialRoundFor`); the typed values are examples, unlike the plan's.
 */
function MemoryAmrapMovementsLog() {
  const [block] = useState(() => galleryAmrapProgress(AMRAP_BLOCK, 62))
  const [value, setValue] = useState<AmrapResult>({ roundsCompleted: 3, partialRoundReps: 5 })
  const [entries, setEntries] = useState<MovementEntryLog['values']>(() => ({
    [block.exercises[0].exerciseId]: { amount: '7', weight: '20' },
  }))
  const partialRound = partialRoundFor({ family: 'amrap', outcome: { ...(value.roundsCompleted === null ? {} : { roundsCompleted: value.roundsCompleted }) } })
  return (
    <TimedResultLog
      format="amrap"
      value={value}
      onChange={setValue}
      movements={{
        exercises: block.exercises,
        partialRound,
        weightUnit: GALLERY_WEIGHT_UNIT,
        values: entries,
        onChange: (exerciseId, next) => setEntries((current) => ({ ...current, [exerciseId]: next })),
      }}
    />
  )
}

/** Three rounds recorded: each movement's round-4 amount, the swing's load, the partial round kept beside them. */
export function TimedResultLogAmrapMovements() {
  return <MemoryAmrapMovementsLog />
}

/** A For Time or ladder log held in memory here; its consumer owns the record and its writer (TASK-010). */
function MemoryCompletionLog({
  format,
  initial,
  saved,
  through,
  movements,
  ladderRounds = 4,
}: {
  format: CompletionResultLog['format']
  initial: CompletionResult
  saved?: boolean
  /** TASK-015: a ladder's stated prefix, so the round after it is asked. */
  through?: number
  /** TASK-015: entries already typed, by the gallery ladder's exercise ids' index. */
  movements?: MovementEntryLog['values']
  /** TASK-018: the gallery ladder's length; the long ladder's log is the twelve-round one. */
  ladderRounds?: LadderRoundCount
}) {
  const [value, setValue] = useState<CompletionResult>(initial)
  // TASK-013: a ladder's log draws its rounds completed once answered — here
  // over the accepted four-rung ladder (or TASK-018's twelve), the prefix held in memory.
  const [block] = useState(() => galleryLadderProgress(ladderRounds))
  const [completedThrough, setCompletedThrough] = useState<number | null>(through ?? null)
  // TASK-015: the ladder's per-movement entries for the round after the prefix, held in memory.
  const [entries, setEntries] = useState<MovementEntryLog['values']>(() => movements ?? {})
  const rungs = ladderRungs(block.exercises)
  const shown = value.completed === true ? rungs.length : completedThrough
  const partialRound = value.completed === false ? ladderPartialRound(shown, rungs.length) : null
  const rounds =
    format !== 'ladder' || value.completed === null
      ? null
      : {
          rungs,
          unit: ladderUnit(block.exercises),
          completedThrough: shown,
          partialRound,
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
      movements={
        format !== 'ladder' || value.completed === null
          ? null
          : {
              exercises: block.exercises,
              partialRound,
              weightUnit: GALLERY_WEIGHT_UNIT,
              values: entries,
              onChange: (exerciseId, next) => setEntries((current) => ({ ...current, [exerciseId]: next })),
            }
      }
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

/**
 * TASK-015 (C37): a ladder Incomplete through round 2, so the log asks each
 * movement's completed amount for round 3 — bounded by that rung's target,
 * never filled from it — the push up's entered.
 */
export function TimedResultLogLadderPartial() {
  const [block] = useState(() => galleryLadderProgress(4))
  return (
    <MemoryCompletionLog
      format="ladder"
      initial={{ completed: false, effort: null }}
      through={2}
      movements={{ [block.exercises[0].exerciseId]: { amount: '3', weight: '' } }}
    />
  )
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

// ─────────────────────────────────────────────────────────────────────────────
// TASK-018 — `?state=ladder-long` and the LoggingOverlay specimens (C44, C57–C59)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The shared focused frame around one memory-held log: closed until its
 * opener is pressed, so a page of specimens never opens a modal by itself,
 * and reopened as often as asked. Nothing is saved: the log inside is the
 * register's memory controller, with no Save and no writer.
 */
function MemoryLoggingOverlay({ opener, title, children }: { opener: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="clr-stack" data-logging-overlay-example="">
      <div>
        <Button onClick={() => setOpen(true)}>{opener}</Button>
      </div>
      <LoggingOverlay open={open} title={title} onClose={() => setOpen(false)}>
        {children}
      </LoggingOverlay>
    </div>
  )
}

/**
 * The long ladder's log: the shared `TimedResultLog` over the gallery's
 * twelve-round ladder, Incomplete through round 7 — its twelve rep-first
 * tiles, each movement's round-8 amount (one typed) and the effort faces —
 * long enough on any phone to scroll inside the frame.
 */
function LongLadderLog() {
  const [block] = useState(() => galleryLadderProgress(12))
  return (
    <MemoryCompletionLog
      format="ladder"
      ladderRounds={12}
      initial={{ completed: false, effort: null }}
      through={7}
      movements={{ [block.exercises[0].exerciseId]: { amount: '5', weight: '' } }}
    />
  )
}

/**
 * The accepted `ladder-long` state (TASK-018: C44, C57, C58, C59; P01–P03):
 * the shared `LoggingOverlay` holding the long ladder's log, the final long
 * dialog viewport, outline and scrollbar contract. One stationary frame; only
 * the inside scrolls, to the inner lower border, with no scrollbar and no
 * outline around the frame on open or reopen. The route's ladder still logs
 * inline in its card until TASK-046 moves it into this frame (`?state=ladder`).
 */
export function GalleryLadderLongResults() {
  return (
    <div className="clr-stack" data-gallery-ladder-long="">
      <MemoryLoggingOverlay opener="Open long ladder results" title="Ladder · 12 rounds">
        <LongLadderLog />
      </MemoryLoggingOverlay>
    </div>
  )
}

/** A long form: the twelve-round ladder's log, scrolling inside the frame. */
export function LoggingOverlayLongLadder() {
  return (
    <MemoryLoggingOverlay opener="Open the long ladder log" title="Ladder · 12 rounds">
      <LongLadderLog />
    </MemoryLoggingOverlay>
  )
}

/** A short form: the EMOM's end log, as tall as its content, with no scrolling. */
export function LoggingOverlayShortEmom() {
  return (
    <MemoryLoggingOverlay opener="Open the EMOM log" title="EMOM · 10 minutes">
      <MemoryEmomLog initial={{ notes: '' }} />
    </MemoryLoggingOverlay>
  )
}

/**
 * TASK-016 (C41; R105, R106): the owner's wrapped-title example — the
 * Workout feedback dialog. The header's X stays on the title's first line
 * as the title wraps on a phone. The shared `FeelingRow` and notes field are
 * held in memory here: no Save, no writer. The Summary's own debrief adopts
 * the dialog with TASK-045.
 */
export function LoggingOverlayWorkoutFeedback() {
  const [mood, setMood] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  return (
    <MemoryLoggingOverlay opener="Open workout feedback" title="Workout feedback">
      <div className="clr-stack">
        <FeelingRow value={mood} onChange={setMood} />
        <Input label="Notes · optional" multiline rows={3} value={notes} onChange={setNotes} />
      </div>
    </MemoryLoggingOverlay>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-046 — the timed families' entry into the focused dialog (C45)
// ─────────────────────────────────────────────────────────────────────────────

/** The EMOM's end log behind its "Log results" action; the note held in memory. */
export function TimedResultDialogEmom() {
  const [value, setValue] = useState<EmomResult>({ notes: '' })
  return <TimedResultDialog format="emom" value={value} onChange={setValue} />
}

/** The AMRAP's log behind its action: three rounds and an observed zero, in memory. */
export function TimedResultDialogAmrap() {
  const [value, setValue] = useState<AmrapResult>({ roundsCompleted: 3, partialRoundReps: 0 })
  return <TimedResultDialog format="amrap" value={value} onChange={setValue} />
}

/** A For Time log before an answer, behind the secondary action a log drawn before its attempt ends takes. */
export function TimedResultDialogForTimeSecondary() {
  const [value, setValue] = useState<CompletionResult>({ completed: null, effort: null })
  return <TimedResultDialog format="for_time" openerVariant="secondary" value={value} onChange={setValue} />
}
