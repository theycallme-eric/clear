/**
 * TASK-045 (REQ-019, C45; R82, R100, R115, R116) — the accepted
 * `movement-note`, `workout-feedback` and `rest-day` states
 * (`/gallery/refinements?state=…`, reference
 * eded158cfd928d382c9a9409e2c372270312741d), drawn by the consumers the routes
 * draw, each opening its entry in the shared focused logging dialog
 * (`refinements/logging-overlay.tsx`).
 *
 * Deliberate consolidation of the reference's synthetic `GalleryLoggingMoment`
 * for these three contexts (`gallery-refinement-forms.tsx`: a sample form, a
 * synthetic Save and a synthetic retry). Here each state renders the route's
 * own owner over memory-only controllers supplied through its own client seam
 * (REUSE.md: `src/dev` supplies synthetic data and controllers; the owner keeps
 * its writer call, draft, status and error):
 *
 * - `movement-note`: the Coaching and notes panel (`ExerciseCoaching`) of a
 *   standard lift's movement and the grouped section of a superset
 *   (`GroupExerciseCoaching`), each with its "Add note — <movement>" opener
 *   and its `Notes — <movement>` dialog, over TASK-005's in-memory library and
 *   note writer (`GalleryCoachingClients`); the superset's push up refuses its
 *   write, so its failure and kept text are shown.
 * - `workout-feedback`: Summary's own `WorkoutFeedback` — the Debrief card's
 *   "Log workout feedback" and its `Workout feedback` dialog with the feeling
 *   row, the optional notes and Save and close — over an in-memory summary
 *   client: a fresh debrief, and a stored one whose first save is refused.
 * - `rest-day`: Home's own `RestDayControl` — Mark Rest Day / Change reason
 *   and its `Log rest day` dialog with the native Reason select, its effect
 *   helper, Save rest day and Cancel — over an in-memory rest-day client and
 *   a gallery-only signed-in reader: an unmarked today, and a marked today
 *   whose first change is refused.
 *
 * Nothing reaches the network or any account; every write stays in this
 * mount's memory, and nothing here is performed work.
 */
import { useMemo, useState, type ReactNode } from 'react'

import type { RestDayClient } from '../data/rest-days'
import type { SummaryClient } from '../data/summary'
import { RestDayControl } from '../app/Home'
import { WorkoutFeedback } from '../app/Summary'
import { AuthContext, type AuthContextValue } from '../state/auth-context'
import { createError, err, ErrorCode, ok } from '../state/errors'
import { weekStrip } from '../state/home'
import { QueryClient, QueryClientContext } from '../state/query'
import { restDayMarks, RestDayContext, useRestDaysQuery } from '../state/rest-day-queries'
import type { RestDayReason, RestDayRow } from '../state/schemas'
import { SummaryContext } from '../state/summary-queries'
import { structureIdentity } from '../state/workout-progress'
import { todayLocal } from '../state/favorites'
import { ExerciseCoaching, GroupExerciseCoaching } from '../ui/exercise-coaching'
import { Heading, HeadingSection } from '../ui/Heading'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import { galleryExerciseProgress } from './gallery-refinement-coaching-data'
import { STANDARD_BLOCK, SUPERSET_BLOCK } from './gallery-refinement-cards-data'
import { savedSessionRow } from './gallery-refinement-overview-data'

