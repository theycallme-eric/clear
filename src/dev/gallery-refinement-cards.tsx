/**
 * `/gallery/refinements?state=cards` — the accepted movement hierarchy and
 * peer grouping (TASK-001; accepted reference eded158c…, REUSE.md), drawn by
 * the consumers the routes draw:
 *
 *   · Review: the actual `ReviewBlockRows` the `/review` route renders, over
 *     the actual `reviewBriefing` derivation, with an in-memory swap
 *     controller that never queries or writes.
 *   · Workout: the live frame's shared group header, `MovementList` and
 *     `MovementIdentity` (`BlockPanel.MovementList` / `.Movement`), fed the same readings the live loggers compute
 *     (`liveMovementReadings`). The live logging controllers stay the route's;
 *     this state does not substitute a synthetic writer for them.
 *
 * Same synthetic composition in both contexts: standard, superset and circuit
 * peers with identical prescribed data (`gallery-refinement-cards-data.ts`).
 */
import { useState, type ReactNode } from 'react'

import { Button } from '../design-system/index'
import { prescriptionText, targetText } from '../state/prescription'
import { reviewBriefing, type ReviewBlockView } from '../state/review'
import type { SessionAcceptance } from '../state/schemas'
import { ExerciseSwapContext, type ExerciseSwapApi } from '../state/swap-context'
import { structureIdentity } from '../state/workout-progress'
import { BlockPanel } from '../ui/block-renderers-frame'
import { Card } from '../ui/card'
import { Heading, HeadingSection } from '../ui/Heading'
import { MovementGroupHeader, MovementIdentity, MovementList } from '../ui/refinements/movement'
import { liveMovementReadings } from '../ui/refinements/movement-readings'
import { ReviewBlockRows } from '../ui/review-block'
import { StructureBadge } from '../ui/workout-chrome'
import {
  CIRCUIT_BLOCK,
  JOURNEY_SECTION_TITLE,
  peerGroupingAcceptance,
  STANDARD_BLOCK,
  SUPERSET_BLOCK,
  TEN_STATION_CIRCUIT_BLOCK,
} from './gallery-refinement-cards-data'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

const noop = () => {}
const NO_SUGGESTIONS = new Map()
const NO_OVERRIDES = new Map()
/** The gallery shows a known unit; the route reads the profile's. */
const GALLERY_UNIT = 'kg' as const

/** Swap opens nothing and writes nothing here; Review's real controller is the route's. */
function InertSwap({ children }: { children: ReactNode }) {
  const swap: ExerciseSwapApi = {
    openFor: null, open: noop, close: noop, options: { status: 'empty' }, retry: noop,
    choose: noop, undoTarget: () => null, undo: noop, isBusy: () => false,
  }
  return <ExerciseSwapContext value={swap}>{children}</ExerciseSwapContext>
}

function reviewBlocks(blocks: readonly Block[]): readonly ReviewBlockView[] {
  return reviewBriefing(peerGroupingAcceptance({ blocks }), GALLERY_UNIT).sections[0].blocks
}

/** The actual Review block rows for these blocks, in one section card. */
export function ReviewContextCards({ blocks = [STANDARD_BLOCK, SUPERSET_BLOCK, CIRCUIT_BLOCK] }: { blocks?: readonly Block[] }) {
  return (
    <InertSwap>
      <Card heading={JOURNEY_SECTION_TITLE}>
        <div className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
          {reviewBlocks(blocks).map((view) => (
            <ReviewBlockRows key={view.key} block={view} suggestions={NO_SUGGESTIONS} overrides={NO_OVERRIDES} onExplain={noop} />
          ))}
        </div>
      </Card>
    </InertSwap>
  )
}

const LIST_LABELS: Readonly<Record<string, string>> = {
  standard: 'Movements in this block',
  superset: 'Movements in this superset',
  circuit: 'Movements in this circuit',
}

/**
 * One live block's card: the shared group header the live `BlockPanel` draws,
 * then the frame's own movement list and movements with the live loggers'
 * readings. The completion seam stays the shell's alone, so this state draws
 * no `BlockPanel` completion and provides no completion context.
 */
