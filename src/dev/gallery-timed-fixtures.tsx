/** Safe local data; gallery and workout render the same proposed owners. */
import { useState } from 'react'
import { BlockCompletionContext } from '../state/block-completion'
import type { BlockProgress } from '../state/workout-progress'
import { Card } from '../ui/card'
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

export function GalleryQuantity({ initial = null, wide = false }: { initial?: number | null; wide?: boolean }) {
  const [value, setValue] = useState(initial)
  return <Card><div data-counter-style={wide ? 'wide' : 'compact'}>
    <QuantitySelector label="Rounds completed" value={value} onChange={setValue} />
  </div></Card>
}

export function GalleryTimedLog() {
  const [saved, setSaved] = useState(false)
  return <Card><TimedResultLog block={SAMPLE} format="amrap" finished={false} weightUnit="kg"
    onSave={async () => { setSaved(true) }} />{saved && <p role="status">Sample log saved</p>}</Card>
}

export function GalleryTimedFlow({ presentation }: { presentation: WorkoutExperiencePresentation }) {
  return <WorkoutExperiencePresentationProvider value={{ ...presentation, timedWorkflows: {
    logPresentation: 'inline', counterStyle: 'compact', saveResult: async () => {},
  } }}>
    <BlockCompletionContext value={{ reportOutcome: () => {}, isBlockRecorded: () => false }}>
      <TimedWorkoutFlow block={{ ...SAMPLE, exercises: SAMPLE.exercises.map(exercise => ({ ...exercise,
        prescription: { ...exercise.prescription, exercise_id: 'burpee', equipment_used: 'bodyweight', load_type: 'bodyweight', load_value: null },
      })) }} format="amrap" />
    </BlockCompletionContext>
  </WorkoutExperiencePresentationProvider>
}
