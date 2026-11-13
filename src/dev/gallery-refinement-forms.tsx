/**
 * The sixteen logging moments, rendered by the real Round 7 components inside
 * the memory-only gallery runtime. "Open …" remounts the scene and clicks the
 * same real controls a person would to reach the approved state.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Input, Pencil, Rest } from '../design-system/index'
import { REST_DAY_REASONS, REST_DAY_REASON_EFFECTS, REST_DAY_REASON_LABELS, type RestDayReason } from '../state/rest-days'
import { ActionGlow } from '../ui/action-glow'
import { Card } from '../ui/card'
import { CircuitBlock } from '../ui/circuit-block'
import { ActionGroup } from '../ui/composition'
import { FeelingRow } from '../ui/feeling-row'
import { LoggingOverlay } from '../ui/logging-overlay'
import { Select } from '../ui/select'
import { StandardBlock } from '../ui/standard-block'
import { SupersetBlock } from '../ui/superset-block'
import { TimedWorkoutFlow } from '../ui/timed-workout-flow'
import type { LoggingContext } from './gallery-refinement-data'
import { ALL_SETS_SAVED, CIRCUIT, DISTANCE_MOVEMENT, ONE_SAVED_SET, OTHER_LIFT, PRIMARY_LIFT, SUPERSET, TIMED_MOVEMENT, timedBlock, type TimedKind } from './gallery-refinement-fixtures'
import { advance, wait, click, clickLabel, clickText, galleryPresentation, GalleryRuntime, memoryStorage, useGalleryClock, useSceneDriver, type DriverStep, type GalleryClock } from './gallery-refinement-runtime'

interface Scene {
  readonly render: (clock: GalleryClock) => ReactNode
  readonly steps: readonly DriverStep[]
  readonly seed?: Parameters<typeof GalleryRuntime>[0]['seed']
  readonly section?: string
}

const START_TIMED = clickText(/^Start /)
/** Past the block's own cap, so the flow ends itself and opens Log results. */
const PAST_CAP = advance(scene => (Number(scene.querySelector<HTMLElement>('[data-cap-seconds]')?.dataset.capSeconds ?? 900) + 1) * 1000)

function timedScene(kind: TimedKind, options: { multi?: boolean; rounds?: number } = {}): Scene {
  const block = timedBlock(kind, options)
  return { render: clock => <TimedWorkoutFlow block={block} format={kind} now={clock.now} />, steps: [START_TIMED, PAST_CAP] }
}

function sceneFor(context: LoggingContext, rounds: number): Scene {
  switch (context) {
    case 'anchor': return { render: () => <StandardBlock block={PRIMARY_LIFT} />, steps: [clickText('Rest')], section: 'Primary lift' }
    case 'other-lift': return { render: () => <StandardBlock block={OTHER_LIFT} />, steps: [clickText('Rest')], section: 'Accessories' }
    case 'timed-movement': return { render: () => <StandardBlock block={TIMED_MOVEMENT} />, steps: [clickText('Rest')] }
    case 'distance-movement': return { render: () => <StandardBlock block={DISTANCE_MOVEMENT} />, steps: [clickText('Rest')] }
    case 'extra-set': return { render: () => <StandardBlock block={PRIMARY_LIFT} />, steps: [clickText('Rest')], seed: ALL_SETS_SAVED, section: 'Primary lift' }
    case 'set-correction': return { render: () => <StandardBlock block={PRIMARY_LIFT} />, steps: [clickLabel('Edit set 1')], seed: ONE_SAVED_SET, section: 'Primary lift' }
    case 'superset': return { render: () => <SupersetBlock block={SUPERSET} />, steps: [clickText('Rest')], section: 'Accessories' }
    case 'circuit-round': return { render: clock => <CircuitScene clock={clock} />,
      steps: [clickText('Start round 1'), advance(32_000), wait(600), clickText('Finish round 1')] }
    case 'circuit-movement': return { render: clock => <CircuitScene clock={clock} />, steps: [clickText('Rest')] }
    case 'movement-note': return { render: () => <SupersetBlock block={SUPERSET} />, steps: [
      click(button => /^coaching and notes/i.test(button.textContent?.trim() ?? '') && button.getAttribute('aria-expanded') !== 'true'),
      clickText(/^Add note/),
    ], section: 'Accessories' }
    case 'workout-feedback': return { render: () => <WorkoutFeedback />, steps: [clickText('Log workout feedback')] }
    case 'rest-day': return { render: () => <RestDay />, steps: [clickText('Mark Rest Day')] }
    case 'emom': return timedScene('emom')
    case 'amrap': return timedScene('amrap', { multi: true })
    case 'for_time': return timedScene('for_time', { multi: true })
    case 'ladder': return timedScene('ladder', { rounds })
  }
}

