/**
 * Home — `/` (HOME-01). The daily entry point.
 *
 * IA.md §4: atmosphere `full`, guard protected, and **all four states, on the
 * screen where it matters most**. Composition is the App Shell template
 * (`src/design-system/templates/app-shell/AppShell.dc.html`) read through the
 * IA's own line — `AppLayout › PageHeader + Card(Train Today/active) +
 * Card(This Week/rest) + TabbedPanel` — so the shell and its atmosphere are
 * `RootLayout`'s, `PageHeader` is `AppHeader` with the page title, semantic daily
 * regions use Cards, and collections use the system tab band and list frame.
 *
 * **One read answers three questions.** The week strip, the recent three and
 * the next-workout entry are all derivations of HIST-01's first page
 * (`src/state/home.ts`, `src/state/session-suggestion.ts`), asked for once
 * through the shared `useHistoryQuery` and never re-fetched per region. A
 * region is not a query.
 *
 * Four behaviours here are the requirement rather than the layout:
 *
 *   1. **Train Today is answered first.** `ResumableSession` owns that slot:
 *      an unfinished workout replaces the ordinary actions rather than adding
 *      another card. Resuming re-enters the shell at the section the session
 *      actually reached — the position is
 *      `workout-progress.ts`'s, never a number this screen keeps.
 *   2. **There is one next-workout entry, and it never generates (U20).**
 *      Train Today states the last completed request once and a plain-language
 *      suggested focus; the pinned primary action opens `/generate` carrying
 *      that request's minutes and place, and Generate resolves the Goal, the
 *      Focus and the intensity by the same rule it uses for a direct visit.
 *      Home sends no generation request at all — the athlete asks for one on
 *      the form. First-workout, stale and failed history still open Generate
 *      on its own usable defaults, and a request with no place opens on the
 *      default place.
 *   3. **The recents link into the chronology.** A completed compatible row
 *      opens its stored prescription in Review; every other row falls back to
 *      HIST-01's durable detail for that session.
 *
 *   4. **Favorites are a tab here, and starting one is a restore.** FAV-01's
 *      list sits beside the recents on its own read, and its Start control
 *      parses the saved snapshot and carries the resulting acceptance payload
 *      to `/review` as route state. No generation call is made and no row is
 *      written on the way — Review's own Start is where the session begins to
 *      exist, exactly as it is for a generated workout. The existing full
 *      favorites list stays full; its selected tab is a search param so a
 *      refresh or browser return from Review retains that destination (U21).
 *
 * Recent workouts retain `/history/:id` as their durable fallback and use the
 * same direct-Review resolver as History. Favorites restore through their own
 * saved snapshot path. Neither entry makes a generation request.
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import {
  useHref,
  useLinkClickHandler,
  useNavigate,
  useSearchParams,
  type To,
} from 'react-router-dom'

import {
  AlertCircle,
  Button,
  IconButton,
  Pencil,
  Play,
  Rest,
  Sliders,
  Streak as StreakGlyph,
  TabBar,
  TabPanel,
  TextAction,
  Zap,
} from '../design-system/index'
import { favoriteRunsQueryKey, useFavoritesQuery } from '../state/favorite-queries'
import {
  favoriteEntries,
  isOutdatedSnapshot,
  OUTDATED_SNAPSHOT_MESSAGE,
  restore,
  todayLocal,
  type FavoriteEntry,
} from '../state/favorites'
import { GENERATE_PATH } from '../state/generation-form'
import {
  daysTrained,
  recentWorkouts,
  sessionDetailPath,
  weekStrip,
  type WeekDay,
} from '../state/home'
import type { HistorySessionEntry } from '../state/history'
import { useHistoryQuery, type HistoryQuery } from '../state/history-queries'
import { isErr } from '../state/errors'
import { useQueryClient } from '../state/query'
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
  FIRST_WORKOUT_GUIDANCE,
  nextWorkout,
  type NextWorkout,
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
import {
  isActiveSession,
  useActiveSessionQuery,
  useWorkoutClients,
} from '../state/workout-queries'
import { ActionGlow } from '../ui/action-glow'
import { Card } from '../ui/card'
import {
  ActionGroup,
  ActionRow,
  ListMessage,
  PhoneFooter,
  TabBand,
} from '../ui/composition'
import {
  FavoriteList,
  REMOVE_FAVORITE_FAILED,
  RemoveFavoriteDialog,
} from '../ui/favorite-list'
import { HeadingSection } from '../ui/Heading'
import { HistoryList } from '../ui/history-list'
import { useArrivalStagger } from '../ui/motion'
import { Select } from '../ui/select'
import { ViewStateSwitch } from '../ui/view-state'
import { WeekStrip } from '../ui/week-strip'
import { ResumableSession } from './ResumableSession'
import { Screen } from './Screen'
import { WORKOUT_ROUTE } from './ActiveSessionPrompt'
import { useOpenHistorySession } from './useOpenHistorySession'

/** Home's own path. */
export const HOME_ROUTE = '/'

