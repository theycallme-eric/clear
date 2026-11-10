/**
 * Review — REV-01. The pre-workout briefing, and the handoff into SES-01.
 *
 * IA.md §4 gives this screen the composition it has: an overview card of the
 * facts the workout was composed under and the equipment it needs, one card
 * per section, Start pinned in the footer and Regenerate at the end of the
 * scrolling content (REQ-006). Nothing but the title sits on the atmosphere.
 * Everything it renders comes from `reviewBriefing`, which is where the
 * decisions about *words* live; this file is the markup and the two things the
 * markup cannot be — starting, and discarding.
 *
 * **Start is where the session begins to exist.** Nothing has been written when
 * this screen mounts: generation answers a composed workout, not a row, and the
 * screen is handed the acceptance payload rather than a session id. So Start
 * does the two calls SES-01 defines, in order — `accept` persists the session,
 * its sections, blocks and prescriptions in one transaction, and `start` moves
 * it `prescribed → active` — and only then navigates to `/workout`. Doing it
 * here rather than at generation is what makes the other action honest:
 *
 * **Regenerate discards, and a discard that left rows behind would not be one.**
 * A workout the user rejected has written nothing, so there is nothing to
 * abandon, nothing orphaned in `prescribed`, and no half-session for Home to
 * offer to resume (`ResumableSession` is explicit that a prescribed session
 * belongs to Review). The confirm is therefore about the composition rather
 * than about data: it is gone, and the next one will be different.
 *
 * The states are the ones this screen can actually be in. Its content is
 * given to it, so there is no read to be loading or to fail, and no empty case
 * at all — `generationOutputSchema` refuses a workout with no sections, which
 * is what IA.md §4 means by "empty: n/a" here. What *is* asynchronous is the
 * handoff: the CTA carries its own pending state, and a failed accept or start
 * is a blocking `ErrorDialog` rather than a toast, because a user who pressed
 * Start and got a screen that did not move has to be told why before they
 * press it again.
 *
 * **The one read is OVR-01c's, and it qualifies the briefing rather than
 * gating it.** The stored anchors and their evidence feed a per-prescription
 * suggested weight (`src/ui/load-suggestion.tsx`); while they load or after
 * they fail, the suggestion surface says so inline and everything else renders
 * and starts as normal. An override is folded into the payload `accept`
 * persists, through `applyLoadOverrides`, and no anchor is written here.
 *
 * Atmosphere is `full` and is the route's, not this screen's: `/review` is
 * already in `SCREEN_ATMOSPHERE`, so `RootLayout` resolves it from the pathname
 * the day the journey that owns this screen routes it.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  Info,
  Play,
  RefreshCw,
} from '../design-system/index'
import { useAnchorEvidenceQuery, useLoadAnchorsQuery } from '../state/anchor-queries'
import { useAuth } from '../state/auth-context'
import { createError, ErrorCode, isErr, type AppError } from '../state/errors'
import { reviewBriefing, type ReviewFact } from '../state/review'
import {
  applyLoadOverrides,
  reviewLoadSuggestions,
  type LoadOverride,
  type LoadOverrides,
  type LoadSuggestions,
} from '../state/load-suggestions'
import { useQueryClient } from '../state/query'
import type { SessionAcceptance, SessionSnapshot } from '../state/schemas'
import { ReviewSwapProvider } from '../state/swap-provider'
import { useProfileQuery } from '../state/user-queries'
import { activeSessionQueryKey, useWorkoutClients } from '../state/workout-queries'
import { ErrorDialog, ConfirmDialog } from '../ui/blocking-dialog'
import { Card } from '../ui/card'
import { ReviewSection } from '../ui/review-block'
import { ActionRow, PhoneFooter } from '../ui/composition'
import { EquipmentSummary, OverviewFacts } from '../ui/refinements/overview'
import {
  LoadSuggestionDialog,
  LoadSuggestionsStatus,
} from '../ui/load-suggestion'
import { WORKOUT_ROUTE } from './ActiveSessionPrompt'
import { Screen } from './Screen'

export const REVIEW_TITLE = 'Review'
export const START_LABEL = 'Start workout'
export const REGENERATE_LABEL = 'Regenerate'
/** The overview card's heading, inside it. */
export const OVERVIEW_LABEL = 'Overview'
export const FACTS_LABEL = 'Workout facts'

