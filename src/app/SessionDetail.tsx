/**
 * Session Detail — `/history/:id` (HIST-01). One past workout, disclosed.
 *
 * IA.md §4: atmosphere `full`, guard protected, and three states rather than
 * four — a session always has content, so there is no empty. The error splits
 * two ways, because they are different facts with different recoveries:
 *
 *   · **Not found.** `session_as_performed` answers SQL NULL for a session that
 *     does not exist *and* for one RLS will not show this user, and the data
 *     layer reads both as `PERSISTENCE_NOT_FOUND`. Retrying cannot change that
 *     answer, so the action is the way back to History instead.
 *   · **The read failed.** Anything else — offline, a boundary parse — is worth
 *     asking again, so the action is a retry.
 *
 * **What this screen does not do is derive.** The reconstruction is read by
 * `useSessionDetailQuery` (`asPerformed`, the one question a record answers),
 * turned into words by `sessionDetail`, and turned into markup by the parts in
 * `src/ui/session-detail.tsx`. The screen arranges those three and nothing
 * else, so there is no fourth, per-screen idea of what a session contained.
 *
 * **Two actions, independent of each other (REQ-003).** Save as favorite is
 * Summary's own control, and Restart hands the session's stored prescription to
 * `/review` — rebuilt by `restartAcceptance`, with no generation call and no
 * favorite required. Neither reads the other's outcome: a failed save leaves
 * Restart exactly as it was, and restarting creates no favorite. A session
 * already running elsewhere is `ActiveSessionPrompt`'s question, asked above
 * this route before either action is reachable.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import {
  AlertCircle,
  AppHeader,
  Button,
  ClearLogo,
  Info,
  Play,
} from '../design-system/index'
import { ErrorCode, isErr, type AppError } from '../state/errors'
import { todayLocal } from '../state/favorites'
import { useSessionDetailQuery } from '../state/history-queries'
import { reviewHandoff } from '../state/review-handoff'
import type { SessionReconstruction } from '../state/schemas'
import { sessionDetail, type SessionDetailView } from '../state/session-detail'
import {
  RESTART_FAILED_MESSAGE,
  restartAcceptance,
  restartEligibility,
  restartFailureMessage,
} from '../state/session-restart'
import { useWorkoutClients } from '../state/workout-queries'
import { Card } from '../ui/card'
import { ActionRow, PhoneFooter } from '../ui/composition'
import { HeaderBackButton } from '../ui/header-back-button'
import { MoodReading } from '../ui/mood'
import { SessionProvenance, SessionSectionCard } from '../ui/session-detail'
import { ErrorView, LoadingView } from '../ui/view-state'
import { FavoriteToggle } from './FavoriteToggle'
import { REVIEW_PATH } from './ReviewRoute'
import { Screen } from './Screen'

/** Document title and route announcement; the h1 is the workout's own title. */
export const SESSION_DETAIL_TITLE = 'Workout'

export const SESSION_DETAIL_BACK_LABEL = 'Back'
export const SESSION_DETAIL_LOADING_LABEL = 'Reading workout'
export const SESSION_DETAIL_NOT_FOUND_TITLE = 'Workout not found'
export const SESSION_DETAIL_NOT_FOUND_ACTION = 'Open history'
export const SESSION_DETAIL_ERROR_TITLE = 'Workout didn’t load'

export const SESSION_DETAIL_MOOD_LABEL = 'Mood'
export const SESSION_DETAIL_NOTES_LABEL = 'Notes'
export const SESSION_DETAIL_NO_NOTES = 'No notes'
export const SESSION_DETAIL_SECTIONS_LABEL = 'Sections'
export const SESSION_DETAIL_RESTART_LABEL = 'Restart'

const HISTORY_PATH = '/history'

const META_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--spacing-200)',
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-label)',
  margin: 0,
}

const LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
  margin: 0,
}

const BODY_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--body-sm-size)',
  color: 'var(--text-card-body)',
  margin: 0,
  whiteSpace: 'pre-wrap',
}

const STACK_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacing-300)',
}

export function SessionDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const query = useSessionDetailQuery(id ?? null)

  const payload = query.state.status === 'ready' ? query.state.data : null
  const view = useMemo(() => (payload === null ? null : sessionDetail(payload)), [payload])

  // Back is back when there is somewhere to go back to (History, or Home's
  // recents). A detail opened by URL has no in-app past, so it falls to History.
  const goBack = () => {
    if (location.key === 'default') void navigate(HISTORY_PATH)
    else void navigate(-1)
  }

  return (
    <>
      <AppHeader
        actions={
          <HeaderBackButton onClick={goBack}>
            {SESSION_DETAIL_BACK_LABEL}
          </HeaderBackButton>
        }
      >
        <ClearLogo size="md" />
      </AppHeader>
      <Screen
        title={SESSION_DETAIL_TITLE}
        heading={view?.title}
        pinnedFoot={
          query.state.status === 'error' ? (
            <SessionDetailErrorAction
              error={query.state.error}
              onRetry={query.refetch}
              onOpenHistory={() => void navigate(HISTORY_PATH)}
            />
          ) : payload !== null ? (
            <SessionActions record={payload} />
          ) : null
        }
      >
        {query.state.status === 'loading' ? (
          <LoadingView label={SESSION_DETAIL_LOADING_LABEL} />
        ) : query.state.status === 'error' ? (
          <SessionDetailError
            error={query.state.error}
          />
        ) : (
          payload !== null &&
          view !== null && <SessionDetailBody view={view} />
        )}
      </Screen>
    </>
  )
}

