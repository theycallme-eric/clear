/**
 * Home — `/` (HOME-01). The daily entry point.
 *
 * IA.md §4: atmosphere `full`, guard protected, and **all four states, on the
 * screen where it matters most**. Composition is the App Shell template
 * (`src/design-system/templates/app-shell/AppShell.dc.html`) read through the
 * IA's own line — `AppLayout › PageHeader + WeekStreakDisplay + Card(×2 quick
 * actions) + WorkoutListItem` — so the shell and its atmosphere are
 * `RootLayout`'s, `PageHeader` is `AppHeader` with the wordmark, and every
 * region below is a `Card`.
 *
 * **One read answers three questions.** The week strip, the recent three and
 * Quick Start's plan are all derivations of HIST-01's first page
 * (`src/state/home.ts`), asked for once through the shared `useHistoryQuery`
 * and never re-fetched per region. A region is not a query.
 *
 * Four behaviours here are the requirement rather than the layout:
 *
 *   1. **An unfinished workout is answered first.** `ResumableSession` is
 *      EXE-01's standing card, and resuming from it re-enters the shell at the
 *      section the session actually reached — the position is
 *      `workout-progress.ts`'s, never a number this screen keeps.
 *   2. **Quick Start is absent until there is something to repeat.** Not
 *      disabled, not defaulted: `quickStartPlan` answers `null` and the control
 *      is not rendered (IA.md §6). While the history is loading or failed there
 *      is no plan either, so a first-run Home and a Home that could not read
 *      the history both offer exactly one action, and it is Generate.
 *   3. **Quick Start generates immediately.** It skips `/generate` and sends
 *      the last completed session's own request through GEN-03, watched on
 *      GEN-05's loading screen. A failure is that screen's pattern-3 handoff —
 *      a typed error and one honest recovery action — never a workout.
 *   4. **The recents link into the chronology.** Each of the three opens
 *      HIST-01's detail for that session.
 *   5. **The suggestion is read off the same rows, and it is refusable.**
 *      HOME-03's least-recently-trained focus and history-averaged intensity
 *      (`src/state/session-suggestion.ts`) are a fourth derivation of the one
 *      read, not a fifth request. Taking it opens `/generate` prefilled with the
 *      anchor and intensity; dismissing it leaves Generate on its defaults, and
 *      too little history produces no suggestion rather than a plausible one.
 *
 * Three destinations Home names are declared in `SCREEN_ATMOSPHERE` and routed
 * by requirements that have not landed yet — `/generate` (GEN-04), `/review`
 * (REV-01) and `/history/:id` (HIST-01's detail screen). They are linked by the
 * IA's own paths, exactly as `src/app/atmosphere.ts` anticipates, rather than
 * replaced by a control that does something else; carrying a generated workout
 * across the hand-off into Review is REV-01's to own, because GEN-03's state
 * belongs to whoever owns the Generate → Loading → Review journey and that
 * owner is not this screen once Review exists.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  AppHeader,
  Button,
  ClearLogo,
  EmptyState,
  Streak as StreakGlyph,
  Zap,
} from '../design-system/index'
import { useGeneration } from '../state/generation'
import { GENERATE_PATH } from '../state/generation-form'
import {
  daysTrained,
  quickStartPlan,
  recentWorkouts,
  sessionDetailPath,
  WEEK_STRIP_DAYS,
  weekStrip,
  type QuickStartPlan,
  type WeekDay,
} from '../state/home'
import type { HistorySessionEntry } from '../state/history'
import { useHistoryQuery, type HistoryQuery } from '../state/history-queries'
import type { WorkoutSessionRow } from '../state/schemas'
import {
  defaultSuggestionStorage,
  suggestSession,
  suggestionDay,
  suggestionDismissed,
  writeSuggestionDismissal,
  type SessionSuggestion,
} from '../state/session-suggestion'
import { useStreakQuery } from '../state/summary-queries'
import type { Streak } from '../state/streak'
import {
  viewEmpty,
  viewError,
  viewLoading,
  viewReady,
  type ViewState,
} from '../state/view-state'
import { Card } from '../ui/card'
import { Heading } from '../ui/Heading'
import { WorkoutListItem } from '../ui/history-list'
import { ViewStateSwitch } from '../ui/view-state'
import { WeekStrip } from '../ui/week-strip'
import { GenerationLoading } from './GenerationLoading'
import { ResumableSession } from './ResumableSession'
import { Screen } from './Screen'

/** IA.md §4's out-edges from Home. Each lands with the screen behind it. */
export const GENERATE_ROUTE = GENERATE_PATH
export const REVIEW_ROUTE = '/review'