export interface ReviewProps {
  /**
   * The composed workout together with the facts it was composed under —
   * what the Generate → Loading journey assembled, and what `accept` sends.
   * One prop for all three of IA.md §2's entry paths: a fresh generation, a
   * regeneration and a favourite restart differ in where it came from.
   */
  readonly acceptance: SessionAcceptance
  /** Discards this composition and asks for another. Confirmed before it fires. */
  readonly onRegenerate: () => void
  /**
   * FAV-02's repeat surface, when this composition came from a favorite: what
   * happened the last times it was performed. A slot rather than a query,
   * because the history belongs to the favorite and this screen renders a
   * composition — a fresh generation has no such history, and passing nothing
   * is how it says so.
   */
  readonly progression?: ReactNode
  /** The persisted, running session — for a caller that has state to clear. */
  readonly onStarted?: (snapshot: SessionSnapshot) => void
}

export function Review({
  acceptance,
  onRegenerate,
  onStarted,
  progression = null,
}: ReviewProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { sessions } = useWorkoutClients()
  const queryCache = useQueryClient()

  // U37: the workout as the user has settled it, swaps included. It starts as
  // what generation composed and starts over when a new composition arrives;
  // everything below — the briefing, the suggestions and what Start persists —
  // reads this rather than the prop.
  const [held, setHeld] = useState(() => ({ source: acceptance, composition: acceptance }))
  const composition = held.source === acceptance ? held.composition : acceptance
  if (held.source !== acceptance) setHeld({ source: acceptance, composition: acceptance })

  // The profile's unit, for an `absolute` load. Null while the query is
  // settling and null when it failed: `reviewBriefing` states such a load
  // without a unit rather than in one guessed from a default, so a slow
  // profile read costs a suffix and never a wrong number.
  const profile = useProfileQuery()
  const weightUnit =
    profile.state.status === 'ready' ? (profile.state.data?.weight_unit ?? null) : null

  // OVR-01c. The two anchor reads feed the suggestion surface and nothing
  // else: while either is settling or has failed, the briefing renders and
  // Start works exactly as it would for a user with no history at all. The
  // numbers are `reviewLoadSuggestions`' — this screen does no arithmetic.
  const anchorsQuery = useLoadAnchorsQuery()
  const evidenceQuery = useAnchorEvidenceQuery()
  const anchorsState = anchorsQuery.state
  const evidenceState = evidenceQuery.state
  const suggestions: LoadSuggestions =
    anchorsState.status === 'ready' && evidenceState.status === 'ready'
      ? reviewLoadSuggestions({
          acceptance: composition,
          anchors: anchorsState.data,
          evidence: evidenceState.data,
          weightUnit,
        })
      : NO_SUGGESTIONS
  const suggestionsLoading =
    anchorsState.status === 'loading' || evidenceState.status === 'loading'
  const suggestionsError =
    anchorsState.status === 'error'
      ? anchorsState.error
      : evidenceState.status === 'error'
        ? evidenceState.error
        : null

  // Overrides live here and only here, until `accept` persists them as this
  // session's prescription. No anchor is written from this screen.
  const [overrides, setOverrides] = useState<LoadOverrides>(() => new Map())
  // Display and persist the same supported rep targets. Always derive from the
  // original composition so re-rendering/retrying never stacks the increase.
  const personalizedAcceptance = applyLoadOverrides(composition, NO_OVERRIDES, suggestions)
  const briefing = reviewBriefing(personalizedAcceptance, weightUnit)
  const [explaining, setExplaining] = useState<string | null>(null)
  const explained = explaining === null ? undefined : suggestions.get(explaining)

  function setOverride(key: string, override: LoadOverride | null) {
    setOverrides((current) => {
      const next = new Map(current)
      if (override === null) next.delete(key)
      else next.set(key, override)
      return next
    })
  }

  /**
   * A swapped slot keeps its sets, target and rest but not its load override:
   * that was a weight for the movement that is no longer there.
   */
  function swapped(next: SessionAcceptance, site: string) {
    setHeld({ source: acceptance, composition: next })
    setOverride(site, null)
    if (explaining === site) setExplaining(null)
  }

  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<AppError | null>(null)
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false)

  const userId = user?.id ?? null

  /**
   * The handoff. Not wrapped in `useCallback`: the compiler memoizes it, and a
   * hand-written dependency list here was one the compiler could not preserve —
   * which would have cost the whole component its optimization to save nothing.
   */
  async function start() {
    if (userId === null) {
      setFailure(createError(ErrorCode.AUTH_UNAUTHENTICATED))
      return
    }

    setStarting(true)
    setFailure(null)

    // Two calls, and the order is the requirement: there is no session to
    // start until acceptance has written one. A failure of either leaves the
    // user on this screen with the workout still in front of them — the
    // composition is in memory and is not lost by a write that did not land.
    const accepted = await sessions.accept(userId, applyLoadOverrides(personalizedAcceptance, overrides))
    if (isErr(accepted)) {
      setStarting(false)
      setFailure(accepted.error)
      return
    }

    const started = await sessions.start(accepted.value.session.id)
    if (isErr(started)) {
      setStarting(false)
      setFailure(started.error)
      return
    }

    // `Review` and `Workout` share the active-session query. Home may already
    // have cached the truthful pre-start answer (`null`), so navigating before
    // publishing the write's answer makes Workout immediately redirect Home.
    // Preserve the accepted structure and replace only the session/state that
    // `start_session` returned; this is the complete active snapshot Workout
    // needs, with no redundant round trip and no stale-cache race.
    const running: SessionSnapshot = {
      ...accepted.value,
      session: started.value.session,
      state: started.value.state,
    }
    queryCache.setData(activeSessionQueryKey(userId), running)
    onStarted?.(running)
    await navigate(WORKOUT_ROUTE)
  }

  return (
    <>
      <Screen
        title={REVIEW_TITLE}
        heading={briefing.title}
        header={{}}
        pinnedFoot={
          <PhoneFooter>
            {/* REQ-006: Start is the one pinned decision. Regenerate is read
                after the workout, at the end of the scrolling content. */}
            <ActionRow>
              <Button
                variant="primary"
                size="lg"
                icon={<Play />}
                loading={starting}
                onClick={() => void start()}
              >
                {START_LABEL}
              </Button>
            </ActionRow>
          </PhoneFooter>
        }
      >
      {/* U37: the one place a movement is swapped. Each row's control asks;
          the provider reads alternatives under the original constraints and
          hands back the revised composition. Its dialog sits beside the
          stack, with this screen's other dialogs. */}
      <ReviewSwapProvider
        userId={userId}
        original={acceptance}
        composition={composition}
        onSwapped={swapped}
        locked={starting}
      >
      <div
        className="clr-stack"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <ReviewOverview
          facts={briefing.facts}
          adjustment={briefing.adjustment}
          movementCount={briefing.movementCount}
          equipment={briefing.equipment}
        />

        {/* Above the sections, because it is context for the workout rather
            than part of the prescription: what happened last time is what a
            person reads before deciding how to attack it. */}
        {progression}

        {suggestionsLoading ? (
          <LoadSuggestionsStatus status="loading" />
        ) : suggestionsError !== null ? (
          <LoadSuggestionsStatus
            status="error"
            error={suggestionsError}
            onRetry={() => {
              if (anchorsState.status === 'error') anchorsQuery.refetch()
              if (evidenceState.status === 'error') evidenceQuery.refetch()
            }}
          />
        ) : null}

        {briefing.sections.map((section) => (
          <ReviewSection
            key={section.key}
            section={section}
            suggestions={suggestions}
            overrides={overrides}
            onExplain={setExplaining}
          />
        ))}

        {/* REQ-006: the way out of this composition, once it has been read.
            Discarding is confirmed and irreversible, so it is a framed button
            rather than a text action. */}
        <ActionRow>
          <Button
            variant="secondary"
            size="lg"
            icon={<RefreshCw />}
            disabled={starting}
            onClick={() => setConfirmingRegenerate(true)}
          >
            {REGENERATE_LABEL}
          </Button>
        </ActionRow>
      </div>
      </ReviewSwapProvider>

      {explained !== undefined && (
        <LoadSuggestionDialog
          open
          suggestion={explained}
          override={overrides.get(explained.key) ?? null}
          onClose={() => setExplaining(null)}
          onOverride={(override) => setOverride(explained.key, override)}
          onClearOverride={() => setOverride(explained.key, null)}
        />
      )}

      <RegenerateConfirmDialog
        open={confirmingRegenerate}
        onCancel={() => setConfirmingRegenerate(false)}
        onConfirm={() => {
          setConfirmingRegenerate(false)
          onRegenerate()
        }}
      />

      {failure !== null && (
        <ErrorDialog
          open
          error={failure}
          title="Couldn’t start this workout"
          actionLabel={START_LABEL}
          onRetry={() => void start()}
          onDismiss={() => setFailure(null)}
        />
      )}
      </Screen>
    </>
  )
}

