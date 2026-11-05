import type { BlockProgress } from '../state/workout-progress'
/** Stable gallery IDs; every form is a synthetic controller over the same owners. */
export const LOGGING_CONTEXTS = [
  ['anchor', 'Anchor / primary lift'], ['other-lift', 'Other lift'],
  ['timed-movement', 'Timed movement'], ['distance-movement', 'Distance movement'],
  ['extra-set', 'Extra set'], ['set-correction', 'Saved-set correction'],
  ['superset', 'Superset round'], ['circuit-round', 'Circuit round / take back'],
  ['circuit-movement', 'Circuit movement entry'], ['movement-note', 'Movement note'],
  ['workout-feedback', 'Workout feedback'], ['rest-day', 'Rest day / reason change'],
  ['emom', 'EMOM results'], ['amrap', 'AMRAP results'],
  ['for_time', 'For Time results'], ['ladder', 'Ladder results'],
] as const
export type LoggingContext = typeof LOGGING_CONTEXTS[number][0]

export const SAMPLE: BlockProgress = {
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

export function sampleBlock(format: 'emom' | 'amrap' | 'for_time' | 'ladder', rounds = 4): BlockProgress {
  const first = SAMPLE.exercises[0]
  if (format === 'ladder') return { ...SAMPLE, structureType:'for_time', repScheme:'ladder_up', rounds,
    exercises:[
      {...first, prescription:{...first.prescription, exercise_id:'push-up', equipment_used:'bodyweight', load_type:'bodyweight', load_value:null, target_kind:'sequence', target_value:null, target_sequence:Array.from({length:rounds},(_,i)=>(i+1)*2)}},
      {...first, exerciseId:'gallery-companion', prescription:{...first.prescription,id:'gallery-companion',exercise_id:'burpee',equipment_used:'bodyweight',load_type:'bodyweight',load_value:null,target_value:4}},
    ] }
  return { ...SAMPLE, structureType:format,
    exercises:format === 'for_time' ? [{...first,prescription:{...first.prescription,exercise_id:'wall-ball',equipment_used:'medicine_ball',load_value:9,target_value:40}}] : SAMPLE.exercises }
}
