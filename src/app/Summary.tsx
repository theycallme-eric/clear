/**
 * Summary — `/summary` (SUM-01).
 *
 * IA.md §4: atmosphere `full`, protected plus a completed session, in from
 * Workout completion, out to Home. Composition is
 * `AppLayout › PageHeader + Card › MoodIcon(×5) + Textarea + WeekStreakDisplay
 * + CTAButton` — the shell and its atmosphere come from `RootLayout`,
 * `PageHeader` is `AppHeader`, the five mood icons are one `ChoiceGroup`
 * (ATOMIC.md §11: a radiogroup whose selection already carries a tick as well
 * as a colour), and the textarea is `Input multiline`, because the export has
 * no separate Textarea and never needed one. Per 0.14.3 containment each key
 * number is its own small card and the debrief's fields share one card, labels
 * inside; only the screen title sits on the atmosphere.
 *
 * Three things here are the requirement rather than decoration:
 *
 *   1. **Only a completed session reaches this screen.** The question is not
 *      asked of the route, because a route cannot answer it — it is a fact
 *      about the data. `summary.latest` returns completed sessions and nothing
 *      else, so "there is nothing to debrief" arrives as `null` and this screen
 *      redirects Home rather than rendering an empty shell (IA.md §1).
 *   2. **Nothing on this screen is non-functional.** The debrief's CTA saves
 *      and leaves, and it is never disabled — a submit in flight shows the
 *      export's own busy indicator on the control that started it. FAV-01's
 *      save-as-favorite control arrived with its behaviour, which is why there
 *      was never a disabled one here to explain.
 *   3. **The streak is displayed, never stored.** It is SES-01's derivation
 *      over SES-01c's read, in its own query with its own four states, so a
 *      streak that fails to load does not cost the user their debrief. The
 *      week beside it is Home's week (U41) — the same derivation, the same
 *      marks and the same strip — with four states of its own.
 *
 * U42: the session title heads the result card at a size of its own, and the
 * favorite control is the only thing that says "favorite", before and after.
 *
 * Motion: the result card boots once with `.clr-boot`; a save that fails
 * re-renders in place and replays no entrance, which is the IA's rule for this
 * screen ("save retries do not replay the entrance").
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import type { CompletedSession } from '../data/summary'
import {
  AlertCircle,
  AppHeader,
  Button,
  Check,
  ChoiceGroup,
  ClearLogo,
  Input,
} from '../design-system/index'
import { useAuth } from '../state/auth-context'
import type { AppError } from '../state/errors'
import { useHistoryQuery } from '../state/history-queries'
import { daysTrained, weekStrip, type WeekDay } from '../state/home'
import { MOOD_SCALE } from '../state/mood'
import { useQueryClient } from '../state/query'
import { restDayMarks, useRestDaysQuery } from '../state/rest-day-queries'
import type { Streak } from '../state/streak'
import {
  completedSessionQueryKey,
  useCompletedSessionQuery,
  useStreakQuery,
  useSummaryClient,
} from '../state/summary-queries'
import {
  viewEmpty,
  viewError,
  viewLoading,
  viewReady,
  type ViewState,
} from '../state/view-state'
import { Card } from '../ui/card'
import { Heading } from '../ui/Heading'
import { ActionRow, MetricFrame, MetricGrid, PhoneFooter } from '../ui/composition'
import { useInvalidFocus } from '../ui/formFocus'
import { MOOD_ICONS } from '../ui/mood'
import { ErrorView, LoadingView, ViewStateSwitch } from '../ui/view-state'
import { WeekStrip } from '../ui/week-strip'
import { FavoriteToggle } from './FavoriteToggle'
import { AUTHENTICATED_HOME } from './guards'
import { Screen } from './Screen'

// FAV-01's control now lives beside the screens that share it; its words are
// still importable from here, where they first appeared.
export {
  SAVE_FAVORITE_FAILED,
  SAVE_FAVORITE_LABEL,
  SAVED_FAVORITE_LABEL,
} from './FavoriteToggle'

/** This screen's path, which is where Workout completion lands. */
export const SUMMARY_ROUTE = '/summary'