function CircuitScene({ clock }: { clock: GalleryClock }) {
  const [storage] = useState(memoryStorage)
  return <CircuitBlock block={CIRCUIT} storage={storage} now={clock.now} />
}

/**
 * Composed from the primitives the Summary screen's feedback dialog uses
 * (Summary needs the account's session, so it cannot mount here).
 */
function WorkoutFeedback() {
  const [open, setOpen] = useState(false)
  const [mood, setMood] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  return <Card heading="Debrief">
    <Button variant="primary" onClick={() => setOpen(true)}>Log workout feedback</Button>
    <LoggingOverlay open={open} title="Workout feedback" onClose={() => setOpen(false)}>
      <form noValidate className="clr-stack" onSubmit={event => { event.preventDefault(); setOpen(false) }}>
        <FeelingRow value={mood} onChange={setMood} />
        <Input label="Notes · optional" name="session_notes" multiline rows={4} value={notes} onChange={setNotes}
          placeholder="Overhead felt heavy today. Lateral raises easy." />
        <Button type="submit" variant="primary">Save and close</Button>
      </form>
    </LoggingOverlay>
  </Card>
}

/** Composed from the primitives Home's rest-day control uses in its dialog. */
function RestDay() {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<RestDayReason | null>(null)
  const [reason, setReason] = useState<RestDayReason>('rest')
  return <Card heading="Rest day"><div className="clr-stack">
    {saved !== null && <p style={{ margin: 0 }}>{`Today: ${REST_DAY_REASON_LABELS[saved]}.`}</p>}
    <ActionGroup><ActionGlow>
      <Button variant="secondary" icon={saved === null ? <Rest size={20} /> : <Pencil size={20} />} onClick={() => { setReason(saved ?? 'rest'); setOpen(true) }}>
        {saved === null ? 'Mark Rest Day' : 'Change reason'}
      </Button>
    </ActionGlow></ActionGroup>
    <LoggingOverlay open={open} title="Log rest day" onClose={() => setOpen(false)}>
      <div className="clr-stack clr-stack--tight">
        <Select label="Reason" value={reason} options={REST_DAY_REASONS.map(value => ({ value, label: REST_DAY_REASON_LABELS[value] }))}
          helperText={REST_DAY_REASON_EFFECTS[reason]} onChange={value => setReason(value as RestDayReason)} />
        <ActionGroup className="clr-action-group--paired">
          <Button variant="primary" onClick={() => { setSaved(reason); setOpen(false) }}>Save rest day</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        </ActionGroup>
      </div>
    </LoggingOverlay>
  </div></Card>
}

/** One switch per gallery state: the next sample save fails once, then saves work again. */
class FailureSwitch {
  #armed = false
  arm() { this.#armed = true }
  take(): boolean { const armed = this.#armed; this.#armed = false; return armed }
}

const TIMED_CONTEXTS: readonly LoggingContext[] = ['emom', 'amrap', 'for_time', 'ladder']

export function GalleryLoggingMoment({ context = 'anchor', rounds = 4, title, autoOpen = false }: {
  context?: LoggingContext; rounds?: number; title?: string; autoOpen?: boolean
}) {
  const clock = useGalleryClock()
  const [run, setRun] = useState(autoOpen ? 1 : 0)
  const scene = useMemo(() => sceneFor(context, rounds), [context, rounds])
  const [{ failure, presentation }] = useState(() => {
    const failure = new FailureSwitch()
    return { failure, presentation: galleryPresentation(async () => {
      if (failure.take()) throw new Error('Sample save failure')
    }) }
  })
  return <div className="clr-stack">
    <div className="clr-row">
      <Button variant="secondary" onClick={() => setRun(value => value + 1)}>Open {title ?? context}</Button>
      {TIMED_CONTEXTS.includes(context) && <Button variant="quiet" onClick={() => failure.arm()}>Fail next sample save</Button>}
    </div>
    <DrivenScene key={run} scene={scene} drive={run > 0} clock={clock} presentation={presentation} />
  </div>
}

function DrivenScene({ scene, drive, clock, presentation }: {
  scene: Scene; drive: boolean; clock: GalleryClock; presentation: ReturnType<typeof galleryPresentation>
}) {
  const root = useRef<HTMLDivElement>(null)
  useSceneDriver(root, clock, drive ? scene.steps : null)
  return <div ref={root} data-gallery-scene="">
    <GalleryRuntime clock={clock} presentation={presentation} seed={scene.seed} section={scene.section}>{scene.render(clock)}</GalleryRuntime>
  </div>
}
