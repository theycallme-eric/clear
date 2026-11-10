/**
 * Named accepted refinement scenes (REUSE.md: "Overview/Summary and
 * Generate/Setup/History compositions — named examples in
 * `src/dev/gallery-refinement-scenes.tsx`"). Accepted gallery reference
 * eded158cfd928d382c9a9409e2c372270312741d.
 *
 * TASK-004 adopts the reference's `GalleryOverviewSummary` scene
 * (`/gallery/refinements?state=overview`) as a deliberate consolidation: the
 * reference composed a synthetic card, a facts list and a `BARBELL · BENCH ·
 * DUMBBELLS` paragraph by hand; here the scene draws the consumers the routes
 * draw, over the same shared owners (`src/ui/refinements/overview.tsx`):
 *
 *   · Planned workout — Review's actual `ReviewOverview` over the actual
 *     `reviewBriefing` derivation of a composed workout.
 *   · Saved workout — Session Detail's actual `SessionOverview` over the
 *     actual `sessionDetail` derivation of a recorded `session_as_performed`.
 *   · Summary frames — the completed Summary's actual `DurationMetric` and
 *     `StreakMetric` in its `MetricGrid` row.
 *
 * The Equipment context switches between a loaded composition and an
 * all-bodyweight one, so `None — bodyweight only` appears exactly when no row
 * names equipment. Data is synthetic and in memory
 * (`gallery-refinement-overview-data.ts`); nothing is read or written.
 *
 * TASK-022 adopts the reference's `GalleryPreparationReview` scene
 * (`/gallery/refinements?state=preparation`) as a deliberate consolidation:
 * the reference drew `RefinementPreparation` with a fixed `minutes={5}`
 * default, sample names and a still `DeadlineTimer`; here the scene draws the
 * consumers the routes draw, driven by TASK-034's actual reading
 * (`src/state/preparation-guide.ts`) of one synthetic composition
 * (`gallery-refinement-preparation-data.ts`):
 *
 *   · Review — the Warm-up and Cooldown as `/review` draws them, each the
 *     shared `PreparationGuide` over `composedPreparationGuide`, with the
 *     worked section between them as the actual `ReviewSection`.
 *   · Workout — `/workout`'s own `LivePreparation` for each: the guide read
 *     from the persisted rows, then its separate preparation clock with
 *     Start / Pause and Add 30s and no Dismiss. The clock is memory-only and
 *     records nothing.
 *
 * The reference file's other scenes (cards, Generate / Setup / History,
 * equipment inventory) belong to other tasks; the cards scene is
 * `gallery-refinement-cards.tsx` (TASK-001/002/003).
 */
import { useState } from 'react'

import { ChoiceGroup } from '../design-system/index'
import { ReviewOverview } from '../app/Review'
import { SessionOverview } from '../app/SessionDetail'
import { DurationMetric, StreakMetric } from '../app/Summary'
import { createError, ErrorCode } from '../state/errors'
import { composedPreparationGuide, type PreparationSectionType } from '../state/preparation-guide'
import { reviewBriefing } from '../state/review'
import { sessionDetail } from '../state/session-detail'
import { Card } from '../ui/card'
import { MetricGrid } from '../ui/composition'
import { LivePreparation, PreparationGuide, PreparationTimer } from '../ui/preparation-guide'
import { EquipmentSummary } from '../ui/refinements/overview'
import { ReviewContextCards } from './gallery-refinement-cards'
import {
  overviewAcceptance,
  savedOverviewRecord,
  SUMMARY_PAIR,
  type OverviewComposition,
} from './gallery-refinement-overview-data'
import { persistedPreparationSection, PREPARATION_SECTIONS } from './gallery-refinement-preparation-data'

/** The gallery shows a known unit; the route reads the profile's. */
const GALLERY_UNIT = 'kg' as const

type OverviewContext = 'planned' | 'saved'

/** Review's Overview card for a composed workout, exactly as `/review` draws it. */
export function PlannedOverview({ composition }: { composition: OverviewComposition }) {
  const briefing = reviewBriefing(overviewAcceptance({ composition }), GALLERY_UNIT)
  return (
    <ReviewOverview
      facts={briefing.facts}
      adjustment={briefing.adjustment}
      movementCount={briefing.movementCount}
      equipment={briefing.equipment}
    />
  )
}

/** The saved workout's Overview card, exactly as `/history/:id` draws it. */
export function SavedOverview({ composition }: { composition: OverviewComposition }) {
  return <SessionOverview view={sessionDetail(savedOverviewRecord({ composition }))} />
}

/** The completed Summary's Duration and Streak row, exactly as `/summary` draws it. */
export function SummaryFrames() {
  return (
    <MetricGrid data-gallery-summary-metrics="">
      <DurationMetric minutes={SUMMARY_PAIR.durationMins} />
      <StreakMetric streak={SUMMARY_PAIR.streak} />
    </MetricGrid>
  )
}