/** One stable empty map, for a briefing whose anchor reads have not answered. */
const NO_SUGGESTIONS: LoadSuggestions = new Map()
const NO_OVERRIDES: LoadOverrides = new Map()

// ─────────────────────────────────────────────────────────────────────────────
// The overview
// ─────────────────────────────────────────────────────────────────────────────

export const MOVEMENTS_LABEL = 'Movements'

/** The equipment group's label and its all-bodyweight reading (`refinements/overview`). */
export { EQUIPMENT_LABEL, NO_EQUIPMENT_LABEL } from '../ui/refinements/overview'

export interface ReviewOverviewProps {
  facts: readonly ReviewFact[]
  adjustment: string | null
  movementCount: number
  equipment: readonly string[]
}

/**
 * The facts, in one card under its own heading, directly beneath the page's
 * title — the workout's own name. No generated overview sits above them
 * (REQ-010): the card states what the workout was composed under, not a
 * narrative about it.
 *
 * TASK-004 (C12, C13, G04, R74): the accepted Overview, drawn by the shared
 * owners in `src/ui/refinements/overview.tsx` — the glyph-led facts wrapping
 * with no carousel (the movement count has its glyph too, R33), intensity as
 * its value alone (R32), then the Required equipment group under its rule.
 * Inside the card the facts are bare; the card is the only frame here. The
 * saved workout's Overview draws the same `OverviewFacts` (C14, R20).
 */