/** IA.md §4's out-edges from Home. Each lands with the screen behind it. */
export const GENERATE_ROUTE = GENERATE_PATH
export const REVIEW_ROUTE = '/review'
export const HISTORY_ROUTE = '/history'
export const SETTINGS_ROUTE = '/settings'

/** U18: the header's Settings control is a glyph, so its name is stated. */
export const SETTINGS_CONTROL_LABEL = 'Settings'

/** The Recent panel's way into the whole chronology. */
export const VIEW_HISTORY_LABEL = 'View history'

/** The template's own h1 — the screen is "Today", the app is the wordmark. */
export const HOME_HEADING = 'Today'

/** The daily groups, each named inside its own card. */
export const TRAIN_TODAY_LABEL = 'Train today'
export const WEEK_STRIP_LABEL = 'This week'
export const REST_DAY_LABEL = 'Rest day'
export const RECENT_WORKOUTS_LABEL = 'Recent workouts'

/** U20: the two lines of the next-workout entry, each said once. */
export const LAST_REQUEST_LABEL = 'Last time'
export const SUGGESTION_LABEL = 'Suggested next'

/** Existing history without a completed request still has the ordinary form entry. */
const RETURNING_WORKOUT_GUIDANCE = 'Choose a focus and the rest is filled in.'

/** The pinned primary: it opens Generate, prefilled, and sends nothing. */
export const GENERATE_ACTION_LABEL = 'Generate workout'

/** U19: the streak's empty state is the fact; Train Today carries the guidance. */
export const STREAK_EMPTY = 'No streak yet.'

/** FAV-01's tab, beside the recents, on the one read each of them needs. */
export const FAVORITES_LABEL = 'Favorites'
export const FAVORITES_EMPTY_TITLE = 'No favorites yet'
export const FAVORITES_EMPTY = 'Save a workout from its summary to start it again here.'

/**
 * U21: the tab itself opens the existing full favorites list. There is no
 * baseline preview cap to turn into a new limitation. Keep the selected tab
 * in the URL so a refresh or browser return restores the same full list.
 */
export const HOME_TAB_PARAM = 'tab'
export const FAVORITES_TAB_VALUE = 'favorites'

/** U08: the empty recents state the fact; the pinned Generate is the next action. */
export const RECENT_EMPTY_TITLE = 'No workouts yet'
/**
 * REQ-003: an unmarked day carries no prompt above Mark Rest Day — the
 * action names itself. The chosen reason's effect is the picker's helper.
 */
export const REST_DAY_SAVED = 'Rest day saved.'

