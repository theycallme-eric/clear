/**
 * Summary — `/summary` (SUM-01).
 *
 * IA.md §4: atmosphere `quiet`, protected plus a completed session, in from
 * Workout completion, out to Home. Composition is
 * `AppLayout › PageHeader + Card › MoodIcon(×5) + Textarea + WeekStreakDisplay
 * + CTAButton` — the shell and its atmosphere come from `RootLayout`,
 * `PageHeader` is `AppHeader`, the five mood icons are one `ChoiceGroup`
 * (ATOMIC.md §11: a radiogroup whose selection already carries a tick as well
 * as a colour), and the textarea is `Input multiline`, because the export has
 * no separate Textarea and never needed one.
 *
 * Three things here are the requirement rather than decoration:
 *
 *   1. **Only a completed session reaches this screen.** The question is not
 *      asked of the route, because a route cannot answer it — it is a fact
 *      about the data. `summary.latest` returns completed sessions and nothing
 *      else, so "there is nothing to debrief" arrives as `null` and this screen
 *      redirects Home rather than rendering an empty shell (IA.md §1).
 *   2. **Nothing on this screen is non-functional.** There is no
 *      save-as-favorite button: FAV-01 (M2) adds the button and the behaviour
 *      together, and a disabled one now would be an affordance that lies. The
 *      one CTA saves and leaves, and it is never disabled — a submit in flight
 *      shows the export's own busy indicator on the control that started it.
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
  Frown,
  Input,
  Meh,
  Smile,
  SmilePlus,
  ThumbsDown,
} from '../design-system/index'
import { useAuth } from '../state/auth-context'
import type { AppError } from '../state/errors'
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
import { useInvalidFocus } from '../ui/formFocus'
import { ViewStateSwitch } from '../ui/view-state'
import { AUTHENTICATED_HOME } from './guards'
import { Screen } from './Screen'

/** The longest note the session row is asked to hold (CORE-03, `schemas.ts`). */
export const NOTES_MAX_LENGTH = 2000

/** How many days the week display shows, ending today. */
export const STREAK_WEEK_DAYS = 7

/**
 * The 1–5 scale, worst to best. The four middle words are the export's own
 * (`DebriefScreen`, `MOODS`); `Spent` is the fifth the 1–5 range needs and the
 * scale the column stores — `workout_sessions_mood_range` is 1 to 5, not 1 to 4.
 */
const MOODS = [
  { value: 1, label: 'Spent', Icon: ThumbsDown },
  { value: 2, label: 'Worn', Icon: Frown },
  { value: 3, label: 'Flat', Icon: Meh },
  { value: 4, label: 'Ready', Icon: Smile },
  { value: 5, label: 'Peak', Icon: SmilePlus },
] as const

export function Summary() {
  const query = useCompletedSessionQuery()

  // QueryState has three states; the fourth is this view's own judgement, and
  // here "none" is not a screen — a visitor with nothing to debrief did not
  // come from a workout, so they are sent where they were going anyway.
  const state: ViewState<CompletedSession> =
    query.state.status === 'loading'
      ? viewLoading()
      : query.state.status === 'error'
        ? viewError(query.state.error)
        : query.state.data === null
          ? viewEmpty()
          : viewReady(query.state.data)

  return (
    <>
      <AppHeader>
        <ClearLogo size="md" />
      </AppHeader>
      <Screen title="Summary" heading="Nice work">
        <ViewStateSwitch
          state={state}
          loadingLabel="Reading your session"
          errorTitle="That session didn’t load"
          onRetry={query.refetch}
          empty={<Navigate to={AUTHENTICATED_HOME} replace />}
        >
          {(completed) => (
            // Keyed by the session: the form's initial mood and notes are the
            // stored ones, so a debrief opened twice shows what was saved
            // rather than an empty form over a written row.
            <Debrief key={completed.session.id} completed={completed} />
          )}
        </ViewStateSwitch>
      </Screen>
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
    <div className="clr-stack">
      {/* The acknowledgment, and then straight to the debrief. */}
      <p>{session.title}, done.</p>

      <Card className="clr-boot">
        <div className="clr-stack">
          {durationMins !== null && (
            <Stat label="Duration" value={`${durationMins} min`} />
          )}
          <StreakPanel />
        </div>
      </Card>

      <form className="clr-stack" onSubmit={onSubmit(save)} noValidate>
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

        {/*
          One CTA, and it is the whole of "done". FAV-01 adds save-as-favorite
          in M2 — the button and the behaviour in the same change, which is why
          there is no disabled one here to explain.
        */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={saving}
          icon={<Check size={20} />}
        >
          Save and close
        </Button>
      </form>
    </div>
  )
}

/** One figure with its stencilled label — the export's `Stat`, in app markup. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="clr-stack clr-stack--tight">
      <span className="label">{label}</span>
      <p>{value}</p>
    </div>
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
    <ViewStateSwitch
      state={state}
      loadingLabel="Reading your streak"
      errorTitle="Your streak didn’t load"
      onRetry={query.refetch}
      empty={
        <div className="clr-stack clr-stack--tight">
          <span className="label">Streak</span>
          <p>No streak yet. Sessions on consecutive days build one.</p>
        </div>
      }
    >
      {(streak) => <WeekStreak streak={streak} />}
    </ViewStateSwitch>
  )
}

/** The last seven days, oldest first, with the trained ones marked. */
function WeekStreak({ streak }: { streak: Streak }) {
  const trained = new Set(streak.trainingDays)

  return (
    <div className="clr-stack clr-stack--tight">
      <span className="label">Streak</span>
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