export function ReviewOverview({ facts, adjustment, movementCount, equipment }: ReviewOverviewProps) {
  return (
    <Card heading={OVERVIEW_LABEL}>
      <OverviewFacts
        label={FACTS_LABEL}
        facts={[
          ...facts.map((fact) => ({ kind: fact.kind, term: fact.label, value: fact.value })),
          { kind: 'movements', term: MOVEMENTS_LABEL, value: String(movementCount) },
        ]}
      />

      <EquipmentSummary equipment={equipment} />

      {/* A clamp that moved the session says so in words and with a glyph. */}
      {adjustment !== null && (
        <p className="clr-text-data-xs" style={{ display: 'flex', gap: 'var(--spacing-200)' }}>
          <Info size={16} />
          {adjustment}
        </p>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A section
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A section of the briefing is `ReviewSection` (`src/ui/review-block.tsx`,
 * TASK-002): one card per block under the static header the live workout's
 * cards share, the section's name its semantic heading, always open (R37, C07).
 * Its optional tempo detail keeps its own disclosure; the label is re-exported
 * here for the screen's existing readers.
 */
export { TEMPO_DETAIL_LABEL } from '../ui/review-block'

// ─────────────────────────────────────────────────────────────────────────────
// Discarding
// ─────────────────────────────────────────────────────────────────────────────

export interface RegenerateConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  /** The safe exit: cancel, Esc and the backdrop all land here. */
  onCancel: () => void
}

/**
 * The question regenerating asks, in the words pattern 4 of the export's
 * `patterns.md` asks for: the title names the consequence, the body says
 * exactly what is lost, and the confirm repeats the verb.
 *
 * `critical` because it is irreversible — generation is not deterministic, so
 * the workout on screen cannot be got back — and the body says so rather than
 * leaving the frame to imply it. What it does *not* claim is that anything is
 * deleted: nothing was written, and a confirm that said "delete" would be
 * describing a different operation.
 */
export function RegenerateConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: RegenerateConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      critical
      title="Discard this workout?"
      confirmLabel="Discard and regenerate"
      cancelLabel="Keep it"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      This workout has not been saved, so nothing is lost from your history. It
      is gone from here, though: generating again composes a new one, and this
      one cannot be brought back.
    </ConfirmDialog>
  )
}
