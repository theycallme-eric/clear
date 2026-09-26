/**
 * `/review` — the route behind REV-01's screen, landed by FAV-01 because its
 * restart has nowhere else to go.
 *
 * `Review` has existed since TASK-042 and is complete: it takes an acceptance
 * payload, renders the briefing, and turns it into a session on Start. What it
 * did not have was a URL, because the journey that produces a *generated*
 * workout owns the hand-off into it and that journey is REV-01's. FAV-01 needs
 * the same screen for a different origin — a snapshot restored from a favorite,
 * which needs no generation state at all — so this route is deliberately the
 * narrowest thing that serves it:
 *
 *   · **The payload arrives as route state and is parsed on arrival.** History
 *     state is user-writable and survives reloads and deploys, so it is a
 *     boundary (`readReviewHandoff`), not an internal value.
 *   · **No handoff is not an error.** It is the absence of a workout to review,
 *     which is a thing to say plainly with the two ways to get one, rather than
 *     a retry for an operation that never happened. It is also *not* a redirect:
 *     Home navigates here the moment a generation succeeds, and a redirect back
 *     to Home would re-enter that effect and bounce between the two screens.
 *     REV-01 will supply the handoff for that path; until it does, arriving with
 *     nothing says so and stays put.
 *   · **The attempt row is written here, on Start.** `favorites.attempt` links
 *     the session Review just created to the favorite it came from, and that
 *     link is the only record of the session's provenance —
 *     `record_favorite_completion` stamps it when the workout finishes, which is
 *     what bumps `times_completed`. It is written after the session exists
 *     because it names the session's id, and its failure is not the start's
 *     failure: the user is in a workout either way, and a favorite counted one
 *     attempt short is a smaller harm than a workout refused at the door.
 *
 * Regenerating from here is Generate, not a generation call: this route holds
 * no GEN-03 state, so "discard this and compose another" means going to the
 * screen that composes one.
 */
import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { EmptyState, Zap } from '../design-system/index'
import {
  deloadInEffect,
  favoriteProgression,
  type FavoriteRun,
} from '../state/favorite-progression'
import { useFavoriteRunsQuery, useFavoritesQuery } from '../state/favorite-queries'
import { GENERATE_PATH } from '../state/generation-form'
import { readReviewHandoff } from '../state/review-handoff'
import {
  viewError,
  viewLoading,
  viewReady,
  type ViewState,
} from '../state/view-state'
import { useWorkoutClients } from '../state/workout-queries'
import { FavoriteProgressionCard } from '../ui/favorite-progression'
import { ViewStateSwitch } from '../ui/view-state'
import { Screen } from './Screen'
import { Review, REVIEW_TITLE } from './Review'

export const NO_REVIEW_TITLE = 'Nothing to review'
export const NO_REVIEW_MESSAGE =
  'This workout is no longer in hand. Generate a new one, or start one from your favorites.'

export function ReviewRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const { favorites } = useWorkoutClients()

  const handoff = readReviewHandoff(location.state)

  if (handoff === null) {
    return (
      <Screen title={REVIEW_TITLE} heading={NO_REVIEW_TITLE}>
        <EmptyState
          title={NO_REVIEW_TITLE}
          message={NO_REVIEW_MESSAGE}
          icon={<Zap size={24} />}
          actionLabel="Generate workout"
          onAction={() => void navigate(GENERATE_PATH)}
        />
      </Screen>
    )
  }

  const { acceptance, savedWorkoutId } = handoff

  return (
    <Review
      // Keyed by the composition, so arriving with a different workout is a
      // fresh briefing rather than the last one's pending state.
      key={`${savedWorkoutId ?? 'generated'}:${acceptance.date}`}
      acceptance={acceptance}
      progression={
        savedWorkoutId === null ? null : (
          <FavoriteProgressionPanel
            savedWorkoutId={savedWorkoutId}
            deload={deloadInEffect(acceptance)}
          />
        )
      }
      onRegenerate={() => void navigate(GENERATE_PATH)}
      onStarted={(snapshot) => {
        if (savedWorkoutId === null) return

        // Unawaited, and its failure deliberately unhandled: the session is
        // already running, and there is nothing useful to ask of a user who is
        // warming up. The counter is recomputed from the attempt rows on
        // completion, so a link that did not land under-counts one session
        // rather than corrupting the count.
        void favorites.attempt(savedWorkoutId, snapshot.session.id)
      }}
    />
  )
}

export const PROGRESSION_LOADING_LABEL = 'Reading what happened last time'
export const PROGRESSION_ERROR_TITLE = 'Your history for this one didn’t load'

/**
 * FAV-02 — the repeat surface for the favorite this composition came from.
 *
 * All four states, and the empty one is the interesting decision: a favorite
 * saved and never completed is not an absence of data to apologize for, it is a
 * fact about the favorite, so the card itself says so and the switch never
 * reaches `empty`. What *is* an absence is a read that failed — that gets the
 * error screen and its retry, because the numbers it would have shown are the
 * whole reason this surface exists and inventing a silent blank in their place
 * would be the screen deciding the user has no history.
 *
 * The true completion count comes from `saved_workouts.times_completed` rather
 * than from the runs read here, which are the most recent
 * `PROGRESSION_WINDOW` of them: the counter is the favorite's own answer, and a
 * window is not a count.
 */
function FavoriteProgressionPanel({
  savedWorkoutId,
  deload,
}: {
  savedWorkoutId: string
  deload: boolean
}) {
  const runs = useFavoriteRunsQuery(savedWorkoutId)
  const favorites = useFavoritesQuery()

  const loaded = runs.state.status === 'ready' ? runs.state.data : null

  const progression = useMemo(
    () => (loaded === null ? null : favoriteProgression(loaded, { deload })),
    [loaded, deload],
  )

  // The counter, when the favorites list is in hand. It usually is — the tab
  // the restart came from reads it — and when it is not, the runs that were
  // read are the honest fallback rather than a zero.
  const timesCompleted =
    (favorites.state.status === 'ready'
      ? favorites.state.data.find((row) => row.id === savedWorkoutId)?.times_completed
      : undefined) ?? loaded?.length

  const state: ViewState<readonly FavoriteRun[]> =
    runs.state.status === 'loading'
      ? viewLoading()
      : runs.state.status === 'error'
        ? viewError(runs.state.error)
        : viewReady(runs.state.data)

  return (
    <ViewStateSwitch
      state={state}
      loadingLabel={PROGRESSION_LOADING_LABEL}
      errorTitle={PROGRESSION_ERROR_TITLE}
      onRetry={runs.refetch}
      empty={null}
    >
      {() =>
        progression === null ? null : (
          <FavoriteProgressionCard
            progression={progression}
            timesCompleted={timesCompleted ?? 0}
          />
        )
      }
    </ViewStateSwitch>
  )
}
