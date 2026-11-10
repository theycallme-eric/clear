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
 * The reference file's other scenes (cards, preparation, Generate / Setup /
 * History, equipment inventory) belong to other tasks; the cards scene is
 * `gallery-refinement-cards.tsx` (TASK-001/002/003).
 */
import { useState } from 'react'

import { ChoiceGroup } from '../design-system/index'
import { ReviewOverview } from '../app/Review'
import { SessionOverview } from '../app/SessionDetail'
import { DurationMetric, StreakMetric } from '../app/Summary'
import { reviewBriefing } from '../state/review'
import { sessionDetail } from '../state/session-detail'
import { Card } from '../ui/card'
import { MetricGrid } from '../ui/composition'
import { EquipmentSummary } from '../ui/refinements/overview'
import {
  overviewAcceptance,
  savedOverviewRecord,
  SUMMARY_PAIR,
  type OverviewComposition,
} from './gallery-refinement-overview-data'

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