/** The longest note the session row is asked to hold (CORE-03, `schemas.ts`). */
export const NOTES_MAX_LENGTH = 2000

/** The two readouts, each its own small card's heading. */
export const DURATION_LABEL = 'Duration'
export const STREAK_LABEL = 'Streak'

/** What a reader hears for a duration nothing could measure. */
export const DURATION_NOT_RECORDED = 'Not recorded'

/** The qualifier under a run that has not reached today. */
export const STREAK_THROUGH_YESTERDAY = 'Through yesterday'

/** An empty streak has no number to enlarge, so it is said in a sentence. */
export const STREAK_EMPTY = 'No streak yet. Sessions on consecutive days build one.'

/** Home's week, under Home's name for it. */
export const SUMMARY_WEEK_LABEL = 'This week'
export const WEEK_EMPTY = 'No sessions this week yet.'

/** Lets the hard-edge footer submit the form that remains in the scroller. */
export const SUMMARY_FORM_ID = 'summary-debrief'

/** The debrief card's heading, inside the card with the fields it names. */
export const DEBRIEF_HEADING = 'Debrief'

/**
 * The stored 1–5 scale and its public glyphs, from the one shared list that
 * HIST-01's report also reads — no local copy of the faces lives here.
 */
const MOODS = MOOD_SCALE.map(({ value, label, glyph }) => ({
  value,
  label,
  Icon: MOOD_ICONS[glyph],
}))

