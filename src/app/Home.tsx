/**
 * Home — `/` (HOME-01). The daily entry point.
 *
 * IA.md §4: atmosphere `full`, guard protected, and **all four states, on the
 * screen where it matters most**. Composition is the App Shell template
 * (`src/design-system/templates/app-shell/AppShell.dc.html`) read through the
 * IA's own line — `AppLayout › PageHeader + Card(Train Today/active) +
 * Card(This Week/rest) + TabbedPanel` — so the shell and its atmosphere are
 * `RootLayout`'s, `PageHeader` is `AppHeader` with the wordmark, semantic daily
 * regions use Cards, and collections use the system tab band and list frame.
 *
 * **One read answers three questions.** The week strip, the recent three and
 * Quick Start's plan are all derivations of HIST-01's first page
 * (`src/state/home.ts`), asked for once through the shared `useHistoryQuery`
 * and never re-fetched per region. A region is not a query.
 *
 * Four behaviours here are the requirement rather than the layout:
 *
 *   1. **Train Today is answered first.** `ResumableSession` owns that slot:
 *      an unfinished workout replaces the ordinary actions rather than adding
 *      another card. Resuming re-enters the shell at the section the session
 *      actually reached — the position is
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
 *      The Goal it sends is the profile's standing one (REQ-010), not that
 *      session's snapshot: the reused intensity is clamped to it, the label
 *      names it, and a missing or legacy Goal sends nothing and points at
 *      Settings. While the profile is loading or failed there is no plan.
 *   4. **The recents link into the chronology.** A completed compatible row
 *      opens its stored prescription in Review; every other row falls back to
 *      HIST-01's durable detail for that session.
 *   5. **The suggestion is read off the same rows, and it is refusable.**
 *      HOME-03's least-recently-trained focus and history-averaged intensity
 *      (`src/state/session-suggestion.ts`) are a fourth derivation of the one
 *      read, not a fifth request. Taking it opens `/generate` prefilled with the
 *      anchor and intensity; dismissing it leaves Generate on its defaults, and
 *      too little history produces no suggestion rather than a plausible one.
 *
 *   6. **Favorites are a tab here, and starting one is a restore.** FAV-01's
 *      list sits beside the recents on its own read, and its Start control
 *      parses the saved snapshot and carries the resulting acceptance payload
 *      to `/review` as route state. No generation call is made and no row is
 *      written on the way — Review's own Start is where the session begins to
 *      exist, exactly as it is for a generated workout.
 *
 * Recent workouts retain `/history/:id` as their durable fallback and use the
 * same direct-Review resolver as History. Favorites restore through their own
 * saved snapshot path. Neither entry makes a generation request.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useHref, useLinkClickHandler, useNavigate, type To } from 'react-router-dom'

import {
  AlertCircle,
  AppHeader,
  Button,
  ClearLogo,
  Play,
  Streak as StreakGlyph,
  TabBar,
  TabPanel,
  TextAction,
  Zap,
} from '../design-system/index'
import { useFavoritesQuery } from '../state/favorite-queries'
import {
  favoriteEntries,
  isOutdatedSnapshot,
  OUTDATED_SNAPSHOT_MESSAGE,
  restore,
  todayLocal,
  type FavoriteEntry,
} from '../state/favorites'
import { useGeneration } from '../state/generation'
import { GENERATE_PATH } from '../state/generation-form'
import {
  daysTrained,
  QUICK_START_SETTINGS_LABEL,
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
import { isErr } from '../state/errors'
import {
  useMarkRestDay,
  useRestDaysQuery,
} from '../state/rest-day-queries'
import {
  REST_DAY_REASONS,
  REST_DAY_REASON_EFFECTS,
  REST_DAY_REASON_LABELS,
  restDayIndex,
} from '../state/rest-days'
import { reviewHandoff } from '../state/review-handoff'
import type { RestDayReason, SavedWorkoutRow, WorkoutSessionRow } from '../state/schemas'
import {
  defaultSuggestionStorage,
  suggestSession,
  suggestionDay,
  suggestionDismissed,
  writeSuggestionDismissal,
  type SessionSuggestion,
} from '../state/session-suggestion'
import { useStreakQuery } from '../state/summary-queries'
import { useProfileQuery } from '../state/user-queries'
import type { Streak } from '../state/streak'
import {
  viewEmpty,
  viewError,
  viewLoading,
  viewReady,
  type ViewState,
} from '../state/view-state'
import {
  isActiveSession,
  useActiveSessionQuery,
  useWorkoutClients,
} from '../state/workout-queries'
import { ConfirmDialog } from '../ui/blocking-dialog'
import { Card } from '../ui/card'
import {
  ActionRow,
  ListMessage,
  PhoneFooter,
  TabBand,
} from '../ui/composition'
import { FavoriteList } from '../ui/favorite-list'
import { HeadingSection } from '../ui/Heading'
import { HistoryList } from '../ui/history-list'
import { useArrivalStagger } from '../ui/motion'
import { Select } from '../ui/select'
import { ViewStateSwitch } from '../ui/view-state'
import { WeekStrip } from '../ui/week-strip'
import { GenerationLoadingHost } from './GenerationLoadingHost'
import { ResumableSession } from './ResumableSession'
import { Screen } from './Screen'
import { WORKOUT_ROUTE } from './ActiveSessionPrompt'
import { useOpenHistorySession } from './useOpenHistorySession'

/** Home's own path: where cancelling a Quick Start run returns. */
export const HOME_ROUTE = '/'