function SessionDetailError({
  error,
}: {
  error: AppError
}) {
  return error.code === ErrorCode.PERSISTENCE_NOT_FOUND ? (
    <ErrorView
      error={error}
      title={SESSION_DETAIL_NOT_FOUND_TITLE}
    />
  ) : (
    <ErrorView error={error} title={SESSION_DETAIL_ERROR_TITLE} />
  )
}

function SessionDetailErrorAction({
  error,
  onRetry,
  onOpenHistory,
}: {
  error: AppError
  onRetry: () => void
  onOpenHistory: () => void
}) {
  const notFound = error.code === ErrorCode.PERSISTENCE_NOT_FOUND
  return (
    <PhoneFooter>
      <ActionRow>
        <Button variant="primary" onClick={notFound ? onOpenHistory : onRetry}>
          {notFound ? SESSION_DETAIL_NOT_FOUND_ACTION : 'Retry'}
        </Button>
      </ActionRow>
    </PhoneFooter>
  )
}

/** The populated record: what it was, where the answer came from, and each section. */
function SessionDetailBody({
  view,
}: {
  view: SessionDetailView
}) {
  return (
    <div style={STACK_STYLE}>
      <p style={META_STYLE}>
        <span>{view.day}</span>
        <span>{view.focus}</span>
        <span>{view.stateLabel}</span>
        {view.duration !== null && <span>{view.duration}</span>}
        <span>Intensity {view.intensity}/10</span>
      </p>
      <SessionProvenance provenance={view.provenance} />

      <Card>
        <div style={STACK_STYLE}>
          <div>
            <p style={LABEL_STYLE}>{SESSION_DETAIL_MOOD_LABEL}</p>
            <MoodReading step={view.mood} />
          </div>
          <div>
            <p style={LABEL_STYLE}>{SESSION_DETAIL_NOTES_LABEL}</p>
            {/* An unwritten note is said, not left blank: an empty panel reads
                as a note that failed to load. */}
            <p style={view.notes === null ? LABEL_STYLE : BODY_STYLE}>
              {view.notes ?? SESSION_DETAIL_NO_NOTES}
            </p>
          </div>
        </div>
      </Card>

      <section aria-label={SESSION_DETAIL_SECTIONS_LABEL} style={STACK_STYLE}>
        {view.sections.map((section) => (
          <SessionSectionCard key={section.id} section={section} />
        ))}
      </section>
    </div>
  )
}

const NOTICE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-200)',
  margin: 0,
}

/**
 * Restart and Save as favorite, side by side and unaware of each other.
 *
 * Restart reads the session's *intended at start* reconstruction when tapped —
 * the prescription as it stood before anything was logged, which is also what a
 * favorite saves — and hands it to Review. A rebuild that fails is reported
 * here and the user stays here; nothing was written, so the original session
 * is exactly as it was. Eligibility is decided from the record already on
 * screen, so an unavailable Restart is explained before anyone taps it.
 *
 * The favorite is offered for a completed session only: saving one counts it
 * as the favorite's first completion, which an abandoned session is not.
 */
function SessionActions({ record }: { record: SessionReconstruction }) {
  const navigate = useNavigate()
  const { sessions } = useWorkoutClients()
  const eligibility = restartEligibility(record)
  const sessionId = record.session.id

  const [restarting, setRestarting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function restart() {
    setRestarting(true)
    setFailure(null)

    const intended = await sessions.asIntendedAtStart(sessionId)
    if (isErr(intended)) {
      setRestarting(false)
      setFailure(RESTART_FAILED_MESSAGE)
      return
    }

    const acceptance = restartAcceptance(intended.value, todayLocal())
    if (isErr(acceptance)) {
      setRestarting(false)
      setFailure(restartFailureMessage(acceptance.error))
      return
    }

    // No favorite id: a restart belongs to no favorite, so Review's Start
    // writes a plain session and no attempt row.
    await navigate(REVIEW_PATH, { state: reviewHandoff(acceptance.value) })
  }

  return (
    <PhoneFooter>
      <div style={STACK_STYLE}>
        {failure !== null && (
          <p role="alert" style={{ ...NOTICE_STYLE, color: 'var(--text-negative)' }}>
            <span aria-hidden="true" style={{ display: 'flex' }}>
              <AlertCircle size={16} />
            </span>
            {failure}
          </p>
        )}
        {!eligibility.available && (
          <p style={NOTICE_STYLE}>
            <span aria-hidden="true" style={{ display: 'flex' }}>
              <Info size={16} />
            </span>
            {eligibility.message}
          </p>
        )}
        {(eligibility.available || record.state === 'completed') && (
          <ActionRow>
            {eligibility.available && (
              <Button
                variant="primary"
                icon={<Play size={20} />}
                loading={restarting}
                onClick={() => void restart()}
              >
                {SESSION_DETAIL_RESTART_LABEL}
              </Button>
            )}
            {record.state === 'completed' && (
              <FavoriteToggle sessionId={sessionId} compact />
            )}
          </ActionRow>
        )}
      </div>
    </PhoneFooter>
  )
}
