/**
 * `/gallery/refinements?state=cards` — the accepted movement hierarchy, peer
 * grouping and context-specific slots (TASK-001, TASK-002; accepted reference
 * eded158c…, REUSE.md), drawn by the consumers the routes draw:
 *
 *   · Review: the actual `ReviewSection` the `/review` route renders, over the
 *     actual `reviewBriefing` derivation — one `WorkoutCard` per block under
 *     the static header, Swap in each movement's slot — with an in-memory swap
 *     controller that never queries or writes.
 *   · Workout: the live frame's own card and movement parts (`WorkoutCard`,
 *     `BlockPanel.MovementList` / `.Movement`, which is `LiveMovement`), fed
 *     the same readings the live renderers compute (`liveMovementReadings`).
 *     Set progress fills the live slot; Rest, set logging and completion stay
 *     the route's own controllers, so this state draws none of them and
 *     substitutes no synthetic writer.
 *   · TASK-003 (C08, C09, C10): both contexts' cards name the block by its
 *     format-only badge below the title, with the rounds, clock or cap on the
 *     line below it — drawn by `WorkoutCard` from the block's identity — and
 *     the live EMOM, AMRAP and For Time movements state their prescribed load
 *     as their route renderers now do.
 *   · TASK-007 (C20, R53, R96, R119): the Workout context opens with the
 *     route's own workout header — title, the session clock's compact whole
 *     frame and the menu frame on one row — at the accepted reading and one
 *     past the hour (`gallery-refinement-timers.tsx`).
 *   · TASK-011 (C32, R40): the Workout context's EMOM is the route's own
 *     `EmomBlock`, ready, over memory-only storage (`GalleryLiveEmom`,
 *     `gallery-refinement-forms.tsx`): its minute ahead, each movement's
 *     minutes and target, Next on the first, and Start — with no NOT STARTED
 *     caption — under the shell's own completion path, which saves nothing
 *     here. The other live cards keep the frame's parts below.
 *   · TASK-005 (C16, R29, R36): every live grouped card ends with the actual
 *     `GroupExerciseCoaching` in `WorkoutCard`'s `coaching` slot — one bottom
 *     Coaching and notes disclosure with a labelled section per movement —
 *     over memory-only library and note controllers
 *     (`gallery-refinement-coaching.tsx`). A standard block's movements keep
 *     their own panel on the route. Review draws none: before Start there is
 *     no prescription row for a note.
 *
 * Same synthetic composition in both contexts (`gallery-refinement-cards-data.ts`):
 * standard, superset and circuit peers; the timed EMOM, AMRAP and For Time
 * movements the accepted reference shows; or ten long-named stations.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'

import { Button, ChoiceGroup } from '../design-system/index'
import { prescriptionText, targetText } from '../state/prescription'
import { reviewBriefing } from '../state/review'
import type { SessionAcceptance } from '../state/schemas'
import { ExerciseSwapContext, type ExerciseSwapApi } from '../state/swap-context'
import { structureDetailText, structureIdentity } from '../state/workout-progress'
import { BlockPanel } from '../ui/block-renderers-frame'
import { GroupExerciseCoaching } from '../ui/exercise-coaching'
import { coachesAsGroup } from '../ui/group-coaching-context'
import { Heading, HeadingSection } from '../ui/Heading'
import { MovementGroupHeader, MovementIdentity, MovementList } from '../ui/refinements/movement'
import { liveMovementReadings } from '../ui/refinements/movement-readings'
import { LiveMovement, ReviewMovement, WorkoutCard } from '../ui/refinements/workout-card'
import { ReviewSection } from '../ui/review-block'
import { StructureBadge } from '../ui/workout-chrome'
import {
  CIRCUIT_BLOCK,
  peerGroupingAcceptance,
  STANDARD_BLOCK,
  SUPERSET_BLOCK,
  TEN_STATION_CIRCUIT_BLOCK,
  TIMED_BLOCKS,
} from './gallery-refinement-cards-data'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import { GalleryLiveEmom } from './gallery-refinement-forms'
import { GalleryWorkoutHeaders } from './gallery-refinement-timers'
import { galleryExerciseProgress } from './gallery-refinement-coaching-data'

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

/** The actual Review section the route renders for these blocks: one card per block. */
export function ReviewContextCards({ blocks = [STANDARD_BLOCK, SUPERSET_BLOCK, CIRCUIT_BLOCK] }: { blocks?: readonly Block[] }) {
  const briefing = reviewBriefing(peerGroupingAcceptance({ blocks }), GALLERY_UNIT)
  return (
    <InertSwap>
      {briefing.sections.map((section) => (
        <ReviewSection key={section.key} section={section} suggestions={NO_SUGGESTIONS} overrides={NO_OVERRIDES} onExplain={noop} />
      ))}
    </InertSwap>
  )
}