export function Home() {
  const history = useHistoryQuery()
  const restDays = useRestDaysQuery()
  const activeSession = useActiveSessionQuery()
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
  // U20: the one next-workout entry. Unread or failed history has no entry,
  // and the primary action then opens Generate on its own defaults.
  const next = useMemo(
    () => (sessions === null ? null : nextWorkout(sessions)),
    [sessions],
  )
  const generateTo = next?.path ?? GENERATE_ROUTE

  return (
    <>
      {/* U18: the header is the page title and one framed icon-only control.
          `IconButton` requires the accessible name and brings the package's
          focus ring and 40px target; the route change stays in-app, so the
          installed PWA never hands Settings to the browser. REQ-005: it
          carries Generate's glow. */}
      <Screen
        title="CLEAR"
        heading={HOME_HEADING}
        header={{
          actions: (
            <ActionGlow>
              <IconButton
                label={SETTINGS_CONTROL_LABEL}
                icon={<Sliders size={20} />}
                onClick={() => void navigate(SETTINGS_ROUTE)}
              />
            </ActionGlow>
          ),
        }}
        pinnedFoot={
          <PhoneFooter>
            <ActionRow>
              <Button
                variant="primary"
                size="lg"
                icon={resumable === null ? <Zap /> : <Play />}
                onClick={() =>
                  void navigate(resumable === null ? generateTo : WORKOUT_ROUTE)
                }
              >
                {resumable === null ? GENERATE_ACTION_LABEL : 'Resume workout'}
              </Button>
            </ActionRow>
          </PhoneFooter>
        }
      >
        <ArrivingStack>
          {/* One top slot: an active workout replaces Train Today, while an
              empty active-session read renders the next-workout entry. */}
          <ResumableSession
            query={activeSession}
            fallback={<NextWorkoutEntry query={history} next={next} />}
          />

          <TrainingWeek query={history} restDays={restDays} week={week} />

          {/* FAV-01: the favorites tab lives beside the recents rather than in
              a screen of its own. Both are lists of workouts the user has
              already done, and the tab is the IA's answer to which one they
              are looking at. */}
          <WorkoutTabs query={history} entries={recents} />
        </ArrivingStack>
      </Screen>
    </>
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
          {/* U19: each day already says itself — tick and word — so the week
              adds no count of its own beside the streak's. */}
          {(days) => <WeekStrip days={days} label={WEEK_STRIP_LABEL} />}
        </ViewStateSwitch>
        <RestDayControl
          today={week.find((day) => day.isToday)}
          read={restDays.state.status}
        />
      </div>
    </Card>
  )
}

/**
 * HOME-02's one marking affordance, on Home and nowhere else.
 *
 * U25: a disclosure, not a form standing open. The trigger says whether it is
 * open; opening moves focus to the native picker (the phone's own wheel or
 * sheet), and Save, Cancel or Escape hand focus back to the trigger, so a
 * keyboard or screen-reader user never loses their place. Cancel and Escape
 * discard the choice — the saved reason stays the strip's.
 */
