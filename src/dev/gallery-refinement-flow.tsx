/** Live timed flows: the real Round 7 TimedWorkoutFlow on the gallery's memory runtime and clock. */
import { useMemo, useRef, useState } from 'react'
import { Button } from '../design-system/index'
import { TimedWorkoutFlow } from '../ui/timed-workout-flow'
import { timedBlock, type TimedKind } from './gallery-refinement-fixtures'
import { advance, clickText, galleryPresentation, GalleryRuntime, useGalleryClock, useSceneDriver, type DriverStep } from './gallery-refinement-runtime'

export function LiveFlow({ kind, rounds = 4, steps = null }: { kind: TimedKind; rounds?: number; steps?: readonly DriverStep[] | null }) {
  const clock = useGalleryClock()
  const root = useRef<HTMLDivElement>(null)
  const presentation = useMemo(() => galleryPresentation(async () => {}), [])
  const block = useMemo(() => timedBlock(kind, { rounds }), [kind, rounds])
  useSceneDriver(root, clock, steps)
  return <div ref={root} data-gallery-scene="">
    <GalleryRuntime clock={clock} presentation={presentation}><TimedWorkoutFlow block={block} format={kind} now={clock.now} /></GalleryRuntime>
  </div>
}

/** The ladder before it starts; Start, rung progress, Finish and the log are all live. */
export function GalleryLadderFlow({ rounds = 4 }: { rounds?: number }) {
  return <LiveFlow kind="ladder" rounds={rounds} />
}

const START = clickText(/^Start /)
const URGENCY = [
  { id: 'emom-10', label: 'EMOM · 10 seconds', kind: 'emom', steps: [START, advance(50_000)] },
  { id: 'emom-5', label: 'EMOM · 5 seconds', kind: 'emom', steps: [START, advance(55_000)] },
  { id: 'for-time-5', label: 'For Time · 5 seconds to cap', kind: 'for_time', steps: [START, advance(895_000)] },
  { id: 'ladder-elapsed', label: 'Ladder · elapsed', kind: 'ladder', steps: [START, advance(32_000)] },
] as const satisfies readonly { id: string; label: string; kind: TimedKind; steps: readonly DriverStep[] }[]

/** Each button starts the real flow and moves its clock to that moment; the countdown then runs live. */
export function GalleryUrgency() {
  const [chosen, setChosen] = useState<{ id: (typeof URGENCY)[number]['id']; run: number }>({ id: 'emom-10', run: 0 })
  const current = URGENCY.find(option => option.id === chosen.id) ?? URGENCY[0]
  return <div className="clr-stack">
    <div className="clr-row">{URGENCY.map(option =>
      <Button key={option.id} variant={option.id === chosen.id ? 'primary' : 'secondary'} aria-pressed={option.id === chosen.id}
        onClick={() => setChosen(value => ({ id: option.id, run: value.run + 1 }))}>{option.label}</Button>)}
    </div>
    <LiveFlow key={`${chosen.id}-${chosen.run}`} kind={current.kind} steps={current.steps} />
  </div>
}
