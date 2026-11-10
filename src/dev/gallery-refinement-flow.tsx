/**
 * `/gallery/refinements?state=ladder-4` and `?state=ladder-12` — the live
 * ladder's Start/Pause/Resume/Finish hierarchy (TASK-006: C17, C18, G05; R66,
 * R67, R68), its compact truthful prescription (TASK-012: C35; R70, R71,
 * R72, R94, R95, R117) and its rep-first ordered live progress and result
 * handoff (TASK-013: C33, C34, C36; R77, R88, R89, R92, R93, R99, R118, R124),
 * drawn by the consumer the `/workout` route draws.
 *
 * Deliberate consolidation of the accepted reference's `GalleryLadderFlow`
 * (eded158c…, `src/dev/gallery-refinement-flow.tsx`). The reference drew a
 * synthetic card around its own memory-only controller: a timer, Start ladder,
 * a secondary Pause beside a primary Finish, the compact prescription with live
 * check-off, and the result log with quiet Undo. Here the state renders the
 * route's actual `LadderBlock` — its own clock (EXE-04b's For Time state),
 * its shared `TimedWorkoutActions` in the ladder's top slot and, since
 * TASK-012, the shared `LadderPrescription` (`refinements/ladder.tsx`): one
 * concise line per movement, then every round as a wrapping tile with the fixed
 * burpee in each — over the accepted composition
 * (`gallery-refinement-flow-data.ts`), read from its data like any route
 * ladder's. Since TASK-013 the same route block, once started, makes those
 * tiles its live ordered check-off with the completion count, and Finish or
 * the cap imports the checked prefix into its result log as the rep-first
 * `LadderCompletion` tiles — the reference's `completedThrough` / `onProgress`
 * and `LadderCompletion`, adopted by the actual consumer, its attempt kept by
 * TASK-032's durable owner (`usePersistedLadder`) over this mount's memory.
 *
 * Memory only. The ladder's attempt — its clock, checked progress and draft —
 * is stored in an in-memory `ShellStorage` for this mount; the block reports to the shell's own `BlockCompletionProvider`, which
 * saves only on a section's forward action — absent here — through the
 * gallery's refusing block-result client; and the Coaching and notes
 * disclosure reads and writes the gallery's in-memory library
 * (`GalleryCoachingClients`). Nothing reaches the network or the route's
 * storage, and no performed work is written anywhere.
 *
 * Not composed here, and owned by later tasks: the reference's quiet Undo
 * (TASK-014), its focused logging dialog, Save and per-movement next-round
 * entries (TASK-015, TASK-046). The whole-timer frame (TASK-007) and the
 * warning (TASK-008) are the route's own here.
 */
import { useState } from 'react'

import { Button } from '../design-system/index'
import { BlockCompletionProvider } from '../state/block-completion-provider'
import { ladderRoundReadings, ladderRungs, ladderUnit } from '../state/ladder'
import { ladderPartialRound } from '../state/ladder-recovery'
import { finishLabel, type TimedLifecyclePhase } from '../state/timed-lifecycle'
import type { ShellStorage } from '../state/workout-persistence'
import { LadderBlock } from '../ui/ladder-block'
import { LadderCompletion, LadderPrescription, LadderRounds } from '../ui/refinements/ladder'
import { TimedWorkoutActions } from '../ui/timed-workout-flow'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import {
  galleryBlockProgress,
  galleryLadderProgress,
  loadedLadderBlock,
  timedLadderBlock,
  type LadderRoundCount,
} from './gallery-refinement-flow-data'

/** One mount's storage, so the gallery never reads or writes the route's records. */
function memoryStorage(): ShellStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

/** A session id the gallery's block reports under; nothing is ever written for it. */
const GALLERY_SESSION_ID = '00000000-0000-4000-8000-000000006000'