function RestDayControl({
  today: current,
  read,
}: {
  today: WeekDay | undefined
  read: 'loading' | 'error' | 'ready'
}) {
  // A save refetches the marks, and a refetch is `loading` again. Dropping
  // the control for that moment would take focus and the saved status with
  // it, so it keeps the last day it read until the new one lands.
  const [settled, setSettled] = useState<WeekDay | undefined>(
    read === 'ready' ? current : undefined,
  )
  if (read === 'ready' && current !== settled) setSettled(current)
  const today = read === 'ready' ? current : read === 'loading' ? settled : undefined

  const write = useMarkRestDay()
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState<RestDayReason>('rest')
  const [failure, setFailure] = useState(false)
  const [saved, setSaved] = useState(false)
  const editorId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const picker = useRef<HTMLSelectElement>(null)
  // Where focus goes once the next render lands: the picker on open, the
  // trigger on close. Null leaves focus where the user put it.
  const focusNext = useRef<'picker' | 'trigger' | null>(null)

  useEffect(() => {
    const target = focusNext.current === 'picker' ? picker.current : trigger.current
    if (focusNext.current === null) return
    focusNext.current = null
    target?.focus()
  }, [editing])

  // A performed workout wins over a mark in the strip and makes marking rest
  // nonsensical, so the affordance is absent rather than disabled.
  if (today === undefined || today.state === 'workout') return null

  const begin = () => {
    setReason(today.reason ?? 'rest')
    setFailure(false)
    setSaved(false)
    focusNext.current = 'picker'
    setEditing(true)
  }

  const close = () => {
    focusNext.current = 'trigger'
    setEditing(false)
  }

  const cancel = () => {
    if (write.marking) return
    setFailure(false)
    close()
  }

  const save = async () => {
    setFailure(false)
    const result = await write.mark({ day: today.day, reason, note: null })
    if (isErr(result)) {
      setFailure(true)
      return
    }

    setSaved(true)
    close()
  }

  const onEditorKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    cancel()
  }

  return (
    // Inside the week's card this is a ruled sub-group, one level under it.
    <HeadingSection aria-label={REST_DAY_LABEL}>
      <Card heading={REST_DAY_LABEL}>
        {/* U05: the statement, then the control group, one rhythm step apart. */}
        <div className="clr-stack">
          {/* An unmarked day asks nothing: the action is the whole offer. A
              saved mark is still stated, because the strip's glyph is not a
              reason. */}
          {today.reason !== null && (
            <p style={{ margin: 0 }}>{`Today: ${REST_DAY_REASON_LABELS[today.reason]}.`}</p>
          )}

          {saved && <p role="status" style={{ margin: 0 }}>{REST_DAY_SAVED}</p>}
          {failure && (
            <p role="alert" style={{ margin: 0, color: 'var(--text-negative)' }}>
              The rest day wasn’t saved. Try again.
            </p>
          )}

          {/* REQ-005: the trigger carries Generate's glow; the card does not. */}
          {!editing ? (
            <ActionGroup>
              <ActionGlow>
                <Button
                  variant="secondary"
                  icon={today.reason === null ? <Rest size={20} /> : <Pencil size={20} />}
                  aria-expanded={false}
                  aria-controls={editorId}
                  buttonRef={trigger}
                  onClick={begin}
                >
                  {today.reason === null ? 'Mark Rest Day' : 'Change reason'}
                </Button>
              </ActionGlow>
            </ActionGroup>
          ) : (
            // Escape is Cancel from anywhere in the editor; the native picker
            // keeps its own Escape while its list is open.
            <div id={editorId} className="clr-stack clr-stack--tight" onKeyDown={onEditorKey}>
              <Select
                label="Reason"
                value={reason}
                selectRef={picker}
                options={REST_DAY_REASONS.map((value) => ({
                  value,
                  label: REST_DAY_REASON_LABELS[value],
                }))}
                helperText={REST_DAY_REASON_EFFECTS[reason]}
                onChange={(value) => setReason(value as RestDayReason)}
              />
              {/* Equal framed cells, so Save and Cancel share edges and height. */}
              <ActionGroup className="clr-action-group--paired">
                <Button variant="primary" loading={write.marking} onClick={() => void save()}>
                  Save rest day
                </Button>
                <Button variant="secondary" disabled={write.marking} onClick={cancel}>
                  Cancel
                </Button>
              </ActionGroup>
            </div>
          )}
        </div>
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
      empty={<p style={{ margin: 0 }}>{STREAK_EMPTY}</p>}
    >
      {(streak) => (
        <p style={STREAK_STYLE}>
          <span aria-hidden="true" style={{ display: 'flex' }}>
            <StreakGlyph size={16} />
          </span>
          Current streak: {keepTogether(`${streak.days} ${streak.days === 1 ? 'day' : 'days'}`)}
          {streak.includesToday ? '' : ', through yesterday'}
        </p>
      )}
    </ViewStateSwitch>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The next-workout entry (REQ-007, U20)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Train Today, with nothing waiting to resume: the last request once and what
 * to train next, in plain words. The action is the pinned primary below — one
 * way on, which opens Generate with that request's minutes and place and
 * sends nothing — so this card holds no button of its own.
 *
 * A data-driven view with all four states. Loading and a failed read are said
 * here, with Retry; the pinned action still opens Generate on its defaults
 * meanwhile, because a history that did not load must never cost the athlete
 * their workout. Truly empty history gets first-use guidance; unfinished
 * history gets the ordinary returning entry without inventing a completed
 * request or recommendation. Stale completed history still states its last
 * request and says to choose a focus, which Generate then asks for.
 */
function NextWorkoutEntry({
  query,
  next,
}: {
  query: HistoryQuery
  next: NextWorkout | null
}) {
  const state: ViewState<NextWorkout> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : next === null || query.state.data.sessions.length === 0
          ? viewEmpty()
          : viewReady(next)

  return (
    <Card heading={TRAIN_TODAY_LABEL}>
      <ViewStateSwitch
        state={state}
        loadingLabel="Reading your last workout"
        errorTitle="Your last workout didn’t load"
        onRetry={query.refetch}
        empty={<p style={{ margin: 0 }}>{FIRST_WORKOUT_GUIDANCE}</p>}
      >
        {(entry) => (
          <div className="clr-stack clr-stack--tight">
            {entry.prior !== null && (
              <p style={{ margin: 0 }}>
                {`${LAST_REQUEST_LABEL}: ${keepTogetherParts(entry.prior.summary)}.`}
              </p>
            )}
            <p style={{ margin: 0 }}>
              {entry.prior === null
                ? RETURNING_WORKOUT_GUIDANCE
                : entry.status === 'recommended'
                  ? `${SUGGESTION_LABEL}: ${entry.guidance}`
                  : entry.guidance}
            </p>
          </div>
        )}
      </ViewStateSwitch>
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
  // U21: the selected tab is the URL's, so leaving Home and coming back — or
  // opening the full favorites list — never drops the user onto Recent.
  const [params, setParams] = useSearchParams()
  const active = params.get(HOME_TAB_PARAM) === FAVORITES_TAB_VALUE ? 1 : 0
  const idBase = 'home-workout-tabs'

  const select = (index: number) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (index === 1) next.set(HOME_TAB_PARAM, FAVORITES_TAB_VALUE)
        else next.delete(HOME_TAB_PARAM)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="clr-stack clr-stack--tight">
      <TabBand>
        <TabBar
          tabs={[RECENT_WORKOUTS_LABEL, FAVORITES_LABEL]}
          active={active}
          onChange={select}
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
          <ListMessage title={RECENT_EMPTY_TITLE} />
        }
      >
        {(recents) => (
          <HistoryList
            entries={recents}
            label={RECENT_WORKOUTS_LABEL}
            layout="recent"
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
 * exactly the case `ConfirmDialog critical` is for — the shared
 * `RemoveFavoriteDialog`, so Summary and Session Detail ask the same question.
 */
function FavoriteWorkouts() {
  const query = useFavoritesQuery()
  const cache = useQueryClient()
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
      setFailure(REMOVE_FAVORITE_FAILED)
      return
    }

    cache.invalidate(favoriteRunsQueryKey(entry.id))
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
          empty={<ListMessage title={FAVORITES_EMPTY_TITLE} message={FAVORITES_EMPTY} />}
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
      <RemoveFavoriteDialog
        open={confirming !== null}
        onConfirm={() => {
          if (confirming !== null) void remove(confirming)
        }}
        onCancel={() => setConfirming(null)}
      />
    </>
  )
}

/**
 * U06: a short count and its unit never wrap apart. Non-breaking spaces keep
 * the sentence one text run, so it still reads (and matches) as one line of
 * copy while the surrounding words remain free to wrap.
 */
function keepTogether(phrase: string): string {
  return phrase.replace(/ /g, NO_BREAK_SPACE)
}

/** `Upper body · 35 minutes · intensity 6`: each part held together, wrapping only between. */
function keepTogetherParts(summary: string): string {
  return summary.split(' · ').map(keepTogether).join(' · ')
}

const NO_BREAK_SPACE = String.fromCharCode(0xa0)

const FAVORITE_FAILURE_STYLE: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--spacing-200)',
  color: 'var(--text-negative)',
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