/** A labelled specimen inside one state. */
function Specimen({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <HeadingSection className="clr-stack" data-gallery-logging-moment={id}>
      <Heading className="label">{title}</Heading>
      {children}
    </HeadingSection>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// `?state=movement-note`
// ─────────────────────────────────────────────────────────────────────────────

/** A standard lift's own panel, and a superset's grouped sections. */
export function GalleryMovementNote() {
  const [standard] = useState(() => galleryExerciseProgress(STANDARD_BLOCK, 40))
  const [pair] = useState(() => galleryExerciseProgress(SUPERSET_BLOCK, 41))
  const [refused] = useState(() => new Set([pair[1]!.exerciseId]))
  return (
    <GalleryCoachingClients failingNotes={refused}>
      <div className="clr-stack" data-gallery-movement-note="">
        <Specimen id="standard" title="Standard lift · the movement’s own Coaching and notes">
          <ExerciseCoaching exercise={standard[0]!} />
        </Specimen>
        <Specimen id="superset" title="Superset · each movement’s own section; the push up’s write is refused">
          <GroupExerciseCoaching format={structureIdentity(SUPERSET_BLOCK).format} exercises={pair} />
        </Specimen>
      </div>
    </GalleryCoachingClients>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// `?state=workout-feedback`
// ─────────────────────────────────────────────────────────────────────────────

const FEEDBACK_SESSION = '00000000-0000-4000-8000-000000045001'
const STORED_SESSION = '00000000-0000-4000-8000-000000045002'

/** Every summary read refuses; the debrief's save answers from memory. */
function memorySummary(refuseFirst: boolean): SummaryClient {
  let refusals = refuseFirst ? 1 : 0
  return {
    latest: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
    streak: async () => err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
    async saveDebrief(sessionId, debrief) {
      if (refusals > 0) {
        refusals -= 1
        return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      }
      const row = savedSessionRow({ sessionId })
      return ok({ session: { ...row, mood: debrief.mood, session_notes: debrief.session_notes }, durationMins: null })
    },
  }
}

function FeedbackSpecimen({
  id,
  title,
  session,
  refuseFirst,
}: {
  id: string
  title: string
  session: { id: string; mood: number | null; session_notes: string | null }
  refuseFirst: boolean
}) {
  const [client] = useState(() => memorySummary(refuseFirst))
  const [saved, setSaved] = useState<string | null>(null)
  return (
    <Specimen id={id} title={title}>
      <SummaryContext value={client}>
        <WorkoutFeedback
          session={session}
          onSaved={({ session: row }) =>
            setSaved(`Saved in memory: feeling ${row.mood ?? 'not answered'}, notes ${row.session_notes === null ? 'not written' : `“${row.session_notes}”`}.`)
          }
        />
      </SummaryContext>
      {saved === null ? null : <p role="status" style={{ margin: 0 }}>{saved}</p>}
    </Specimen>
  )
}

/** A fresh debrief, and a stored one whose first save is refused. */
export function GalleryWorkoutFeedback() {
  return (
    <div className="clr-stack" data-gallery-workout-feedback="">
      <FeedbackSpecimen
        id="fresh"
        title="A fresh debrief"
        session={{ id: FEEDBACK_SESSION, mood: null, session_notes: null }}
        refuseFirst={false}
      />
      <FeedbackSpecimen
        id="stored"
        title="A stored debrief · the first save is refused"
        session={{ id: STORED_SESSION, mood: 4, session_notes: 'Overhead felt heavy today.' }}
        refuseFirst
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// `?state=rest-day`
// ─────────────────────────────────────────────────────────────────────────────

const GALLERY_READER = '00000000-0000-4000-8000-000000045010'

/** A gallery-only signed-in reader: the rest-day read is keyed by a user. */
const GALLERY_AUTH: AuthContextValue = {
  status: 'authenticated',
  user: { id: GALLERY_READER, email: null },
  error: null,
  signOut: async () => ok(undefined),
}

function restRow(day: string, reason: RestDayReason, n: number): RestDayRow {
  const at = new Date().toISOString()
  return {
    id: `00000000-0000-4000-8000-0000000450${String(20 + n).padStart(2, '0')}`,
    user_id: GALLERY_READER,
    day,
    reason,
    note: null,
    created_at: at,
    updated_at: at,
  }
}

/** The marks held in memory; the first mark is refused when asked. */
function memoryRestDays(initial: RestDayReason | null, refuseFirst: boolean): RestDayClient {
  const today = todayLocal()
  let rows: RestDayRow[] = initial === null ? [] : [restRow(today, initial, 0)]
  let refusals = refuseFirst ? 1 : 0
  return {
    recent: async () => ok(rows),
    async mark(mark) {
      if (refusals > 0) {
        refusals -= 1
        return err(createError(ErrorCode.PERSISTENCE_WRITE_FAILED))
      }
      const row = restRow(mark.day, mark.reason, rows.length + 1)
      rows = [row, ...rows.filter((entry) => entry.day !== mark.day)]
      return ok(row)
    },
  }
}

/** Home's week read, as Home places today in it, over the memory marks. */
function RestDayToday() {
  const restDays = useRestDaysQuery()
  const marks = restDayMarks(restDays)
  const week = useMemo(() => weekStrip([], { restDays: marks ?? undefined }), [marks])
  return <RestDayControl today={week.find((day) => day.isToday)} read={restDays.state.status} />
}

function RestDaySpecimen({
  id,
  title,
  initial,
  refuseFirst,
}: {
  id: string
  title: string
  initial: RestDayReason | null
  refuseFirst: boolean
}) {
  const [cache] = useState(() => new QueryClient())
  const [client] = useState(() => memoryRestDays(initial, refuseFirst))
  return (
    <Specimen id={id} title={title}>
      <AuthContext value={GALLERY_AUTH}>
        <QueryClientContext value={cache}>
          <RestDayContext value={client}>
            <RestDayToday />
          </RestDayContext>
        </QueryClientContext>
      </AuthContext>
    </Specimen>
  )
}

/** An unmarked today, and a marked today whose first change is refused. */
export function GalleryRestDay() {
  return (
    <div className="clr-stack" data-gallery-rest-day="">
      <RestDaySpecimen id="unmarked" title="An unmarked day · Mark Rest Day" initial={null} refuseFirst={false} />
      <RestDaySpecimen
        id="marked"
        title="A marked day · Change reason; the first change is refused"
        initial="rest"
        refuseFirst
      />
    </div>
  )
}