function WorkoutBlock({ block }: { block: Block }) {
  const inRounds = block.structure_type === 'superset' || block.structure_type === 'circuit'
  const count = block.exercises.length
  return (
    <Card>
      <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <MovementGroupHeader
          title={<span className="clr-text-data-xs clr-text-data-xs--upper">{count} {count === 1 ? 'movement' : 'movements'}</span>}
          badge={<StructureBadge identity={structureIdentity(block)} />}
        />
        <BlockPanel.MovementList label={LIST_LABELS[block.structure_type] ?? 'Movements in this block'}>
          {block.exercises.map((prescription, position) => {
            const readings = liveMovementReadings(
              { ...prescription, equipment_used: prescription.equipment },
              GALLERY_UNIT,
              inRounds,
            )
            const circuit = block.structure_type === 'circuit'
            return (
              <BlockPanel.MovementItem key={`${prescription.exercise_id}-${position}`}>
                <BlockPanel.Movement
                  title={readings.name}
                  ordinal={block.structure_type === 'superset' ? `A${position + 1}` : circuit ? `${position + 1}.` : undefined}
                  counter={circuit ? undefined : `Set 1/${prescription.sets ?? 1}`}
                  detail={circuit ? targetText(prescription) : prescriptionText(prescription)}
                  load={readings.load}
                  context={readings.equipment}
                />
              </BlockPanel.MovementItem>
            )
          })}
        </BlockPanel.MovementList>
      </div>
    </Card>
  )
}

export function WorkoutContextCards({ blocks = [STANDARD_BLOCK, SUPERSET_BLOCK, CIRCUIT_BLOCK] }: { blocks?: readonly Block[] }) {
  return (
    <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
      {blocks.map((block, index) => <WorkoutBlock key={index} block={block} />)}
    </div>
  )
}

/** The stable `cards` state: the same peers in Review and in Workout. */
export function GalleryMovementCards() {
  const [long, setLong] = useState(false)
  const blocks = long ? [TEN_STATION_CIRCUIT_BLOCK] : [STANDARD_BLOCK, SUPERSET_BLOCK, CIRCUIT_BLOCK]
  return (
    <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }} data-gallery-cards="">
      <div>
        <Button variant="secondary" size="sm" aria-pressed={long} onClick={() => setLong((value) => !value)}>
          {long ? 'Show standard, superset and circuit' : 'Show ten long-named stations'}
        </Button>
      </div>
      <HeadingSection data-gallery-context="review" className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <Heading>Review · Swap in the action slot</Heading>
        <ReviewContextCards blocks={blocks} />
      </HeadingSection>
      <HeadingSection data-gallery-context="workout" className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <Heading>Workout · set progress in the action slot</Heading>
        <WorkoutContextCards blocks={blocks} />
      </HeadingSection>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry specimens of the shared owners
// ─────────────────────────────────────────────────────────────────────────────

export function MovementIdentityReviewSlot() {
  return (
    <MovementIdentity
      name="back squat" equipment="barbell" prescription="3 × 5 reps" load="100 kg" extra="Rest 120s"
      action={<Button variant="quiet" size="sm">Swap</Button>}
    />
  )
}

export function MovementIdentityWorkoutSlot() {
  return (
    <MovementIdentity heading name="push up" ordinal="A2" equipment="bodyweight" prescription="3 × 12 reps" counter="Set 1/3" />
  )
}

export function MovementIdentityLongName() {
  return (
    <MovementIdentity
      name="alternating dumbbell renegade row to push up and reach" ordinal="10" equipment="kettlebell"
      prescription="19 reps" load="21 kg" action={<Button variant="quiet" size="sm">Swap</Button>}
    />
  )
}

function Peers({ count }: { count: number }) {
  const names = ['kb swing', 'mountain climber', 'plank']
  return (
    <MovementList label="Movements in this circuit">
      {names.slice(0, count).map((name, index) => (
        <li key={name}><MovementIdentity name={name} ordinal={`0${index + 1}`} prescription="15 reps" /></li>
      ))}
    </MovementList>
  )
}

export function MovementListThreePeers() { return <Peers count={3} /> }
export function MovementListOnePeer() { return <Peers count={1} /> }

const CIRCUIT_IDENTITY = structureIdentity({ structure_type: 'circuit', rounds: 2, timer_seconds: null, rep_scheme: 'fixed' })

export function MovementGroupHeaderLabelled() {
  return <MovementGroupHeader title={<span className="clr-text-data-xs clr-text-data-xs--upper">3 movements</span>} badge={<StructureBadge identity={CIRCUIT_IDENTITY} />} />
}

export function MovementGroupHeaderBadgeOnly() {
  return <MovementGroupHeader badge={<StructureBadge identity={CIRCUIT_IDENTITY} />} />
}

export function ReviewBlockStandard() { return <ReviewContextCards blocks={[STANDARD_BLOCK]} /> }
export function ReviewBlockSuperset() { return <ReviewContextCards blocks={[SUPERSET_BLOCK]} /> }
export function ReviewBlockCircuit() { return <ReviewContextCards blocks={[CIRCUIT_BLOCK]} /> }
