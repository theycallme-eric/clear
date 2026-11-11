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
 * TASK-023 (C50, G15, R05) completes the Review context as the reference drew
 * it: Review's own `ReviewRegenerateAction` follows the Cooldown, the last
 * item after all workout content. Pressing it asks with Review's own
 * `RegenerateConfirmDialog`; both answers only close it here — the gallery
 * discards nothing, navigates nowhere and runs no generation.
 *
 * TASK-024 (C51, G16; R06, R10, R11, R21, R23, R25) adopts the Generate part
 * of the reference's `GalleryGenerateSetupHistory` scene
 * (`/gallery/refinements?state=screens`) as a deliberate consolidation. The
 * reference drew a hand-made scene head, a `label` Goal, a quiet Button for
 * the Focus that opened a dialog of five equal choices with Recovery as the
 * fifth, and a `Time` field. Here the scene draws `/generate`'s own owners:
 *
 *   · `GenerateBack` beside the `Generate` title in the shared `AppHeader` —
 *     the framed icon-only Back named for Home;
 *   · `GenerateIntent` — Goal and Focus on one row, the Focus value itself the
 *     disclosure, opening the four focuses inline (as #286's Edit does) and,
 *     apart from them, the one-workout Recovery toggle: Recovery is a session
 *     mode, never a fifth focus (R10.1). A First workout context asks for the
 *     required Anchor with Recovery offered unselected (R11, #286);
 *   · `GenerateContextFields` — Place, Time available with its MINUTES unit
 *     fitted by the shared Input contract, and Notes, with no helper lines.
 *
 * The draft is held in memory and resolved by the route's own pure rules
 * (`state/generation-form.ts`); Generate workout sends nothing. The Setup and
 * History parts of the reference scene belong to TASK-025 and TASK-026.
 *
 * TASK-025 (C52, G17, R24) adopts the Setup part as a deliberate
 * consolidation. The reference drew a hand-made `header` (a `Setup` label and
 * `Step 1 of N · Equipment`) over a capped `.clr-accepted-setup` scroll box.
 * Here `SetupScene` draws `/onboarding`'s own composition in a short
 * screen-sized frame: the Set up CLEAR title in the shared `AppHeader`, the
 * route's `SetupProgress` in Screen's pinned layer under it, one divider (the
 * public ScrollRegion head's rule), and the route's `SetupStepView` for the
 * equipment step scrolling below — the same shared Screen classes, no route
 * CSS. The draft is in memory (Home gym chosen); nothing is read or written.
 *
 * TASK-026 (C53, G18; R08, R19) adopts the History part as a deliberate
 * consolidation. The reference drew a `History` card with a `Filter` select
 * (All workouts / Completed / Incomplete) over two hand-made
 * `.clr-accepted-history-row` paragraphs. Here `HistoryScene` draws
 * `/history`'s own `HistoryCollection` — the `Workout history` card, its
 * `Show` filter offering All entries, Completed and Partial (no Rest days, no
 * Not started), and the shared `HistoryList` rows: each title on its own row,
 * its status and date beneath, then the metrics — over stored rows held in
 * memory and read by the route's own `historyEntries`, so All entries keeps
 * the derived rest runs and the never-started workout with its status. The
 * filter state is in memory; the titles open nothing here, and nothing is
 * read or written. `.clr-accepted-history-row` is not adopted.
 *
 * The reference file's other scenes (cards, equipment inventory) belong to
 * other tasks; the cards scene is `gallery-refinement-cards.tsx`
 * (TASK-001/002/003).
 */
import { useId, useReducer, useState } from 'react'

import { AppHeader, Button, ChoiceGroup, IntensitySlider, ScrollRegion } from '../design-system/index'
import {
  GENERATE_ACTION_LABEL,
  GENERATE_TITLE,
  GenerateBack,
  GenerateContextFields,
  GenerateIntent,
} from '../app/Generate'
import { ONBOARDING_TITLE, SetupProgress, SetupStepView } from '../app/Onboarding'
import { HISTORY_TITLE, HistoryCollection, historyViewState } from '../app/History'
import { RegenerateConfirmDialog, ReviewOverview, ReviewRegenerateAction } from '../app/Review'
import { SessionOverview } from '../app/SessionDetail'
import { DurationMetric, StreakMetric } from '../app/Summary'
import { createError, ErrorCode } from '../state/errors'
import {
  canGenerate,
  initialDraft,
  REQUESTED_INTENSITY_RANGE,
  resolveGeneration,
  withAnchor,
  withDuration,
  withIntensity,
  withLocation,
  withNotes,
  withOverride,
  withRecovery,
  type FocusHistory,
  type GenerationContext,
  type GenerationDraft,
} from '../state/generation-form'
import { filterHistory, historyEntries, type HistoryFilter } from '../state/history'
import { EMPTY_DRAFT, onboardingReducer, STEP_TITLES } from '../state/onboarding'
import { composedPreparationGuide, type PreparationSectionType } from '../state/preparation-guide'
import { reviewBriefing } from '../state/review'
import { sessionDetail } from '../state/session-detail'
import { Card } from '../ui/card'
import { Heading } from '../ui/Heading'
import { MetricGrid } from '../ui/composition'
import { LivePreparation, PreparationGuide, PreparationTimer } from '../ui/preparation-guide'
import { EquipmentSummary } from '../ui/refinements/overview'
import { ReviewContextCards, WorkoutContextCards } from './gallery-refinement-cards'
import {
  overviewAcceptance,
  overviewId,
  savedOverviewRecord,
  savedSessionRow,
  SUMMARY_PAIR,
  type OverviewComposition,
} from './gallery-refinement-overview-data'
import { persistedPreparationSection, PREPARATION_SECTIONS } from './gallery-refinement-preparation-data'
import { Dumbbell, WeightPlate } from '../design-system/index'
import {
  EQUIPMENT_ASSETS,
  SHIPPED_EQUIPMENT_ICONS,
  WANTED_REVIEW_LABELS,
  type ShippedEquipmentGlyph,
} from '../ui/refinements/equipment-assets'
import { peerGroupingAcceptance } from './gallery-refinement-cards-data'
import { ASSET_BLOCKS } from './gallery-refinement-assets-data'

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
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false)
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
            <ReviewRegenerateAction onRequest={() => setConfirmingRegenerate(true)} />
          </>
        ) : (
          <>
            <WorkoutPreparation type="warmup" />
            <WorkoutPreparation type="cooldown" />
          </>
        )}
      </div>
      <RegenerateConfirmDialog
        open={confirmingRegenerate}
        onCancel={() => setConfirmingRegenerate(false)}
        onConfirm={() => setConfirmingRegenerate(false)}
      />
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

