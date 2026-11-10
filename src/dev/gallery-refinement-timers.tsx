/**
 * TASK-007 (C19, C20, C21; G06; R15, R17, R42, R49, R53, R67, R96, R102,
 * R103, R119) — the accepted whole timer body and the workout header, drawn by
 * the actual consumers the `/workout` route draws (accepted gallery reference
 * eded158cfd928d382c9a9409e2c372270312741d, REUSE.md "Whole timer body").
 *
 *   · `?state=cards` leads its Workout context with `GalleryWorkoutHeader`:
 *     the route's own header composition — the shipped `AppHeader` with the
 *     `clr-workout-header` recipe, the actual `GlobalTimer` and `WorkoutMenu` —
 *     on its one accepted row. A session past an hour is the genuine wider
 *     reading; it stays on that row too. No two-row header is drawn, because
 *     none was shown or accepted (R119).
 *   · `?state=urgency` (`GalleryTimerFrames`) draws the clocks' own consumers
 *     in their whole frames: a movement's countdown with its own Start, Pause
 *     and Reset; the For Time / timed-ladder race clock counting up toward its
 *     cap, running, paused and in its last seconds; a format countdown in its
 *     shipped low state; the session's one rest under the actual rest
 *     provider; and the elapsed-only session clock. Every frame is one chamfer
 *     filling its width with centred digits. The recovered soft deadline
 *     warning and its peripheral cue (C22–C24, C61) are TASK-008's, added to
 *     this same state through the same owner; nothing here draws them yet.
 *
 * Every controller here is memory-only: the countdown and the rest are the
 * real hooks over the browser clock, and nothing is read from or written to
 * an account.
 */
import { AppHeader, Button } from '../design-system/index'
import { RestTimerProvider } from '../state/rest-provider'
import { useRestTimer } from '../state/rest'
import { forTimeView, type ForTimeState } from '../state/for-time'
import { formatCountdownReading, sessionReading } from '../state/timed-clock'
import { ForegroundEchoFrame } from '../ui/foreground-echo'
import { ForTimeClock } from '../ui/for-time-block'
import { Heading, HeadingSection } from '../ui/Heading'
import { MovementCountdown } from '../ui/movement-countdown'
import { DeadlineTimer } from '../ui/refinements/deadline-timer'
import { GlobalTimer, RestTimerBar, WorkoutMenu } from '../ui/workout-chrome'

const noop = () => {}

/** The accepted reference's session reading, and one past the hour. */
const HEADER_READINGS = [1232, 3723] as const

/**
 * The route's workout header, as `Screen` draws it for `/workout`: the title
 * in the header's heading face, the session clock's compact readout and the
 * framed menu, on one row. The title is a paragraph here because the gallery
 * page already has its one level-one heading.
 */
export function GalleryWorkoutHeader({ seconds = HEADER_READINGS[0] }: { seconds?: number }) {
  return (
    <AppHeader
      className="clr-workout-header"
      data-gallery-workout-header=""
      meta={<GlobalTimer seconds={seconds} />}
      actions={<ForegroundEchoFrame><WorkoutMenu onAbandon={noop} /></ForegroundEchoFrame>}
    >
      <p className="h1 clr-screen__title">Workout</p>
    </AppHeader>
  )
}

/** Both readings, each on the one accepted row. */
export function GalleryWorkoutHeaders() {
  return (
    <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
      {HEADER_READINGS.map((seconds) => <GalleryWorkoutHeader key={seconds} seconds={seconds} />)}
    </div>
  )
}

const T0 = Date.parse('2026-11-09T09:00:00.000Z')
const iso = (seconds: number) => new Date(T0 + seconds * 1000).toISOString()

/** A For Time race over its fifteen-minute cap, frozen at a moment. */
function raceAt(state: ForTimeState, elapsed: number) {
  return forTimeView(state, { capSeconds: 900, size: 1 }, elapsed)
}

const RACES = [
  { name: 'Running, counting up toward the cap', view: raceAt({ startedAt: iso(0), finishedAt: null }, 383) },
  { name: 'Paused: the clock and its cap held', view: raceAt({ startedAt: iso(0), finishedAt: null, pausedAt: iso(383) }, 383) },
  { name: 'The last seconds before the cap', view: raceAt({ startedAt: iso(0), finishedAt: null }, 893) },
] as const

/** The session's one rest, raised through the actual provider's own API. */
function RestSpecimen() {
  const rest = useRestTimer()
  return (
    <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
      <Button
        variant="secondary"
        onClick={() => rest.start({ exerciseId: 'gallery-back-squat', label: 'back squat', seconds: 90 })}
      >
        Start a 90-second rest
      </Button>
      <RestTimerBar />
    </div>
  )
}

/** The stable `urgency` state's frames: every clock's actual consumer, whole. */
export function GalleryTimerFrames() {
  return (
    <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }} data-gallery-timer-frames="">
      <HeadingSection className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <Heading>A movement&apos;s countdown · its own Start, Pause and Reset</Heading>
        <MovementCountdown seconds={30} movement="hollow body hold" />
      </HeadingSection>
      <HeadingSection className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <Heading>Count-up to a cap · For Time and the timed ladder</Heading>
        {RACES.map(({ name, view }) => (
          <div key={name} className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
            <p>{name}</p>
            <ForTimeClock view={view} />
          </div>
        ))}
      </HeadingSection>
      <HeadingSection className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <Heading>A format countdown · a minute&apos;s last seconds</Heading>
        <DeadlineTimer reading={formatCountdownReading(8)} low />
      </HeadingSection>
      <HeadingSection className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <Heading>The session&apos;s rest · the same card in the footer and the open log</Heading>
        <RestTimerProvider>
          <RestSpecimen />
        </RestTimerProvider>
      </HeadingSection>
      <HeadingSection className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <Heading>Elapsed only · the session clock, no deadline</Heading>
        <DeadlineTimer reading={sessionReading(5)} />
      </HeadingSection>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry specimens of the shared owner
// ─────────────────────────────────────────────────────────────────────────────

export function DeadlineTimerBody() {
  return <DeadlineTimer reading={formatCountdownReading(42)} />
}

export function DeadlineTimerLow() {
  return <DeadlineTimer reading={formatCountdownReading(8)} low />
}

export function DeadlineTimerHeader() {
  return <DeadlineTimer reading={sessionReading(1232)} placement="header" />
}