export function GalleryOverviewSummary() {
  const [context, setContext] = useState<OverviewContext>('planned')
  const [bodyweight, setBodyweight] = useState(false)
  const composition: OverviewComposition = bodyweight ? 'bodyweight' : 'loaded'
  return (
    <div className="clr-stack" data-gallery-overview={context}>
      <ChoiceGroup
        legend="Overview context"
        value={context}
        options={[
          { value: 'planned', label: 'Planned workout' },
          { value: 'saved', label: 'Saved workout' },
        ]}
        onChange={(value) => setContext(value === 'saved' ? 'saved' : 'planned')}
      />
      <ChoiceGroup
        legend="Equipment context"
        value={bodyweight ? 'bodyweight' : 'loaded'}
        options={[
          { value: 'loaded', label: 'Loaded' },
          { value: 'bodyweight', label: 'Bodyweight only' },
        ]}
        onChange={(value) => setBodyweight(value === 'bodyweight')}
      />
      <div data-gallery-context={context}>
        {context === 'saved' ? (
          <SavedOverview composition={composition} />
        ) : (
          <PlannedOverview composition={composition} />
        )}
      </div>
      <SummaryFrames />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Register specimens (src/dev/gallery-registry.tsx), over the same consumers
// ─────────────────────────────────────────────────────────────────────────────

export const OverviewFactsPlanned = () => <PlannedOverview composition="loaded" />
export const OverviewFactsSaved = () => <SavedOverview composition="loaded" />
export const OverviewFactsWidest = () => <PlannedOverview composition="widest" />

/** The group as Review's Overview card holds it: the briefing's own equipment. */
export function EquipmentSummaryLoaded() {
  return (
    <Card heading="Overview">
      <EquipmentSummary equipment={reviewBriefing(overviewAcceptance({ composition: 'loaded' }), GALLERY_UNIT).equipment} />
    </Card>
  )
}

export function EquipmentSummaryBodyweight() {
  return (
    <Card heading="Overview">
      <EquipmentSummary equipment={reviewBriefing(overviewAcceptance({ composition: 'bodyweight' }), GALLERY_UNIT).equipment} />
    </Card>
  )
}

/** Nothing measured the duration; the streak reaches today. */
export function SummaryFramesUnmeasured() {
  return (
    <MetricGrid>
      <DurationMetric minutes={null} />
      <StreakMetric streak={{ days: 1, includesToday: true }} />
    </MetricGrid>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-022: the concise Warm-up and Cooldown, and their preparation clocks
// ─────────────────────────────────────────────────────────────────────────────

type PreparationContext = 'review' | 'workout'

function composedGuide(type: PreparationSectionType) {
  const guide = composedPreparationGuide(PREPARATION_SECTIONS[type])
  if (guide === null) throw new Error(`The ${type} section composes no guide`)
  return guide
}

/** The Warm-up or Cooldown as `/review` draws it: the guide alone, over the composed section. */
export function ReviewPreparationGuide({ type }: { type: PreparationSectionType }) {
  const guide = composedGuide(type)
  return <PreparationGuide reading={{ status: 'ready', guide }} type={guide.type} />
}

/** The Warm-up or Cooldown as `/workout` draws it, read from the persisted rows. */
export function WorkoutPreparation({ type }: { type: PreparationSectionType }) {
  const index = type === 'warmup' ? 0 : 2
  return <LivePreparation entry={persistedPreparationSection(PREPARATION_SECTIONS[type], index)} type={type} />
}

export function GalleryPreparation() {
  const [context, setContext] = useState<PreparationContext>('review')
  return (
    <div className="clr-stack" data-gallery-preparation={context}>
      <ChoiceGroup
        legend="Context"
        value={context}
        options={[
          { value: 'review', label: 'Review' },
          { value: 'workout', label: 'Workout' },
        ]}
        onChange={(value) => setContext(value === 'workout' ? 'workout' : 'review')}
      />
      <div className="clr-stack" data-gallery-context={context}>
        {context === 'review' ? (
          <>
            <ReviewPreparationGuide type="warmup" />
            <ReviewContextCards blocks={PREPARATION_SECTIONS.main.blocks} />
            <ReviewPreparationGuide type="cooldown" />
          </>
        ) : (
          <>
            <WorkoutPreparation type="warmup" />
            <WorkoutPreparation type="cooldown" />
          </>
        )}
      </div>
    </div>
  )
}

// Register specimens (src/dev/gallery-registry.tsx), over the same owners.

export const PreparationGuideWarmUp = () => <ReviewPreparationGuide type="warmup" />
export const PreparationGuideCooldown = () => <ReviewPreparationGuide type="cooldown" />
export const PreparationGuideLoading = () => <PreparationGuide reading={{ status: 'loading' }} type="warmup" />
export const PreparationGuideError = () => (
  <PreparationGuide
    reading={{ status: 'error', error: createError(ErrorCode.PERSISTENCE_READ_FAILED) }}
    type="warmup"
    onRetry={() => {}}
  />
)
export const PreparationGuideNoMovements = () => (
  <PreparationGuide reading={{ status: 'missing', type: 'cooldown', reason: 'no-movements' }} type="cooldown" />
)
export const PreparationTimerWarmUp = () => <PreparationTimer clockKey="gallery-warm-up" guide={composedGuide('warmup')} />
export const PreparationTimerCooldown = () => <PreparationTimer clockKey="gallery-cooldown" guide={composedGuide('cooldown')} />
export const LivePreparationWarmUp = () => <WorkoutPreparation type="warmup" />
export const LivePreparationCooldown = () => <WorkoutPreparation type="cooldown" />