// ─────────────────────────────────────────────────────────────────────────────
// TASK-024: Generate's hierarchy, focus interaction and copy (`?state=screens`)
// ─────────────────────────────────────────────────────────────────────────────

type GenerateSceneContext = 'returning' | 'first'

/** Synthetic places: only ids and names are drawn. */
const GALLERY_PLACES = [
  { id: 'gallery-place-gym', name: 'Gym' },
  { id: 'gallery-place-home', name: 'Home' },
] as const

/** A returning athlete whose history recommends Full body at 7. */
const GALLERY_RECOMMENDATION: FocusHistory = {
  status: 'recommended',
  focus: 'full_body',
  intensity: 7,
  reason: 'Not in your recent workouts.',
}

const GALLERY_HISTORY: Record<GenerateSceneContext, FocusHistory> = {
  returning: GALLERY_RECOMMENDATION,
  first: { status: 'no-completed-history' },
}

/** `/generate`'s card as the route draws it, over an in-memory draft. */
export function GenerateScene({ context }: { context: GenerateSceneContext }) {
  const history = GALLERY_HISTORY[context]
  const generation: GenerationContext = { goalPreset: 'balanced', history }
  const [draft, setDraft] = useState<GenerationDraft>(() => initialDraft(GALLERY_PLACES[0].id))
  const [changing, setChanging] = useState(false)
  const choicesId = useId()
  const resolved = resolveGeneration(draft, generation)
  const override = resolved.status === 'ready' && resolved.focusSource === 'override'
  const expanded = changing || override
  const range = REQUESTED_INTENSITY_RANGE
  const intensity = resolved.intensity ?? range.start

  return (
    <div className="clr-stack" data-gallery-context={context}>
      <AppHeader actions={<GenerateBack />}>
        <Heading className="clr-screen__title">{GENERATE_TITLE}</Heading>
      </AppHeader>
      <Card>
        <div className="clr-stack">
          <GenerateIntent
            goalPreset={generation.goalPreset}
            draft={draft}
            resolved={resolved}
            history={history}
            expanded={expanded}
            choicesId={choicesId}
            onToggleFocus={() => {
              if (expanded) setDraft(withOverride(draft, null))
              setChanging(!expanded)
            }}
            onChooseOverride={(focus) => {
              const recommended = history.status === 'recommended' && history.focus === focus
              setDraft(withOverride(draft, recommended ? null : focus))
            }}
            onChooseAnchor={(anchor) => setDraft(withAnchor(draft, anchor))}
            onToggleRecovery={() => {
              if (!draft.recovery) setChanging(true)
              setDraft(withRecovery(draft, !draft.recovery))
            }}
            onRetryHistory={() => {}}
          />
          <IntensitySlider
            label="Intensity"
            min={range.min}
            max={range.max}
            step={1}
            value={intensity}
            valueText={`${intensity} of ${range.max}`}
            onChange={(value: number) => setDraft(withIntensity(draft, value))}
          />
          <GenerateContextFields
            places={GALLERY_PLACES}
            locationId={draft.locationId}
            durationMins={draft.durationMins}
            notes={draft.notes}
            onLocation={(value) => setDraft(withLocation(draft, value))}
            onDuration={(value) => setDraft(withDuration(draft, value))}
            onNotes={(value) => setDraft(withNotes(draft, value))}
          />
        </div>
      </Card>
      {/* Inert here: the gallery composes nothing and sends nothing. */}
      <Button variant="primary" size="lg" disabled={!canGenerate(draft, generation)}>
        {GENERATE_ACTION_LABEL}
      </Button>
    </div>
  )
}