/** The template's own h1 — the screen is "Today", the app is the wordmark. */
export const HOME_HEADING = 'Today'

export const WEEK_STRIP_LABEL = 'This week'
export const RECENT_WORKOUTS_LABEL = 'Recent workouts'
export const SUGGESTION_LABEL = 'Suggested next'

/** HOME-03's empty state: what is missing, not a focus guessed from too little. */
export const SUGGESTION_EMPTY =
  'Not enough history yet to suggest a focus. Finish a few sessions and this will say what you have been neglecting.'

export function Home() {
  const history = useHistoryQuery()
  const generation = useGeneration()
  const navigate = useNavigate()

  const sessions: readonly WorkoutSessionRow[] | null =
    history.state.status === 'ready' ? history.state.data.sessions : null

  // Derived once per answer rather than per render: three walks over the same
  // page, and the page only changes when the read does.
  const week = useMemo(() => weekStrip(sessions ?? []), [sessions])
  const recents = useMemo(() => recentWorkouts(sessions ?? []), [sessions])
  const plan = useMemo(
    () => (sessions === null ? null : quickStartPlan(sessions)),
    [sessions],
  )
  const suggestion = useMemo(
    () => (sessions === null ? null : suggestSession(sessions)),
    [sessions],
  )

  // The hand-off. A generated workout is Review's to render, and Review is the
  // route the IA sends it to; nothing is dropped here, because the mutation's
  // success state is the only place the workout exists (GEN-03).
  const generated = generation.state.status === 'success'
  useEffect(() => {
    if (!generated) return
    void navigate(REVIEW_ROUTE)
  }, [generated, navigate])

  // GEN-05's screen is transient and has no route of its own: while a
  // generation Home started is in flight — or has failed and is being answered
  // — it *is* the screen, and cancelling puts Home back.
  if (generation.state.status === 'pending' || generation.state.status === 'error') {
    return (
      <GenerationLoading
        state={generation.state}
        stage={generation.stage}
        onCancel={generation.cancel}
        onRetry={generation.retry}
      />
    )
  }

  return (
    <>
      <AppHeader actions={<Link to="/settings">Settings</Link>}>
        <ClearLogo size="md" />
      </AppHeader>
      <Screen title="CLEAR" heading={HOME_HEADING}>
        <div className="clr-stack">
          <TrainingWeek query={history} week={week} />

          {/* EXE-01: a workout the user left the app in the middle of is the
              first thing Home has to answer for, and it answers in the page. */}
          <ResumableSession />

          {/* HOME-03: what history says is overdue, before the actions that
              would compose it. Dismissing it is the same absence Quick Start's
              null plan is — the card is not rendered, and Generate opens on its
              own defaults. */}
          <SuggestedSession query={history} suggestion={suggestion} />

          <QuickActions
            plan={plan}
            onQuickStart={() => {
              if (plan !== null) generation.generate(plan.input)
            }}
          />

          <RecentWorkouts query={history} entries={recents} />
        </div>
      </Screen>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The week
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The seven-day strip, and the streak above it.
 *
 * The strip is drawn in every state that has days to draw — a week with no
 * sessions is still a week, and blanking it would lose the "upcoming" half of
 * what the requirement asks it to render. What the four states change is what
 * the strip is *told*: nothing yet, nothing this week, this is what happened,
 * or the read failed and here is the retry.
 */
function TrainingWeek({ query, week }: { query: HistoryQuery; week: readonly WeekDay[] }) {
  const trained = daysTrained(week)

  const state: ViewState<readonly WeekDay[]> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : trained === 0
          ? viewEmpty()
          : viewReady(week)

  return (
    <Card>
      <div className="clr-stack clr-stack--tight">
        <Heading>This week</Heading>
        <StreakCount />
        <ViewStateSwitch
          state={state}
          loadingLabel="Reading your training week"
          errorTitle="This week didn’t load"
          onRetry={query.refetch}
          empty={
            <>
              <WeekStrip days={week} label={WEEK_STRIP_LABEL} />
              <p style={{ margin: 0 }}>No sessions this week yet.</p>
            </>
          }
        >
          {(days) => (
            <>
              <WeekStrip days={days} label={WEEK_STRIP_LABEL} />
              <p style={{ margin: 0 }}>
                {trained} of {WEEK_STRIP_DAYS} days trained.
              </p>
            </>
          )}
        </ViewStateSwitch>
      </div>
    </Card>
  )
}

/**
 * SES-01c's count, on its own read and with its own four states — the same
 * independence the debrief keeps: a streak that did not load must not cost the
 * user the rest of Home. Its rules stay `deriveStreak`'s; HOME-02 is where
 * pauses and rest-day allowances attach to them.
 */
function StreakCount() {
  const query = useStreakQuery()

  const state: ViewState<Streak> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : query.state.data.days === 0
          ? viewEmpty()
          : viewReady(query.state.data)

  return (
    <ViewStateSwitch
      state={state}
      loadingLabel="Reading your streak"
      errorTitle="Your streak didn’t load"
      onRetry={query.refetch}
      empty={<p style={{ margin: 0 }}>No streak yet. Sessions on consecutive days build one.</p>}
    >
      {(streak) => (
        <p style={STREAK_STYLE}>
          <span aria-hidden="true" style={{ display: 'flex' }}>
            <StreakGlyph size={16} />
          </span>
          Current streak: {streak.days} {streak.days === 1 ? 'day' : 'days'}
          {streak.includesToday ? '' : ', through yesterday'}
        </p>
      )}
    </ViewStateSwitch>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// What to train next (HOME-03)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The suggestion, with the reason it is being made and two ways to answer it.
 *
 * Four states, on the same read as everything else on this screen. The one
 * worth naming is **empty**: a history too thin to name a least-recently-trained
 * focus produces no focus at all, and the card says that rather than showing a
 * plausible one. `suggestSession` answers `null`, and a guess is the thing this
 * state exists to refuse.
 *
 * Dismissal is `localStorage`, keyed to today. It is not a preference — tomorrow
 * has a different suggestion and asks again — and losing it costs the user one
 * card they can dismiss again, which is why an unavailable store is ignored
 * rather than handled. `Use this` is the *only* thing that prefills: the path it
 * navigates to carries the anchor and the intensity, so dismissing and pressing
 * Generate opens the form on its defaults with nothing of the suggestion in it.
 */
function SuggestedSession({
  query,
  suggestion,
}: {
  query: HistoryQuery
  suggestion: SessionSuggestion | null
}) {
  const navigate = useNavigate()
  const storage = useMemo(() => defaultSuggestionStorage(), [])
  const [dismissed, setDismissed] = useState(() => suggestionDismissed(storage))

  const dismiss = useCallback(() => {
    writeSuggestionDismissal(storage, suggestionDay())
    setDismissed(true)
  }, [storage])

  if (dismissed) return null

  const state: ViewState<SessionSuggestion> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : suggestion === null
          ? viewEmpty()
          : viewReady(suggestion)

  return (
    <Card>
      <div className="clr-stack clr-stack--tight">
        <Heading>{SUGGESTION_LABEL}</Heading>
        <ViewStateSwitch
          state={state}
          loadingLabel="Reading what you have been training"
          errorTitle="Your suggestion didn’t load"
          onRetry={query.refetch}
          empty={<p style={{ margin: 0 }}>{SUGGESTION_EMPTY}</p>}
        >
          {(next) => (
            <>
              <p style={{ margin: 0 }}>
                {next.focusLabel} · intensity {next.intensity}
              </p>
              {/* The reason is pattern-level on purpose: "no hinge in 11 days"
                  is a fact about training, "no lower body" is a fact about
                  labels. */}
              <p style={{ margin: 0 }}>
                {next.reason} {next.intensityReason}
              </p>
              <div className="clr-row" style={SUGGESTION_ACTIONS}>
                <Button variant="secondary" onClick={() => void navigate(next.path)}>
                  Use this
                </Button>
                <Button variant="quiet" onClick={dismiss}>
                  Dismiss
                </Button>
              </div>
            </>
          )}
        </ViewStateSwitch>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The two actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate, always — and Quick Start only when there is a session to repeat.
 *
 * Not a data-driven view of its own: Generate is available whatever the history
 * says, including while it is still being read, so this card has no loading
 * state to render. The absence of Quick Start is the requirement, and it is
 * expressed as absence.
 */
function QuickActions({
  plan,
  onQuickStart,
}: {
  plan: QuickStartPlan | null
  onQuickStart: () => void
}) {
  const navigate = useNavigate()

  return (
    <Card barWidth="lg">
      <div className="clr-stack">
        <Heading>Train today</Heading>
        <p style={{ margin: 0 }}>
          Compose a session from how you feel today, or repeat the last one.
        </p>
        <Button
          variant="primary"
          size="lg"
          icon={<Zap />}
          onClick={() => void navigate(GENERATE_ROUTE)}
        >
          Generate workout
        </Button>

        {plan !== null && (
          <>
            <Button variant="secondary" onClick={onQuickStart}>
              Quick start
            </Button>
            {/* What repeating actually asks for, stated before it is sent: the
                same focus, minutes and intensity that session was requested
                with, at the same place. */}
            <p style={{ margin: 0 }}>
              Repeats {plan.title}: {plan.summary}
              {plan.goalLabel === null ? '' : ` · ${plan.goalLabel} goal`}.
            </p>
          </>
        )}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The recent three
// ─────────────────────────────────────────────────────────────────────────────

function RecentWorkouts({
  query,
  entries,
}: {
  query: HistoryQuery
  entries: readonly HistorySessionEntry[]
}) {
  const state: ViewState<readonly HistorySessionEntry[]> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : entries.length === 0
          ? viewEmpty()
          : viewReady(entries)

  return (
    <Card>
      <div className="clr-stack clr-stack--tight">
        <Heading>Recent workouts</Heading>
        <ViewStateSwitch
          state={state}
          loadingLabel="Reading your recent workouts"
          errorTitle="Your recent workouts didn’t load"
          onRetry={query.refetch}
          empty={
            <EmptyState
              title="No workouts yet"
              message="The workouts you finish appear here, newest first."
            />
          }
        >
          {(recents) => (
            <ul
              aria-label={RECENT_WORKOUTS_LABEL}
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'grid',
                gap: 'var(--spacing-300)',
              }}
            >
              {recents.map((entry) => (
                <li key={entry.key}>
                  <WorkoutListItem entry={entry} to={sessionDetailPath(entry.id)} />
                </li>
              ))}
            </ul>
          )}
        </ViewStateSwitch>
      </div>
    </Card>
  )
}

/** The two answers side by side, wrapping on a narrow phone. */
const SUGGESTION_ACTIONS: CSSProperties = {
  flexWrap: 'wrap',
  gap: 'var(--spacing-100)',
}

const STREAK_STYLE: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-100)',
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
}