/** The accepted live ladder, four or twelve rounds, as the route performs it. */
export function GalleryLadderFlow({ rounds }: { rounds: LadderRoundCount }) {
  const [storage] = useState(memoryStorage)
  const [block] = useState(() => galleryLadderProgress(rounds))
  return (
    <GalleryCoachingClients>
      {/*
        The shell's own completion path, over the gallery's clients: the block
        reports what it observed to it, and with no forward action here nothing
        is ever saved — the block-result writer refuses in any case.
      */}
      <BlockCompletionProvider sessionId={GALLERY_SESSION_ID} blocks={[block]}>
        <div data-gallery-context="workout">
          <LadderBlock block={block} storage={storage} />
        </div>
      </BlockCompletionProvider>
    </GalleryCoachingClients>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Register specimens: the shared action slot alone (TASK-006)
// ─────────────────────────────────────────────────────────────────────────────

const noop = () => {}

/** Ready: one primary Start, filling the row. */
export function TimedActionsReady() {
  return <TimedWorkoutActions phase="ready" startLabel="Start EMOM" finishLabel={finishLabel('emom', true)} onStart={noop} />
}

/** Running: the secondary Pause beside the format's primary Finish early. */
export function TimedActionsRunning() {
  return (
    <TimedWorkoutActions phase="running" startLabel="Start AMRAP" finishLabel={finishLabel('amrap', true)}
      onStart={noop} onPause={noop} onResume={noop} onFinish={noop} />
  )
}

/** Paused: Resume in Pause's place, beside the race's primary Finish. */
export function TimedActionsPaused() {
  return (
    <TimedWorkoutActions phase="paused" startLabel="Start For Time" finishLabel={finishLabel('for_time', true)}
      onStart={noop} onPause={noop} onResume={noop} onFinish={noop} />
  )
}

/**
 * The whole lifecycle, by hand: Start, Pause, Resume and Finish move a phase
 * held in memory here — no clock and no record; each format's own controller
 * owns both on the route.
 */
export function TimedActionsLifecycle() {
  const [phase, setPhase] = useState<TimedLifecyclePhase>('ready')
  return (
    <div className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
      <p className="clr-text-data-xs clr-text-data-xs--upper" role="status">{phase}</p>
      <TimedWorkoutActions
        placement="top"
        phase={phase}
        startLabel="Start ladder"
        finishLabel={finishLabel('ladder', true)}
        onStart={() => setPhase('running')}
        onPause={() => setPhase('paused')}
        onResume={() => setPhase('running')}
        onFinish={() => setPhase('ended')}
      />
      {phase === 'ended' && <Button variant="quiet" size="sm" onClick={() => setPhase('ready')}>Show again</Button>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Register specimens: the compact prescription alone (TASK-012)
// ─────────────────────────────────────────────────────────────────────────────

/** The accepted four-round ladder: push up 2 → 8 and the fixed burpee, as the live card states it. */
export function LadderPrescriptionFour() {
  const [block] = useState(() => galleryLadderProgress(4))
  return <LadderPrescription exercises={block.exercises} rounds={block.ladderTiming?.rounds ?? null} weightUnit="kg" />
}

/** The accepted twelve-round ladder, wrapping into rows of tiles. */
export function LadderPrescriptionTwelve() {
  const [block] = useState(() => galleryLadderProgress(12))
  return <LadderPrescription exercises={block.exercises} rounds={block.ladderTiming?.rounds ?? null} weightUnit="kg" />
}

/** A loaded, descending ladder with a distance companion: every reading is its own data. */
export function LadderPrescriptionLoaded() {
  const [block] = useState(() => galleryBlockProgress(loadedLadderBlock(), 60))
  return <LadderPrescription exercises={block.exercises} rounds={block.ladderTiming?.rounds ?? null} weightUnit="kg" />
}

/** Review's reading: the planned rounds from the composed prescriptions, read-only. */
export function LadderRoundsReview() {
  const block = timedLadderBlock(4)
  return <LadderRounds rounds={ladderRoundReadings(block.exercises.map((exercise) => ({ prescription: exercise })), 4)} />
}

/** A schedule's tiles: each start, and the live round marked Now (memory only, no clock). */
export function LadderRoundsScheduled() {
  const block = timedLadderBlock(4)
  const start = (round: number) => `Starts at 0${round - 1}:00`
  return (
    <LadderRounds
      rounds={ladderRoundReadings(block.exercises.map((exercise) => ({ prescription: exercise })), 4)}
      roundContext={(round) => ({ marker: round === 2 ? 'now' : null, detail: start(round) })}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Register specimens: ordered progress and the rep-first result tiles (TASK-013)
// ─────────────────────────────────────────────────────────────────────────────

/** The live check-off over the accepted twelve rounds, tapped in memory here; the route's is the attempt's. */
export function LadderPrescriptionTracking() {
  const [block] = useState(() => galleryLadderProgress(12))
  const [completedThrough, setCompletedThrough] = useState<number | null>(5)
  const rounds = ladderRungs(block.exercises).length
  return (
    <LadderPrescription
      exercises={block.exercises}
      rounds={block.ladderTiming?.rounds ?? null}
      weightUnit="kg"
      progress={{ completedThrough, rounds, onProgress: setCompletedThrough }}
    />
  )
}

/** The rep-first result tiles over a gallery ladder, the prefix held in memory here. */
function MemoryLadderCompletion({ rounds, initial }: { rounds: LadderRoundCount; initial: number | null }) {
  const [block] = useState(() => galleryLadderProgress(rounds))
  const [completedThrough, setCompletedThrough] = useState<number | null>(initial)
  const rungs = ladderRungs(block.exercises)
  return (
    <LadderCompletion
      rungs={rungs}
      unit={ladderUnit(block.exercises)}
      completedThrough={completedThrough}
      partialRound={completedThrough === rungs.length ? null : ladderPartialRound(completedThrough, rungs.length)}
      onChange={setCompletedThrough}
    />
  )
}

/** Four rungs, two completed: the prefix pressed, the count, and round 3 named for any partial. */
export function LadderCompletionFour() {
  return <MemoryLadderCompletion rounds={4} initial={2} />
}

/** Twelve rungs, every one completed: one- and two-digit targets level across wrapping rows. */
export function LadderCompletionTwelve() {
  return <MemoryLadderCompletion rounds={12} initial={12} />
}

/** Nothing stated yet: no tile pressed, and the count says so rather than reading zero. */
export function LadderCompletionUnstated() {
  return <MemoryLadderCompletion rounds={12} initial={null} />
}