/** IA.md §4's out-edges from Home. Each lands with the screen behind it. */
export const GENERATE_ROUTE = GENERATE_PATH
export const REVIEW_ROUTE = '/review'
export const HISTORY_ROUTE = '/history'
export const SETTINGS_ROUTE = '/settings'

/** The Recent panel's way into the whole chronology. */
export const VIEW_HISTORY_LABEL = 'View history'

/** The template's own h1 — the screen is "Today", the app is the wordmark. */
export const HOME_HEADING = 'Today'

/** The daily groups, each named inside its own card. */
export const TRAIN_TODAY_LABEL = 'Train today'
export const WEEK_STRIP_LABEL = 'This week'
export const REST_DAY_LABEL = 'Rest day'
export const RECENT_WORKOUTS_LABEL = 'Recent workouts'
export const SUGGESTION_LABEL = 'Suggested next'

/** FAV-01's tab, beside the recents, on the one read each of them needs. */
export const FAVORITES_LABEL = 'Favorites'
export const FAVORITES_EMPTY =
  'No favorites yet. Save a workout from its summary and it appears here, ready to start again.'

export function Home() {
  const history = useHistoryQuery()
  const restDays = useRestDaysQuery()
  const profile = useProfileQuery()
  const activeSession = useActiveSessionQuery()
  const generation = useGeneration()
  const navigate = useNavigate()

  const resumable =
    activeSession.state.status === 'ready' &&
    activeSession.state.data !== null &&
    isActiveSession(activeSession.state.data)
      ? activeSession.state.data
      : null

  const sessions: readonly WorkoutSessionRow[] | null =
    history.state.status === 'ready' ? history.state.data.sessions : null

  // Derived once per answer rather than per render: three walks over the same
  // page, and the page only changes when the read does.
  const marks = useMemo(
    () =>
      restDays.state.status === 'ready'
        ? restDayIndex(restDays.state.data)
        : null,
    [restDays.state],
  )
  const week = useMemo(
    () => weekStrip(sessions ?? [], { restDays: marks ?? undefined }),
    [marks, sessions],
  )
  const recents = useMemo(() => recentWorkouts(sessions ?? []), [sessions])
  // The standing Goal is the profile's, read now — never the one the last
  // session was stored with. `undefined` is "not known": while the profile is
  // loading or failed there is no plan, so nothing generates on a guess.
  const standingGoal =
    profile.state.status === 'ready'
      ? (profile.state.data?.goal_preset ?? null)
      : undefined
  const plan = useMemo(
    () =>
      sessions === null || standingGoal === undefined
        ? null
        : quickStartPlan(sessions, standingGoal),
    [sessions, standingGoal],
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
    if (!generated || generation.state.status !== 'success') return
    void navigate(REVIEW_ROUTE, {
      state: reviewHandoff(generation.state.acceptance),
    })
  }, [generated, generation.state, navigate])

  // GEN-05's screen is transient and has no route of its own: while a
  // generation Home started is in flight — or has failed and is being answered
  // — the shared host makes it the screen, and cancelling puts Home back.
  return (
    <GenerationLoadingHost generation={generation} cancelTo={HOME_ROUTE}>
      <AppHeader actions={<Link to={SETTINGS_ROUTE}>Settings</Link>}>
        <ClearLogo size="md" />
      </AppHeader>
      <Screen
        title="CLEAR"
        heading={HOME_HEADING}
        pinnedFoot={
          <PhoneFooter>
            <ActionRow>
              <Button
                variant="primary"
                size="lg"
                icon={resumable === null ? <Zap /> : <Play />}
                onClick={() =>
                  void navigate(resumable === null ? GENERATE_ROUTE : WORKOUT_ROUTE)
                }
              >
                {resumable === null ? 'Generate workout' : 'Resume workout'}
              </Button>
            </ActionRow>
          </PhoneFooter>
        }
      >
        <ArrivingStack>
          {/* One top slot: an active workout replaces Train Today, while an
              empty active-session read renders the ordinary actions. */}
          <ResumableSession
            query={activeSession}
            fallback={
              <QuickActions
                plan={plan}
                query={history}
                suggestion={suggestion}
                onQuickStart={() => {
                  if (plan !== null && plan.input !== null) {
                    generation.generate(plan.input)
                  }
                }}
              />
            }
          />

          <TrainingWeek query={history} restDays={restDays} week={week} />

          {/* FAV-01: the favorites tab lives beside the recents rather than in
              a screen of its own. Both are lists of workouts the user has
              already done, and the tab is the IA's answer to which one they
              are looking at. */}
          <WorkoutTabs query={history} entries={recents} />
        </ArrivingStack>
      </Screen>
    </GenerationLoadingHost>
  )
}