const LIST_LABELS: Readonly<Record<string, string>> = {
  standard: 'Movements in this block',
  superset: 'Movements in this superset',
  circuit: 'Movements in this circuit',
  emom: 'Movements in this EMOM',
  amrap: 'Movements in this AMRAP',
  for_time: 'Movements in this For Time',
}

const TIMED = new Set(['emom', 'amrap', 'for_time'])

/**
 * One live movement, as its route renderer reads it before the block starts:
 * the set loggers' `Set 1/N` progress and prescribed load for a standard or
 * superset movement, a circuit's one-round target, and a timed movement's
 * prescription with its compact equipment and prescribed load (TASK-003, C10:
 * the EMOM, AMRAP and For Time renderers read it through the same readings).
 */
function LiveBlockMovement({ block, prescription, position }: { block: Block; prescription: Block['exercises'][number]; position: number }) {
  const readings = liveMovementReadings({ ...prescription, equipment_used: prescription.equipment }, GALLERY_UNIT)
  if (TIMED.has(block.structure_type)) {
    return (
      <BlockPanel.Movement
        title={`${position + 1}. ${readings.name}`}
        detail={block.structure_type === 'amrap' ? targetText(prescription) : prescriptionText(prescription)}
        load={readings.load}
        context={readings.equipment}
      />
    )
  }
  const circuit = block.structure_type === 'circuit'
  return (
    <BlockPanel.Movement
      title={readings.name}
      ordinal={block.structure_type === 'superset' ? `A${position + 1}` : circuit ? `${position + 1}.` : undefined}
      counter={circuit ? undefined : `Set 1/${prescription.sets ?? 1}`}
      detail={circuit ? targetText(prescription) : prescriptionText(prescription)}
      load={readings.load}
      context={readings.equipment}
    />
  )
}

/**
 * One live block: the live frame's own `WorkoutCard` with the section label
 * the shell provides, then its movement list and, for a grouped block, the
 * actual bottom Coaching and notes disclosure `BlockPanel` hands the card. The
 * completion seam stays the shell's alone, so this state draws no completion
 * and provides no completion context.
 */
function WorkoutBlock({ block, blockIndex, sectionLabel }: { block: Block; blockIndex: number; sectionLabel: string }) {
  const exercises = galleryExerciseProgress(block, blockIndex)
  const grouped = coachesAsGroup({ structureType: block.structure_type, exercises })
  return (
    <WorkoutCard
      context="workout"
      title={sectionLabel}
      structure={structureIdentity(block)}
      coaching={grouped ? <GroupExerciseCoaching format={structureIdentity(block).format} exercises={exercises} /> : undefined}
    >
      <BlockPanel.MovementList label={LIST_LABELS[block.structure_type] ?? 'Movements in this block'}>
        {block.exercises.map((prescription, position) => (
          <BlockPanel.MovementItem key={`${prescription.exercise_id}-${position}`}>
            <LiveBlockMovement block={block} prescription={prescription} position={position} />
          </BlockPanel.MovementItem>
        ))}
      </BlockPanel.MovementList>
    </WorkoutCard>
  )
}

export function WorkoutContextCards({ blocks = [STANDARD_BLOCK, SUPERSET_BLOCK, CIRCUIT_BLOCK] }: { blocks?: readonly Block[] }) {
  // The same section label the live shell provides around a section's blocks.
  const sectionLabel = reviewBriefing(peerGroupingAcceptance({ blocks }), GALLERY_UNIT).sections[0].title
  return (
    <GalleryCoachingClients>
      <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        {blocks.map((block, index) => block.structure_type === 'emom'
          // TASK-011 (C32): the route's own EMOM, not the frame's parts.
          ? <GalleryLiveEmom key={index} block={block} blockIndex={index} sectionLabel={sectionLabel} />
          : <WorkoutBlock key={index} block={block} blockIndex={index} sectionLabel={sectionLabel} />)}
      </div>
    </GalleryCoachingClients>
  )
}

const COMPOSITIONS = {
  peers: { label: 'Standard, superset and circuit', blocks: [STANDARD_BLOCK, SUPERSET_BLOCK, CIRCUIT_BLOCK] },
  timed: { label: 'EMOM, AMRAP and For Time', blocks: [...TIMED_BLOCKS] },
  long: { label: 'Ten long-named stations', blocks: [TEN_STATION_CIRCUIT_BLOCK] },
} as const
type Composition = keyof typeof COMPOSITIONS

/** The stable `cards` state: the same movements in Review and in Workout. */
export function GalleryMovementCards() {
  const [composition, setComposition] = useState<Composition>('peers')
  const blocks = COMPOSITIONS[composition].blocks
  return (
    <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }} data-gallery-cards="">
      <ChoiceGroup
        legend="Composition"
        value={composition}
        options={(Object.keys(COMPOSITIONS) as Composition[]).map((value) => ({ value, label: COMPOSITIONS[value].label }))}
        onChange={(value) => setComposition(value as Composition)}
      />
      <HeadingSection data-gallery-context="review" className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <Heading>Review · static headers, Swap in the action slot</Heading>
        <ReviewContextCards blocks={blocks} />
      </HeadingSection>
      <HeadingSection data-gallery-context="workout" className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <Heading>Workout · the same header, set progress in the action slot</Heading>
        {/* TASK-007 (C20): the route's own one-row workout header. */}
        <GalleryWorkoutHeaders />
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

