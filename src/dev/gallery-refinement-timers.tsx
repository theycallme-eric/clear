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
 *     filling its width with centred digits.
 *   · TASK-008 (C22, C23, C24, C61; R120, R125, R126, R133, R135, R144; P05)
 *     adds the recovered soft deadline warning to the same state, through the
 *     same owner (`DeadlineTimer`, `countdown-warning.ts`): the format
 *     countdown becomes `GalleryDeadlineWarning`, a memory-only deadline that
 *     can be inspected at ten and five seconds, run and paused, switched to a
 *     count-up race toward its cap, opened under a native log dialog (the
 *     one aura moves into the dialog's top layer, in phase), and previewed
 *     still. The movement countdown and the rest warn the same way when run
 *     into their last seconds; the elapsed-only session clock never does.
 *   · TASK-033 (REQ-033; AC-R033-02) opens that log in the accepted focused
 *     logging dialog itself — `LoggingOverlay`, with TASK-016's Balanced
 *     backdrop, its X-only header and the frame's shared Echo — as the
 *     accepted reference's urgency state does (eded158c…
 *     `gallery-refinement-flow.tsx`, "Open log over cue"), so this state shows
 *     the final composition: the CRT front glass over the readable dialog, the
 *     Balanced backdrop under it and the one warning edge in its top layer.
 *     See `docs/specs/EFFECTS_COMPOSITION_CONTRACT.md`.
 *
 * Every controller here is memory-only: the countdown and the rest are the
 * real hooks over the browser clock, the warning demonstration's deadline is
 * component state, and nothing is read from or written to an account.
 */
import { useEffect, useState } from 'react'

import { AppHeader, Button, Checkbox } from '../design-system/index'
import type { CountdownDeadline } from '../state/countdown-urgency'
import { RestTimerProvider } from '../state/rest-provider'
import { useRestTimer } from '../state/rest'
import { forTimeView, type ForTimeState } from '../state/for-time'
import { formatCountdownReading, raceReading, sessionReading } from '../state/timed-clock'
import { ForegroundEchoFrame } from '../ui/foreground-echo'
import { ForTimeClock } from '../ui/for-time-block'
import { Heading, HeadingSection } from '../ui/Heading'
import { MovementCountdown } from '../ui/movement-countdown'
import { DeadlineTimer } from '../ui/refinements/deadline-timer'
import { LoggingOverlay } from '../ui/refinements/logging-overlay'
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

/** The count-up race's cap in the warning demonstration. */
const DEMO_CAP_SECONDS = 60

/**
 * TASK-008: the warning, demonstrated on one memory-only deadline through the
 * shared owner. Its seconds are component state read against the browser
 * clock; nothing is stored or written, and nothing here is a functional clock
 * of the app's. Inspect holds the deadline at ten or five seconds (the colour,
 * and no aura while held); Run counts it down (the breathe and the one aura in
 * the last five, gone on Pause and at zero). The count-up race reads the same
 * deadline as its cap minus its elapsed time. The open log draws the same
 * deadline again inside a native dialog: still one aura, now in the dialog's
 * top layer, breathing in phase with both timers. That dialog is the shared
 * `LoggingOverlay` (TASK-033): its timer is drawn only while it is open, so a
 * closed log holds no second urgent claim.
 */
function GalleryDeadlineWarning() {
  const [seconds, setSeconds] = useState(12)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [cap, setCap] = useState(false)
  const [open, setOpen] = useState(false)
  const [still, setStill] = useState(false)
  const running = endsAt !== null && seconds > 0

  useEffect(() => {
    if (endsAt === null) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setSeconds(left)
      if (left === 0) setEndsAt(null)
    }
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [endsAt])

  const hold = (at: number) => {
    setEndsAt(null)
    setSeconds(at)
  }
  const deadline: CountdownDeadline = { remaining: seconds, running }
  const reading = cap ? raceReading(DEMO_CAP_SECONDS - seconds, seconds) : formatCountdownReading(seconds)
  const cue = <DeadlineTimer reading={reading} deadline={deadline} still={still} />

  return (
    <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }} data-gallery-deadline-warning="">
      <div className="clr-timed-actions">
        <Button variant="secondary" onClick={() => hold(10)}>Inspect 10 seconds</Button>
        <Button variant="secondary" onClick={() => hold(5)}>Inspect 5 seconds</Button>
      </div>
      <div className="clr-timed-actions">
        <Button
          variant="primary"
          onClick={() => (running ? setEndsAt(null) : setEndsAt(Date.now() + seconds * 1000))}
          disabled={!running && seconds === 0}
        >
          {running ? 'Pause' : 'Run countdown'}
        </Button>
        <Button variant="secondary" onClick={() => setCap((value) => !value)}>
          {cap ? 'Show countdown' : 'Show count-up cap'}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(true)}>Open log over the warning</Button>
      </div>
      <Checkbox label="Still preview (reduced motion)" checked={still} onChange={setStill} />
      {cue}
      <LoggingOverlay open={open} title="Log set" onClose={() => setOpen(false)}>
        {open ? (
          <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
            <p style={{ margin: 0 }}>The deadline stays visible over the open log, with one aura above it.</p>
            {cue}
          </div>
        ) : null}
      </LoggingOverlay>
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
        <Heading>The recovered countdown warning · colour at 10, one soft aura at 5</Heading>
        <GalleryDeadlineWarning />
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

/** A deadline held at eight seconds: the colour at ten, and no aura while held. */
export function DeadlineTimerLow() {
  return <DeadlineTimer reading={formatCountdownReading(8)} deadline={{ remaining: 8, running: false }} />
}

export function DeadlineTimerHeader() {
  return <DeadlineTimer reading={sessionReading(1232)} placement="header" />
}