export function Summary() {
  const query = useCompletedSessionQuery()

  return (
    <>
      <AppHeader>
        <ClearLogo size="md" />
      </AppHeader>
      {query.state.status === 'loading' ? (
        <Screen title="Summary" heading="Nice work">
          <LoadingView label="Reading your session" />
        </Screen>
      ) : query.state.status === 'error' ? (
        <Screen title="Summary" heading="Nice work">
          <ErrorView
            error={query.state.error}
            title="That session didn’t load"
            actionLabel="Retry"
            onRetry={query.refetch}
          />
        </Screen>
      ) : query.state.data === null ? (
        <Navigate to={AUTHENTICATED_HOME} replace />
      ) : (
        // Keyed by the session: the form's initial mood and notes are the
        // stored ones, so a debrief opened twice shows what was saved rather
        // than an empty form over a written row.
        <Debrief key={query.state.data.session.id} completed={query.state.data} />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The debrief
// ─────────────────────────────────────────────────────────────────────────────

function Debrief({ completed }: { completed: CompletedSession }) {
  const { session, durationMins } = completed
  const summary = useSummaryClient()
  const cache = useQueryClient()
  const { user } = useAuth()
  const navigate = useNavigate()
  const onSubmit = useInvalidFocus()

  const [mood, setMood] = useState<number | null>(session.mood)
  const [notes, setNotes] = useState(session.session_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [tooLong, setTooLong] = useState(false)

  function save(): boolean | Promise<boolean> {
    const written = notes.trim()
    if (written.length > NOTES_MAX_LENGTH) {
      // Refused here rather than at the wire: the field is marked invalid by
      // this render and the shared helper puts the caret back in it.
      setTooLong(true)
      setError(null)
      return false
    }
    setTooLong(false)

    return (async () => {
      setSaving(true)
      setError(null)
      const saved = await summary.saveDebrief(session.id, {
        mood,
        // Empty is not an answer: the column's null means "not written", and
        // an empty string would claim a note that is not there.
        session_notes: written === '' ? null : written,
      })
      setSaving(false)

      if (!saved.ok) {
        setError(saved.error)
        return false
      }

      // The cache holds what the database now holds, so coming back to this
      // screen shows the stored debrief without a second read.
      if (user !== null) {
        cache.setData(completedSessionQueryKey(user.id), saved.value)
      }
      void navigate(AUTHENTICATED_HOME)
      return true
    })()
  }

  return (
    <Screen
      title="Summary"
      heading="Nice work"
      pinnedFoot={
        <PhoneFooter>
          <ActionRow>
            <Button
              type="submit"
              form={SUMMARY_FORM_ID}
              variant="primary"
              size="lg"
              loading={saving}
              icon={<Check size={20} />}
            >
              Save and close
            </Button>
          </ActionRow>
        </PhoneFooter>
      }
    >
      <div className="clr-stack">
        {/* Only the screen title sits on the atmosphere: the acknowledgment,
            each key number and the debrief are each inside a card. */}
        <div className="clr-stack clr-boot">
          {/* U42: the session's own title leads, as this card's heading, and
              FAV-01's control is labelled once — by the control itself. It
              stays distinct from the readouts: an action, not a statistic. */}
          <Card>
            <Heading style={SESSION_TITLE_STYLE}>{session.title}, done.</Heading>
            <FavoriteToggle sessionId={session.id} compact />
          </Card>
          {/* U41: two readouts, one size. The week is its own card under them
              rather than squeezed into half of one. */}
          <MetricGrid>
            <Stat label={DURATION_LABEL}>
              {durationMins === null ? (
                <NotRecorded />
              ) : (
                `${durationMins} min`
              )}
            </Stat>
            <StreakStat />
          </MetricGrid>
          <SummaryWeek />
        </div>

        {/* A form sits inside one card, its labels with it; the primary
            action stays pinned in the footer and submits it by id. */}
        <form id={SUMMARY_FORM_ID} onSubmit={onSubmit(save)} noValidate>
          <Card heading={DEBRIEF_HEADING}>
            {error !== null && (
              <div role="alert" className="clr-row">
                <span
                  aria-hidden="true"
                  style={{ color: 'var(--icon-toast-negative)', display: 'flex' }}
                >
                  <AlertCircle />
                </span>
                <span>{error.message}</span>
              </div>
            )}

            <ChoiceGroup
              legend="How do you feel?"
              options={MOODS.map(({ value, label, Icon }) => ({
                value: String(value),
                label: (
                  <span className="clr-row">
                    <Icon size={20} />
                    {label}
                  </span>
                ),
              }))}
              value={mood === null ? undefined : String(mood)}
              onChange={(next) => {
                setMood(Number(Array.isArray(next) ? next[0] : next))
              }}
            />

            <Input
              label="Notes · optional"
              name="session_notes"
              multiline
              rows={4}
              value={notes}
              onChange={setNotes}
              placeholder="Overhead felt heavy today. Lateral raises easy."
              errorText={
                tooLong
                  ? `Notes are kept to ${NOTES_MAX_LENGTH} characters.`
                  : undefined
              }
            />
          </Card>
        </form>
      </div>
    </Screen>
  )
}

/**
 * U42: the session title is the result card's heading, a step under the
 * screen's own and well above the card labels. A long title wraps inside the
 * card rather than widening it.
 */
const SESSION_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h2-size)',
  lineHeight: 'var(--heading-h2-line-height)',
  color: 'var(--text-card-header)',
  overflowWrap: 'anywhere',
}

/**
 * U41: every key number is drawn at this one size, so the duration and the
 * streak read as a pair rather than as a number beside a sentence.
 */
const METRIC_VALUE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h4-size)',
  lineHeight: 'var(--heading-h4-line-height)',
  color: 'var(--text-card-header)',
}

const METRIC_NOTE_STYLE: CSSProperties = {
  margin: 0,
  color: 'var(--text-secondary)',
}

/**
 * One key number in its own small card, its label the card's heading. The
 * readout inside drops its own frame, so there is never a frame in a frame.
 */
function Stat({
  label,
  note,
  children,
}: {
  label: string
  /** A qualifier under the number, in the secondary role. */
  note?: string
  children: ReactNode
}) {
  return (
    <Card heading={label} padding="sm">
      <MetricFrame>
        <p data-metric-value="" style={METRIC_VALUE_STYLE}>
          {children}
        </p>
        {note === undefined ? null : <p style={METRIC_NOTE_STYLE}>{note}</p>}
      </MetricFrame>
    </Card>
  )
}

/** A duration nothing can measure: a dash to the eye, words to a reader. */
function NotRecorded() {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="a11y-hidden">{DURATION_NOT_RECORDED}</span>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The streak and the week
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SES-01's count, with its own four states. Its own query too: the debrief is
 * readable and writable whether or not this read succeeded, and a shared state
 * would have made one failure into two.
 */
function StreakStat() {
  const query = useStreakQuery()

  const state: ViewState<Streak> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : query.state.data.days === 0
          ? viewEmpty()
          : viewReady(query.state.data)

  if (state.status === 'ready') {
    const streak = state.data
    return (
      <Stat
        label={STREAK_LABEL}
        note={streak.includesToday ? undefined : STREAK_THROUGH_YESTERDAY}
      >
        {streak.days} {streak.days === 1 ? 'day' : 'days'}
      </Stat>
    )
  }

  if (state.status === 'empty') {
    return (
      <Card heading={STREAK_LABEL} padding="sm">
        <MetricFrame>
          <p style={{ margin: 0 }}>{STREAK_EMPTY}</p>
        </MetricFrame>
      </Card>
    )
  }

  // Loading and a failed read hold the same small card, so the pair of
  // readouts keeps its shape while the streak settles or offers its retry.
  return (
    <Card heading={STREAK_LABEL} padding="sm">
      <MetricFrame>
        {state.status === 'loading' ? (
          <LoadingView label="Reading your streak" />
        ) : (
          <ErrorView
            error={state.error}
            title="Your streak didn’t load"
            onRetry={query.refetch}
          />
        )}
      </MetricFrame>
    </Card>
  )
}

/**
 * Home's week, as Home draws it (U41): the same `weekStrip` over the same
 * history and HOME-02's marks, so a day that was trained before a broken run
 * still carries its tick and a marked rest day keeps its reason. The strip
 * itself is the shared one (U12) — the completed role and its tick for a
 * trained day, the information role and its `Rest` mark for a rested one.
 *
 * Four states of its own, for the same independence as the streak's: the
 * strip is drawn whenever there are days to draw, and a failed read says so
 * with its retry rather than costing the debrief.
 */
function SummaryWeek() {
  const history = useHistoryQuery()
  const restDays = useRestDaysQuery()

  const sessions =
    history.state.status === 'ready' ? history.state.data.sessions : null
  const marks = restDayMarks(restDays)
  const week = useMemo(
    () => weekStrip(sessions ?? [], { restDays: marks ?? undefined }),
    [marks, sessions],
  )

  const state: ViewState<readonly WeekDay[]> =
    history.state.status === 'loading' || restDays.state.status === 'loading'
      ? viewLoading()
      : history.state.status === 'error'
        ? viewError(history.state.error)
        : restDays.state.status === 'error'
          ? viewError(restDays.state.error)
          : daysTrained(week) === 0
            ? viewEmpty()
            : viewReady(week)

  return (
    <Card heading={SUMMARY_WEEK_LABEL}>
      <ViewStateSwitch
        state={state}
        loadingLabel="Reading your training week"
        errorTitle="This week didn’t load"
        onRetry={() => {
          history.refetch()
          restDays.refetch()
        }}
        empty={
          <div className="clr-stack clr-stack--tight">
            <WeekStrip days={week} label={SUMMARY_WEEK_LABEL} />
            <p style={{ margin: 0 }}>{WEEK_EMPTY}</p>
          </div>
        }
      >
        {(days) => <WeekStrip days={days} label={SUMMARY_WEEK_LABEL} />}
      </ViewStateSwitch>
    </Card>
  )
}