/**
 * `/onboarding`'s equipment step as the route pins it (TASK-025): title, step
 * label and progress in one head over one divider, the equipment scrolling
 * beneath, in a frame a short phone tall.
 */
export function SetupScene() {
  const [draft, dispatch] = useReducer(onboardingReducer, EMPTY_DRAFT, (empty) =>
    onboardingReducer(empty, { type: 'tier', value: 'home' }))
  return (
    <div
      className="clr-screen"
      data-gallery-setup=""
      style={{ flex: 'none', height: 'calc(var(--spacing-1400) * 4)' }}
    >
      <ScrollRegion
        head={
          <>
            <AppHeader>
              <Heading className="clr-screen__title">{ONBOARDING_TITLE}</Heading>
            </AppHeader>
            <div className="clr-screen__pinned">
              <SetupProgress step="location" />
            </div>
          </>
        }
        scrollerProps={{ 'aria-label': `${ONBOARDING_TITLE} content`, role: 'region', tabIndex: 0 }}
      >
        <div className="clr-screen__content clr-screen__content--titled-head">
          <Card heading={STEP_TITLES.location}>
            <div className="clr-stack">
              <SetupStepView step="location" draft={draft} dispatch={dispatch} />
            </div>
          </Card>
        </div>
      </ScrollRegion>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-026: History's row hierarchy and filter options (`?state=screens`)
// ─────────────────────────────────────────────────────────────────────────────

/** The instant the gallery's chronology is read at, so its rest runs are fixed. */
const GALLERY_HISTORY_NOW = new Date('2026-10-31T12:00:00.000Z')

/** A stored session on `date`, ended as `outcome` says. Synthetic and in memory. */
function galleryHistoryRow(
  n: number,
  date: string,
  title: string,
  focus: 'lower_body' | 'upper_body' | 'full_body',
  outcome: 'completed' | 'partial' | 'unstarted',
  actualMins: number | null,
) {
  const row = savedSessionRow({ sessionId: overviewId(900 + n), date, completedAt: `${date}T18:00:00.000Z`, actualDurationMins: actualMins })
  return {
    ...row,
    title,
    session_focus: focus,
    requested_duration_mins: 45,
    effective_intensity: 7,
    started_at: outcome === 'unstarted' ? null : row.started_at,
    completed_at: outcome === 'completed' ? row.completed_at : null,
    abandoned_at: outcome === 'partial' ? `${date}T17:30:00.000Z` : null,
  }
}

/** Every outcome the list holds, with rest days between them. */
const GALLERY_HISTORY_ROWS = [
  galleryHistoryRow(1, '2026-10-27', 'Balanced lower body', 'lower_body', 'completed', 49),
  galleryHistoryRow(2, '2026-10-25', 'Balanced upper body', 'upper_body', 'completed', 47),
  galleryHistoryRow(3, '2026-10-23', 'Full-body conditioning with a longer stored session name', 'full_body', 'partial', 18),
  galleryHistoryRow(4, '2026-10-22', 'Upper-body strength', 'upper_body', 'unstarted', null),
]

/**
 * `/history`'s collection as the route draws it (TASK-026): the route's own
 * card, filter and rows over stored rows held in memory.
 */
export function HistoryScene() {
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const entries = historyEntries(GALLERY_HISTORY_ROWS, { now: GALLERY_HISTORY_NOW, timeZone: 'UTC' })
  const visible = filterHistory(entries, filter)
  return (
    <div className="clr-stack" data-gallery-history="">
      <AppHeader>
        <Heading className="clr-screen__title">{HISTORY_TITLE}</Heading>
      </AppHeader>
      <HistoryCollection
        state={historyViewState({ status: 'ready' }, entries, visible)}
        hasHistory={entries.length > 0}
        filter={filter}
        onFilter={setFilter}
        // The titles draw as the route's links; here they open nothing.
        linkTo={(entry) => `/history/${entry.id}`}
        onOpen={() => {}}
      />
    </div>
  )
}

export function GalleryScreens() {
  const [context, setContext] = useState<GenerateSceneContext>('returning')
  return (
    <div className="clr-stack" data-gallery-screens={context}>
      <ChoiceGroup
        legend="Generate context"
        value={context}
        options={[
          { value: 'returning', label: 'Returning athlete' },
          { value: 'first', label: 'First workout' },
        ]}
        onChange={(value) => setContext(value === 'first' ? 'first' : 'returning')}
      />
      <GenerateScene key={context} context={context} />
      <SetupScene />
      <HistoryScene />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK-029: the equipment asset inventory and readable fallback (`?state=assets`)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TASK-029 (C56; R122, R132) adopts the reference's `GalleryEquipmentInventory`
 * scene as a deliberate consolidation. The reference drew the shipped Dumbbell
 * and WeightPlate, Setup's equipment list with an inline `dumbbells` test for
 * its status, and a medicine-ball note. Here the inventory is the shared
 * owner's (`src/ui/refinements/equipment-assets.ts`, the record of
 * `EQUIPMENT-ICON-WANTED-LIST.md`), and the readable fallback is shown where
 * the routes draw it rather than described:
 *
 *   · Review — `/review`'s Required equipment group (`EquipmentSummary`, the
 *     one shipped category glyph beside its label) and its actual
 *     `ReviewSection` cards, every movement's equipment the readable label
 *     beside its name, glyph or none;
 *   · Workout — `/workout`'s live cards over the same composition;
 *   · Setup — `/onboarding`'s own equipment step (`SetupStepView`), each of
 *     the sixteen ids a labelled choice.
 *
 * One synthetic composition names every Setup id and the Wall ball review's
 * medicine ball (`gallery-refinement-assets-data.ts`). Nothing is read or
 * written, and no glyph is drawn that the shipped family does not have.
 */
const SHIPPED_GLYPHS: Readonly<Record<ShippedEquipmentGlyph, typeof Dumbbell>> = { Dumbbell, WeightPlate }

type AssetContext = 'review' | 'workout'

/** The verified inventory: the shipped equipment glyphs, then every Setup id's status. */
export function EquipmentAssetInventory() {
  return (
    <Card heading="Equipment icon inventory">
      <div className="clr-stack" data-equipment-inventory="">
        <p>Equipment names remain readable beside movement names. New glyphs are a wanted list; none are invented here.</p>
        <ul aria-label="Shipped equipment glyphs">
          {SHIPPED_EQUIPMENT_ICONS.map(({ glyph, meaning }) => {
            const Glyph = SHIPPED_GLYPHS[glyph]
            return (
              <li key={glyph} data-shipped-glyph={glyph}>
                <Glyph size={16} /> {glyph} · shipped · {meaning}
              </li>
            )
          })}
        </ul>
        <ul aria-label="Setup equipment glyph status">
          {EQUIPMENT_ASSETS.map((asset) => (
            <li key={asset.id} data-equipment-asset={asset.id} data-equipment-status={asset.status}>
              {asset.label} · {asset.glyph === null ? 'glyph wanted · readable label' : `${asset.glyph} shipped`}
            </li>
          ))}
        </ul>
        {WANTED_REVIEW_LABELS.map((wanted) => (
          <p key={wanted.equipment} data-equipment-wanted={wanted.equipment}>
            {wanted.label} is also wanted from the Wall ball review. It is not a current Setup equipment ID;
            catalog coverage is resolved separately.
          </p>
        ))}
      </div>
    </Card>
  )
}

/** Review's Required equipment group for the composition, as its Overview draws it. */
function AssetEquipmentSummary() {
  const equipment = reviewBriefing(peerGroupingAcceptance({ blocks: ASSET_BLOCKS }), GALLERY_UNIT).equipment
  return (
    <Card heading="Overview">
      <EquipmentSummary equipment={equipment} />
    </Card>
  )
}

/** `/onboarding`'s equipment step, every Setup id a labelled choice; in memory. */
function AssetSetupEquipment() {
  const [draft, dispatch] = useReducer(onboardingReducer, EMPTY_DRAFT, (empty) =>
    onboardingReducer(empty, { type: 'tier', value: 'home' }))
  return (
    <Card heading={STEP_TITLES.location}>
      <div className="clr-stack" data-gallery-setup-equipment="">
        <SetupStepView step="location" draft={draft} dispatch={dispatch} />
      </div>
    </Card>
  )
}

export function GalleryEquipmentAssets() {
  const [context, setContext] = useState<AssetContext>('review')
  return (
    <div className="clr-stack" data-gallery-assets={context}>
      <EquipmentAssetInventory />
      <ChoiceGroup
        legend="Equipment context"
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
            <AssetEquipmentSummary />
            <ReviewContextCards blocks={ASSET_BLOCKS} />
          </>
        ) : (
          <WorkoutContextCards blocks={ASSET_BLOCKS} />
        )}
      </div>
      <AssetSetupEquipment />
    </div>
  )
}
