/**
 * `/gallery/refinements?state=ladder-4` and `?state=ladder-12` — the live
 * ladder's Start/Pause/Resume/Finish hierarchy (TASK-006: C17, C18, G05; R66,
 * R67, R68), drawn by the consumer the `/workout` route draws.
 *
 * Deliberate consolidation of the accepted reference's `GalleryLadderFlow`
 * (eded158c…, `src/dev/gallery-refinement-flow.tsx`). The reference drew a
 * synthetic card around its own memory-only controller: a timer, Start ladder,
 * a secondary Pause beside a primary Finish, the compact prescription with live
 * check-off, and the result log with quiet Undo. Here the state renders the
 * route's actual `LadderBlock` — its own clock (EXE-04b's For Time state),
 * its shared `TimedWorkoutActions` in the ladder's top slot and its real round
 * list — over the accepted composition (`gallery-refinement-flow-data.ts`).
 *
 * Memory only. The clock is stored in an in-memory `ShellStorage` for this
 * mount; the block reports to the shell's own `BlockCompletionProvider`, which
 * saves only on a section's forward action — absent here — through the
 * gallery's refusing block-result client; and the Coaching and notes
 * disclosure reads and writes the gallery's in-memory library
 * (`GalleryCoachingClients`). Nothing reaches the network or the route's
 * storage, and no performed work is written anywhere.
 *
 * Not composed here, and owned by later tasks: the reference's compact
 * rep-first prescription and live check-off (`refinements/ladder.tsx`, TASK-012
 * and TASK-013), the result log and quiet Undo (TASK-013, TASK-014, TASK-046),
 * the whole-timer frame (TASK-007) and the urgency state (TASK-008).
 */
import { useState } from 'react'

import { Button } from '../design-system/index'
import { BlockCompletionProvider } from '../state/block-completion-provider'
import { finishLabel, type TimedLifecyclePhase } from '../state/timed-lifecycle'
import type { ShellStorage } from '../state/workout-persistence'
import { LadderBlock } from '../ui/ladder-block'
import { TimedWorkoutActions } from '../ui/timed-workout-flow'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import { galleryLadderProgress, type LadderRoundCount } from './gallery-refinement-flow-data'

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