/**
 * Home's groups, arriving as one set: 40ms apart, once. The stagger is the
 * screen's and not a region's, so a group that re-renders or a tab that
 * changes is an inline update and nothing arrives twice.
 */
function ArrivingStack({ children }: { children: ReactNode }) {
  const { className, ...arrival } = useArrivalStagger()

  return (
    <div {...arrival} className={['clr-stack', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}

/**
 * A quiet way to another screen: the public `TextAction` as a real link, with
 * the router's own click handling so it navigates in place and a modified
 * click still opens a tab.
 */
function RouteAction({ to, children }: { to: To; children: ReactNode }) {
  const href = useHref(to)
  const follow = useLinkClickHandler<HTMLAnchorElement>(to)

  return (
    <TextAction
      href={href}
      onClick={(event) => follow(event as MouseEvent<HTMLAnchorElement>)}
    >
      {children}
    </TextAction>
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
function TrainingWeek({
  query,
  restDays,
  week,
}: {
  query: HistoryQuery
  restDays: ReturnType<typeof useRestDaysQuery>
  week: readonly WeekDay[]
}) {
  const trained = daysTrained(week)

  const state: ViewState<readonly WeekDay[]> =
    query.state.status === 'loading' || restDays.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : restDays.state.status === 'error'
          ? viewError(restDays.state.error)
        : trained === 0
          ? viewEmpty()
          : viewReady(week)

  return (
    <Card heading={WEEK_STRIP_LABEL}>
      <div className="clr-stack clr-stack--tight">
        <StreakCount />
        <ViewStateSwitch
          state={state}
          loadingLabel="Reading your training week"
          errorTitle="This week didn’t load"
          onRetry={() => {
            query.refetch()
            restDays.refetch()
          }}
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
        <RestDayControl
          today={week.find((day) => day.isToday)}
          available={restDays.state.status === 'ready'}
        />
      </div>
    </Card>
  )
}

/** HOME-02's one marking affordance, on Home and nowhere else. */
function RestDayControl({
  today,
  available,
}: {
  today: WeekDay | undefined
  available: boolean
}) {
  const write = useMarkRestDay()
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState<RestDayReason>('rest')
  const [failure, setFailure] = useState(false)
  const [saved, setSaved] = useState(false)

  // A performed workout wins over a mark in the strip and makes marking rest
  // nonsensical, so the affordance is absent rather than disabled.
  if (today === undefined || today.state === 'workout' || !available) return null

  const begin = () => {
    setReason(today.reason ?? 'rest')
    setFailure(false)
    setSaved(false)
    setEditing(true)
  }

  const save = async () => {
    setFailure(false)
    const result = await write.mark({ day: today.day, reason, note: null })
    if (isErr(result)) {
      setFailure(true)
      return
    }

    setEditing(false)
    setSaved(true)
  }

  return (
    // Inside the week's card this is a ruled sub-group, one level under it.
    <HeadingSection aria-label={REST_DAY_LABEL}>
      <Card heading={REST_DAY_LABEL}>
        {today.reason === null ? (
          <p style={{ margin: 0 }}>
            Not training today? Mark why so your streak follows the right rule.
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            Today is marked: {REST_DAY_REASON_LABELS[today.reason]}.
          </p>
        )}

        {saved && <p role="status" style={{ margin: 0 }}>Rest day saved.</p>}
        {failure && (
          <p role="alert" style={{ margin: 0, color: 'var(--text-negative)' }}>
            The rest day wasn’t saved. Try again.
          </p>
        )}

        {!editing ? (
          <Button variant="secondary" onClick={begin}>
            {today.reason === null ? 'Mark Rest Day' : 'Change reason'}
          </Button>
        ) : (
          <>
            <Select
              label="Reason"
              value={reason}
              options={REST_DAY_REASONS.map((value) => ({
                value,
                label: REST_DAY_REASON_LABELS[value],
              }))}
              helperText={REST_DAY_REASON_EFFECTS[reason]}
              onChange={(value) => setReason(value as RestDayReason)}
            />
            <div className="clr-row">
              <Button variant="primary" loading={write.marking} onClick={() => void save()}>
                Save rest day
              </Button>
              <Button variant="quiet" disabled={write.marking} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Card>
    </HeadingSection>
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
 * The suggestion, with the reason it is being made and two ways to answer it,
 * lives inside Train Today. It is a prompt that informs the action, not a
 * peer card competing with the action.
 *
 * It uses the same history read as everything else on this screen. Thin history
 * produces no prompt at all: `suggestSession` answers `null`, and a guessed
 * focus would be worse than an absent prompt. A failed read stays recoverable
 * inline without manufacturing another Home card.
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

  if (dismissed || query.state.status === 'loading') return null

  if (query.state.status === 'error') {
    return (
      <div role="alert" className="clr-stack clr-stack--tight">
        <p style={{ margin: 0 }}>Your suggestion didn’t load.</p>
        <Button variant="quiet" onClick={query.refetch}>Retry suggestion</Button>
      </div>
    )
  }

  if (suggestion === null) return null

  return (
    <HeadingSection aria-label={SUGGESTION_LABEL}>
      <Card heading={SUGGESTION_LABEL}>
        <p style={{ margin: 0 }}>
          {suggestion.focusLabel} · intensity {suggestion.intensity}
        </p>
        {/* The reason is pattern-level on purpose: "no hinge in 11 days"
            is a fact about training, "no lower body" is a fact about labels. */}
        <p style={{ margin: 0 }}>
          {suggestion.reason} {suggestion.intensityReason}
        </p>
        <div className="clr-row" style={SUGGESTION_ACTIONS}>
          <Button variant="secondary" onClick={() => void navigate(suggestion.path)}>
            Use this
          </Button>
          <Button variant="quiet" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </Card>
    </HeadingSection>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The two actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The semantic Train Today context, plus Quick Start when there is a session
 * to repeat. Generate itself is Home's measured primary footer action.
 *
 * Not a data-driven view of its own: Generate is available whatever the history
 * says, including while it is still being read, so this card has no loading
 * state to render. The absence of Quick Start is the requirement, and it is
 * expressed as absence.
 */
function QuickActions({
  plan,
  query,
  suggestion,
  onQuickStart,
}: {
  plan: QuickStartPlan | null
  query: HistoryQuery
  suggestion: SessionSuggestion | null
  onQuickStart: () => void
}) {
  // Set by activating Quick Start on a Goal it cannot use; the refusal is an
  // answer to that press, not a standing notice on the card.
  const [refused, setRefused] = useState(false)
  const refusal = refused ? (plan?.refusal ?? null) : null

  return (
    <Card heading={TRAIN_TODAY_LABEL}>
      <div className="clr-stack">
        <p style={{ margin: 0 }}>
          Compose a session from how you feel today, or repeat the last one.
        </p>
        <SuggestedSession query={query} suggestion={suggestion} />
        {plan !== null && (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (plan.input === null) setRefused(true)
                else onQuickStart()
              }}
            >
              Quick start
            </Button>
            {/* What repeating actually asks for, stated before it is sent: the
                same focus and minutes that session was requested with, at the
                same place — under the standing Goal, with the intensity that
                Goal allows. */}
            <p style={{ margin: 0 }}>
              Repeats {plan.title}: {plan.summary}
              {plan.goalLabel === null ? '' : ` · ${plan.goalLabel} goal`}.
            </p>
            {refusal !== null && (
              <div role="alert" className="clr-stack clr-stack--tight">
                <p style={QUICK_START_REFUSAL_STYLE}>
                  <span aria-hidden="true" style={{ display: 'flex' }}>
                    <AlertCircle size={16} />
                  </span>
                  {refusal}
                </p>
                <RouteAction to={SETTINGS_ROUTE}>{QUICK_START_SETTINGS_LABEL}</RouteAction>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The recent three, and the favorites beside them (FAV-01)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two lists of workouts already done, one tab each.
 *
 * Tabs rather than two stacked cards because the two answer the same question
 * from different sides — what happened lately, and what the user chose to keep
 * — and a phone screen that showed both at once would bury the second. The
 * tablist is the export's `TabBar`, so the ARIA tabs pattern, its keyboard
 * behaviour and its overflow are the design system's rather than this screen's.
 *
 * The panels do **not** share a query. Recents are a derivation of HIST-01's
 * page, which Home already read; favorites are their own read, for the same
 * reason the streak is: a favorites list that failed must not cost the user
 * their recents.
 */
function WorkoutTabs({
  query,
  entries,
}: {
  query: HistoryQuery
  entries: readonly HistorySessionEntry[]
}) {
  const [active, setActive] = useState(0)
  const idBase = 'home-workout-tabs'

  return (
    <div className="clr-stack clr-stack--tight">
      <TabBand>
        <TabBar
          tabs={[RECENT_WORKOUTS_LABEL, FAVORITES_LABEL]}
          active={active}
          onChange={setActive}
          idBase={idBase}
        />
      </TabBand>
        <TabPanel idBase={idBase} index={0} active={active}>
          <RecentWorkouts query={query} entries={entries} />
        </TabPanel>
        <TabPanel idBase={idBase} index={1} active={active}>
          <FavoriteWorkouts />
        </TabPanel>
    </div>
  )
}

function RecentWorkouts({
  query,
  entries,
}: {
  query: HistoryQuery
  entries: readonly HistorySessionEntry[]
}) {
  const session = useOpenHistorySession()
  const state: ViewState<readonly HistorySessionEntry[]> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : entries.length === 0
          ? viewEmpty()
          : viewReady(entries)

  return (
    // The recents are the head of the chronology; the whole of it is one quiet
    // action away in every state, because History answers its own empty and
    // error rather than inheriting these.
    <Card
      heading={RECENT_WORKOUTS_LABEL}
      meta={<RouteAction to={HISTORY_ROUTE}>{VIEW_HISTORY_LABEL}</RouteAction>}
    >
      <ViewStateSwitch
        state={state}
        loadingLabel="Reading your recent workouts"
        errorTitle="Your recent workouts didn’t load"
        onRetry={query.refetch}
        empty={
          <ListMessage
            title="No workouts yet"
            message="The workouts you finish appear here, newest first."
          />
        }
      >
        {(recents) => (
          <HistoryList
            entries={recents}
            label={RECENT_WORKOUTS_LABEL}
            linkTo={(entry) => sessionDetailPath(entry.id)}
            onOpen={(entry) => void session.open(entry)}
            openingId={session.openingId}
          />
        )}
      </ViewStateSwitch>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Favorites (FAV-01)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The favorites the user keeps, and the two things they can do with one.
 *
 * **Starting is a restore, not a generation.** `restore` parses
 * `workout_snapshot` against the schema the row's own
 * `snapshot_contract_version` names and answers the acceptance payload Review
 * takes — so the workout that appears is the one that was saved, exactly, with
 * no model call anywhere on the path. The payload travels as route state and
 * the favorite's id travels with it, because Review's Start is what writes the
 * session and the attempt row beside it is the only thing that will later let
 * a completion be attributed to this favorite.
 *
 * A snapshot this build cannot read never reaches `restore` from here — the
 * card omits its Start control and says why — but the refusal is still handled,
 * because a row whose version *is* supported can still hold a document that
 * does not parse, and that is a different sentence.
 *
 * **Removing asks first.** Unfavoriting deletes the progression the favorite
 * existed to accumulate (favorites-v2 §"Removing from Favorites"), which is
 * exactly the case `ConfirmDialog critical` is for.
 */
function FavoriteWorkouts() {
  const query = useFavoritesQuery()
  const { favorites } = useWorkoutClients()
  const navigate = useNavigate()

  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<FavoriteEntry | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const rows: readonly SavedWorkoutRow[] =
    query.state.status === 'ready' ? query.state.data : []
  const listed = useMemo(() => favoriteEntries(rows), [rows])

  const state: ViewState<readonly FavoriteEntry[]> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : listed.length === 0
          ? viewEmpty()
          : viewReady(listed)

  const start = (entry: FavoriteEntry) => {
    const row = rows.find((candidate) => candidate.id === entry.id)
    if (row === undefined) return

    const restored = restore(row, todayLocal())
    if (isErr(restored)) {
      setFailure(
        isOutdatedSnapshot(restored.error)
          ? OUTDATED_SNAPSHOT_MESSAGE
          : 'This favorite couldn’t be opened. Generate a new workout instead.',
      )
      return
    }

    setFailure(null)
    void navigate(REVIEW_ROUTE, { state: reviewHandoff(restored.value, row.id) })
  }

  const remove = async (entry: FavoriteEntry) => {
    setConfirming(null)
    setFailure(null)
    setRemovingId(entry.id)
    const removed = await favorites.remove(entry.id)
    setRemovingId(null)

    if (isErr(removed)) {
      setFailure('That favorite wasn’t removed. Try again.')
      return
    }

    query.refetch()
  }

  return (
    <>
      <Card heading={FAVORITES_LABEL}>
        {failure !== null && (
          <p role="alert" style={FAVORITE_FAILURE_STYLE}>
            <span aria-hidden="true" style={{ display: 'flex' }}>
              <AlertCircle size={16} />
            </span>
            {failure}
          </p>
        )}

        <ViewStateSwitch
          state={state}
          loadingLabel="Reading your favorites"
          errorTitle="Your favorites didn’t load"
          onRetry={query.refetch}
          empty={<ListMessage title="No favorites yet" message={FAVORITES_EMPTY} />}
        >
          {(favorited) => (
            <FavoriteList
              entries={favorited}
              label={FAVORITES_LABEL}
              onStart={start}
              onRemove={setConfirming}
              removingId={removingId}
            />
          )}
        </ViewStateSwitch>
      </Card>

      {/* An overlay, not content: it stays outside the card it answers for. */}
      <ConfirmDialog
        open={confirming !== null}
        critical
        title="Remove from favorites?"
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onConfirm={() => {
          if (confirming !== null) void remove(confirming)
        }}
        onCancel={() => setConfirming(null)}
      >
        Tracked data including completion history and personal bests will be
        lost. The workout itself stays in your history.
      </ConfirmDialog>
    </>
  )
}

const FAVORITE_FAILURE_STYLE: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--spacing-200)',
  color: 'var(--text-negative)',
}

/** The same glyph-and-sentence refusal, for a Quick Start with no usable Goal. */
const QUICK_START_REFUSAL_STYLE = FAVORITE_FAILURE_STYLE

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