/** TASK-003 (C08, C09): the format-only badge below the title, its rounds below it. */
export function MovementGroupHeaderLabelled() {
  return (
    <MovementGroupHeader
      title="3 movements"
      badge={<StructureBadge identity={CIRCUIT_IDENTITY} formatOnly />}
      meta={structureDetailText(CIRCUIT_IDENTITY)}
    />
  )
}

/** Review's static section header: the same face, as a semantic heading (C07). */
export function MovementGroupHeaderHeading() {
  return (
    <MovementGroupHeader
      heading
      title="Conditioning"
      badge={<StructureBadge identity={CIRCUIT_IDENTITY} formatOnly />}
      meta={structureDetailText(CIRCUIT_IDENTITY)}
    />
  )
}

const EMOM_IDENTITY = structureIdentity({ structure_type: 'emom', rounds: null, timer_seconds: 600, rep_scheme: 'fixed' })
const LADDER_IDENTITY = structureIdentity({ structure_type: 'for_time', rounds: null, timer_seconds: 900, rep_scheme: 'ladder_down' })
const FOR_TIME_IDENTITY = structureIdentity({ structure_type: 'for_time', rounds: null, timer_seconds: 900, rep_scheme: 'fixed' })

/**
 * C09 (TASK-003): a long section label and the shortest and longest formats
 * keep the badge in the same place, below the title, untruncated.
 */
export function MovementGroupHeaderLongLabel() {
  return (
    <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
      {[EMOM_IDENTITY, LADDER_IDENTITY, FOR_TIME_IDENTITY].map((identity) => (
        <MovementGroupHeader
          key={identity.format}
          title="Strength and conditioning finisher"
          badge={<StructureBadge identity={identity} formatOnly />}
          meta={structureDetailText(identity)}
        />
      ))}
    </div>
  )
}

export function ReviewSectionStandard() { return <ReviewContextCards blocks={[STANDARD_BLOCK]} /> }
export function ReviewSectionSuperset() { return <ReviewContextCards blocks={[SUPERSET_BLOCK]} /> }
export function ReviewSectionCircuit() { return <ReviewContextCards blocks={[CIRCUIT_BLOCK]} /> }
export function ReviewSectionTimed() { return <ReviewContextCards blocks={[...TIMED_BLOCKS]} /> }

/** TASK-002: one card, two contexts — Review's static heading and Swap. */
export function WorkoutCardReview() {
  return (
    <InertSwap>
      <WorkoutCard context="review" heading title="Conditioning" structure={CIRCUIT_IDENTITY}>
        <MovementList label="circuit, 2 rounds">
          <li><ReviewMovement name="kb swing" ordinal="01" equipment="kettlebell" prescription="15 reps" load="24 kg" swap={<Button variant="quiet" size="sm">Swap</Button>} /></li>
          <li><ReviewMovement name="mountain climber" ordinal="02" equipment="bodyweight" prescription="20 reps" swap={<Button variant="quiet" size="sm">Swap</Button>} /></li>
        </MovementList>
      </WorkoutCard>
    </InertSwap>
  )
}

/** TASK-002: one card, two contexts — the live label and set progress. */
export function WorkoutCardWorkout() {
  return (
    <WorkoutCard context="workout" title="Conditioning" structure={CIRCUIT_IDENTITY}>
      <MovementList label="Movements in this circuit">
        <li><HeadingSection><LiveMovement name="kb swing" ordinal="1." equipment="kettlebell" prescription="15 reps" load="24 kg" /></HeadingSection></li>
        <li><HeadingSection><LiveMovement name="mountain climber" ordinal="2." equipment="bodyweight" prescription="20 reps" /></HeadingSection></li>
      </MovementList>
    </WorkoutCard>
  )
}

export function ReviewMovementSwap() {
  return <ReviewMovement name="back squat" equipment="barbell" prescription="3 × 5 reps" load="100 kg" extra="Rest 120s" swap={<Button variant="quiet" size="sm">Swap</Button>} />
}

export function ReviewMovementLongName() {
  return (
    <ReviewMovement
      name="single arm kettlebell overhead reverse lunge to knee drive" ordinal="01" equipment="medicine ball"
      prescription="10 reps" load="16 kg" swap={<Button variant="quiet" size="sm">Swap</Button>}
    />
  )
}

export function LiveMovementProgress() {
  return <LiveMovement name="push up" ordinal="A2" equipment="bodyweight" prescription="3 × 12 reps" progress="Set 1/3" />
}

export function LiveMovementTimed() {
  return <LiveMovement name="1. wall ball" equipment="medicine ball" prescription="40 reps" />
}
