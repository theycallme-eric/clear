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
 *      streak that fails to load does not cost the user their debrief.
 *
 * Motion: the result card boots once with `.clr-boot`; a save that fails
 * re-renders in place and replays no entrance, which is the IA's rule for this
 * screen ("save retries do not replay the entrance").
 */
import { useState } from 'react'
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
import { MOOD_SCALE } from '../state/mood'
import { useQueryClient } from '../state/query'
import { previousDay, type LocalDay, type Streak } from '../state/streak'
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
import { ActionRow, MetricFrame, MetricGrid, PhoneFooter } from '../ui/composition'
import { useInvalidFocus } from '../ui/formFocus'
import { MOOD_ICONS } from '../ui/mood'
import { ErrorView, LoadingView, ViewStateSwitch } from '../ui/view-state'
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

/** How many days the week display shows, ending today. */
export const STREAK_WEEK_DAYS = 7

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
          <MetricGrid>
            {durationMins !== null && (
              <Stat label="Duration" value={`${durationMins} min`} />
            )}
            <StreakPanel />
          </MetricGrid>
          {/* FAV-01 remains distinct from the result readouts: it is an action,
              not a statistic, and it keeps its one-tap behavior. */}
          <Card>
            <p>{session.title}, done.</p>
            <FavoriteToggle sessionId={session.id} />
          </Card>
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
 * One key number in its own small card, its label the card's heading. The
 * readout inside drops its own frame, so there is never a frame in a frame.
 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card heading={label} padding="sm">
      <MetricFrame>
        <p>{value}</p>
      </MetricFrame>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The streak
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SES-01's count, with its own four states. Its own query too: the debrief is
 * readable and writable whether or not this read succeeded, and a shared state
 * would have made one failure into two.
 */
function StreakPanel() {
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
    <Card heading="Streak" padding="sm">
      <MetricFrame>
        <ViewStateSwitch
          state={state}
          loadingLabel="Reading your streak"
          errorTitle="Your streak didn’t load"
          onRetry={query.refetch}
          empty={<p>No streak yet. Sessions on consecutive days build one.</p>}
        >
          {(streak) => <WeekStreak streak={streak} />}
        </ViewStateSwitch>
      </MetricFrame>
    </Card>
  )
}

/** The last seven days, oldest first, with the trained ones marked. */
function WeekStreak({ streak }: { streak: Streak }) {
  const trained = new Set(streak.trainingDays)

  return (
    <div className="clr-stack clr-stack--tight">
      <p>
        {streak.days} {streak.days === 1 ? 'day' : 'days'}
        {streak.includesToday ? '' : ', through yesterday'}
      </p>
      <ul
        className="clr-row"
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
      >
        {weekEnding(streak.today).map((day) => {
          const done = trained.has(day)

          return (
            <li
              key={day}
              className="clr-stack clr-stack--tight"
              style={{ alignItems: 'center' }}
            >
              <span className="label" aria-hidden="true">
                {weekdayInitial(day)}
              </span>
              {/* The glyph is the cue; the colour is only agreement with it. */}
              <span
                style={{
                  color: done
                    ? 'var(--icon-selected)'
                    : 'var(--text-unselected)',
                  display: 'flex',
                }}
              >
                {done ? <Check size={16} /> : <span aria-hidden="true">–</span>}
              </span>
              <span className="a11y-hidden">
                {day}
                {done ? ': trained' : ': no session'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Seven local days ending on `today`, oldest first. */
export function weekEnding(today: LocalDay): LocalDay[] {
  const days = [today]
  while (days.length < STREAK_WEEK_DAYS) {
    days.push(previousDay(days[days.length - 1]))
  }

  return days.reverse()
}

/**
 * The first letter of a day's name. A `LocalDay` is a calendar date with no
 * zone of its own, so it is read as UTC — which is what makes the weekday a
 * property of the date rather than of the machine rendering it.
 */
function weekdayInitial(day: LocalDay): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'narrow',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
}
