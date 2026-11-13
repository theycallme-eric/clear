/** Safe local data; gallery and workout render the same proposed owners. */
import { CountdownBar, GlobalTimer } from '../ui/workout-chrome'
import { Button } from '../design-system/index'
import { LoggingOverlay } from '../ui/logging-overlay'
import { useState } from 'react'
import { BlockCompletionContext } from '../state/block-completion'
import type { BlockProgress } from '../state/workout-progress'
import { Card } from '../ui/card'
import { LadderCompletion, LadderPrescription } from '../ui/ladder-rungs'
import { QuantitySelector } from '../ui/quantity-selector'
import { TimedResultLog } from '../ui/timed-result-log'
import { TimedWorkoutFlow } from '../ui/timed-workout-flow'
import { WorkoutExperiencePresentationProvider, type WorkoutExperiencePresentation } from '../ui/workout-experience-presentation'

const SAMPLE: BlockProgress = {
  blockId: 'gallery-timed-block', structureType: 'amrap', repScheme: 'fixed',
  identity: { label: 'AMRAP', detail: '8 MIN', repScheme: null, glyph: 'Stopwatch' },
  status: 'not_started', exerciseCount: 1, timerType: 'countdown', timerSeconds: 480, rounds: null, roundRestSeconds: null,
  exercises: [{ exerciseId: 'gallery-timed-exercise', blockId: 'gallery-timed-block', position: 1, status: 'not_started', setLogs: [],
    prescription: {
      id: 'gallery-timed-exercise', block_id: 'gallery-timed-block', exercise_id: 'kb-swing', order_index: 0,
      modality: 'reps', sets: 1, target_kind: 'fixed', target_value: 12, target_min: null, target_max: null,
      target_sequence: null, per_side: false, distance_unit: null, rest_seconds: null, tempo: null,
      load_type: 'absolute', load_value: 24, equipment_used: 'kettlebell', is_interval_exercise: false,
      slot_id: 'gallery-slot', replaces_id: null, origin: 'generated', created_at: '2026-11-02T12:00:00Z',
      superseded_at: null, revision_status: 'active', execution_status: 'not_started', exercise_notes: null,
    },
  }],
}

export function GalleryQuantity({ initial = null, wide = true }: { initial?: number | null; wide?: boolean }) {
  const [value, setValue] = useState(initial)
  return <Card><div data-counter-style={wide ? 'wide' : 'compact'}>
    <QuantitySelector label="Rounds completed" value={value} onChange={setValue} />
  </div></Card>
}

export function GalleryTimedLog({ hierarchy = 'simple' }: { hierarchy?: 'simple' | 'grouped' }) {
  const [saved, setSaved] = useState(false)
  return <Card><TimedResultLog accessibleName={`Log section results: ${hierarchy} hierarchy`} hierarchy={hierarchy} block={SAMPLE} format="amrap" finished={false} weightUnit="kg"
    onSave={async () => { setSaved(true) }} />{saved && <p role="status">Sample log saved</p>}</Card>
}

export function GalleryTimedFlow({ presentation }: { presentation: WorkoutExperiencePresentation }) {
  return <WorkoutExperiencePresentationProvider value={{ ...presentation, timedWorkflows: {
    logPresentation: 'inline', counterStyle: 'wide', saveResult: async () => {},
  } }}>
    <BlockCompletionContext value={{ reportOutcome: () => {}, isBlockRecorded: () => false }}>
      <TimedWorkoutFlow block={{ ...SAMPLE, exercises: SAMPLE.exercises.map(exercise => ({ ...exercise,
        prescription: { ...exercise.prescription, exercise_id: 'burpee', equipment_used: 'bodyweight', load_type: 'bodyweight', load_value: null },
      })) }} format="amrap" />
    </BlockCompletionContext>
  </WorkoutExperiencePresentationProvider>
}

export function GalleryLadderCompletion({ emphasis = 'round' }: { emphasis?: 'round' | 'reps' }) {
  const [completed, setCompleted] = useState<number | null>(3)
  return <Card><LadderCompletion unit="reps" completedThrough={completed} onChange={setCompleted}
    emphasis={emphasis} rungs={[2, 4, 6, 8, 10, 12, 14, 16].map((target, i) => ({ number: i + 1, targets: [target] }))} /></Card>
}


export function GalleryLoggingOverlay({ variant, backdrop = 'balanced', long = false }: { variant: 'dialog' | 'sheet'; backdrop?: 'balanced' | 'dark' | 'soft'; long?: boolean }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const first = SAMPLE.exercises[0]
  const block: BlockProgress = long ? { ...SAMPLE, structureType: 'for_time',
    identity: { label: 'LADDER', detail: '12 rounds', repScheme: null, glyph: 'Ladder' },
    exercises: [
      { ...first, prescription: { ...first.prescription, target_kind: 'sequence', target_value: null,
        target_sequence: Array.from({ length: 12 }, (_, index) => (index + 1) * 2) } },
      { ...first, exerciseId: 'gallery-companion', prescription: { ...first.prescription, exercise_id: 'burpee',
        equipment_used: 'bodyweight', load_type: 'bodyweight', load_value: null, target_value: 4 } },
    ] } : SAMPLE
  return <Card><Button onClick={() => setOpen(true)}>Open {variant} log</Button>
    <LoggingOverlay open={open} title="Log results" variant={variant} backdrop={backdrop} onClose={() => setOpen(false)}>
      {saved ? <p role="status">Sample log saved</p> : <TimedResultLog embedded block={block} format={long ? 'ladder' : 'amrap'} finished={false}
        weightUnit="kg" onSave={async () => setSaved(true)} />}
    </LoggingOverlay>
  </Card>
}

export function GalleryLadderPrescription({ live = false }: { live?: boolean }) {
  const [completed, setCompleted] = useState<number | null>(null)
  const first = SAMPLE.exercises[0]
  const sequence = Array.from({ length: 12 }, (_, i) => (i + 1) * 2)
  return <Card><LadderPrescription weightUnit="kg" completedThrough={completed} onProgress={live ? setCompleted : undefined} exercises={[
    { ...first, prescription: { ...first.prescription, target_kind: 'sequence', target_value: null, target_sequence: sequence } },
    { ...first, exerciseId: 'companion', prescription: { ...first.prescription, exercise_id: 'burpee', equipment_used: 'bodyweight', load_type: 'bodyweight', load_value: null, target_value: 4 } },
  ]} /></Card>
}


/** Manual clock controller around the real countdown owner; no functional timer copy. */
export function GalleryCountdownUrgency() {
  const [seconds, setSeconds] = useState(12)
  const [running, setRunning] = useState(true)
  return <div className="clr-stack">
    <div className="clr-row"><Button onClick={() => setSeconds(10)}>10 seconds</Button><Button onClick={() => setSeconds(5)}>5 seconds</Button><Button onClick={() => setSeconds(0)}>Time complete</Button><Button onClick={() => setRunning(value => !value)}>{running ? 'Pause cue' : 'Resume cue'}</Button></div>
    <CountdownBar label="Countdown fixture" remainingSeconds={seconds} totalSeconds={60} running={running} actions={<span>{running ? 'Running' : 'Paused'}</span>} />
    <GlobalTimer seconds={5} />
  </div>
}
