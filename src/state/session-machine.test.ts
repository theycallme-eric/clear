import { describe, expect, it } from 'vitest'

import { Constants } from '../data/database.types'
import { ErrorCode } from './errors'
import type { SessionSnapshot } from './schemas'
import {
  INITIAL_SESSION_STATE,
  SESSION_EVENTS,
  SESSION_STATES,
  canTransition,
  eventsFrom,
  isTerminal,
  resumePoint,
  sessionStateOf,
  transition,
  type SessionEvent,
  type SessionState,
} from './session-machine'

// SES-01a. The machine is pure, so these are the acceptance criterion
// "machine transitions unit-tested, including the abandon path" in full: every
// state against every event, both directions, with the abandon path named
// rather than left to a table nobody reads.

const stamp = '2026-09-22T09:00:00.000+00:00'

/** The three timestamps, in whichever combination a state is made of. */
const timestamps = (state: SessionState) => ({
  started_at: state === 'active' || state === 'completed' ? stamp : null,
  completed_at: state === 'completed' ? stamp : null,
  abandoned_at: state === 'abandoned' ? stamp : null,
})

describe('the vocabulary comes from the migration (SES-01a)', () => {
  it('is the generated session_state enum, not a second list', () => {
    expect(SESSION_STATES).toBe(Constants.public.Enums.session_state)
    expect(SESSION_STATES).toEqual(['prescribed', 'active', 'completed', 'abandoned'])
  })

  it('starts a persisted session at prescribed', () => {
    // Acceptance is the constructor: a workout that was never persisted has no
    // row, so it has no state here either.
    expect(INITIAL_SESSION_STATE).toBe('prescribed')
  })
})

describe('transitions (SES-01a)', () => {
  it('walks accept → active → completed', () => {
    const started = transition(INITIAL_SESSION_STATE, 'start')
    expect(started).toEqual({ ok: true, value: 'active' })

    expect(transition('active', 'complete')).toEqual({ ok: true, value: 'completed' })
  })

  it('abandons from prescribed — a workout nobody started', () => {
    expect(transition('prescribed', 'abandon')).toEqual({ ok: true, value: 'abandoned' })
  })

  it('abandons from active — a workout somebody walked out of', () => {
    expect(transition('active', 'abandon')).toEqual({ ok: true, value: 'abandoned' })
  })

  it('treats abandoned as terminal, not as an absence', () => {
    // The criterion in one assertion: abandoning is a state. It is reachable,
    // it is final, and nothing leads out of it — which is exactly what a
    // delete would not have been, because a deleted row has no transitions
    // because it has no row.
    expect(isTerminal('abandoned')).toBe(true)
    expect(eventsFrom('abandoned')).toEqual([])

    for (const event of SESSION_EVENTS) {
      expect(canTransition('abandoned', event), event).toBe(false)
    }
  })

  it('rejects every invalid transition with a typed error', () => {
    const allowed: Record<SessionState, SessionEvent[]> = {
      prescribed: ['start', 'abandon'],
      active: ['complete', 'abandon'],
      completed: [],
      abandoned: [],
    }

    for (const state of SESSION_STATES) {
      for (const event of SESSION_EVENTS) {
        const result = transition(state, event)

        if (allowed[state].includes(event)) {
          expect(result.ok, `${state} + ${event}`).toBe(true)
          continue
        }

        expect(result.ok, `${state} + ${event}`).toBe(false)
        if (result.ok) continue

        expect(result.error.code).toBe(ErrorCode.SESSION_INVALID_TRANSITION)
        expect(result.error.details).toEqual({
          from: state,
          event,
          allowed: allowed[state],
        })
      }
    }
  })

  it('refuses a second completion rather than making it a no-op', () => {
    // A double tap on "finish" must not quietly rewrite completed_at.
    const result = transition('completed', 'complete')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.SESSION_INVALID_TRANSITION)
  })

  it('names what a state does admit, for a screen rendering its controls', () => {
    expect(eventsFrom('prescribed')).toEqual(['start', 'abandon'])
    expect(eventsFrom('active')).toEqual(['complete', 'abandon'])
    expect(eventsFrom('completed')).toEqual([])
  })
})

describe('state is derived from the row (SES-01a)', () => {
  it('reads each state back from the timestamps that make it', () => {
    for (const state of SESSION_STATES) {
      expect(sessionStateOf(timestamps(state)), state).toBe(state)
    }
  })

  it('reads a session abandoned before it was ever started as abandoned', () => {
    expect(
      sessionStateOf({ started_at: null, completed_at: null, abandoned_at: stamp }),
    ).toBe('abandoned')
  })

  it('never invents a state for a row with no timestamps', () => {
    expect(
      sessionStateOf({ started_at: null, completed_at: null, abandoned_at: null }),
    ).toBe(INITIAL_SESSION_STATE)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Resuming
// ─────────────────────────────────────────────────────────────────────────────

const exercise = (
  id: string,
  status: 'not_started' | 'completed' | 'skipped',
  order: number,
) => ({
  exercise: {
    id,
    block_id: 'b0000001-0000-4000-8000-000000000000',
    exercise_id: `catalog-${id}`,
    order_index: order,
    modality: 'reps' as const,
    sets: 3,
    target_kind: 'fixed' as const,
    target_value: 8,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: 60,
    tempo: null,
    load_type: 'rir' as const,
    load_value: 2,
    equipment_used: 'barbell',
    is_interval_exercise: false,
    slot_id: `l${id.slice(1)}`,
    replaces_id: null,
    origin: 'generated' as const,
    created_at: stamp,
    superseded_at: null,
    revision_status: 'active' as const,
    execution_status: status,
    exercise_notes: null,
  },
  set_logs: [] as SessionSnapshot['sections'][number]['blocks'][number]['exercises'][number]['set_logs'],
})

const snapshot = (
  sectionsSpec: { id: string; order: number; exercises: ReturnType<typeof exercise>[] }[],
): SessionSnapshot =>
  ({
    session: { ...timestamps('active') },
    state: 'active',
    sections: sectionsSpec.map((section) => ({
      section: {
        id: section.id,
        session_id: 's0000001-0000-4000-8000-000000000000',
        created_at: stamp,
        updated_at: stamp,
        section_type: 'primary_lift',
        order_index: section.order,
        section_title: 'Primary',
        section_notes: null,
      },
      blocks: [
        {
          block: {
            id: 'b0000001-0000-4000-8000-000000000000',
            section_id: section.id,
            created_at: stamp,
            order_index: 0,
            structure_type: 'standard',
            rounds: null,
            timer_type: 'none',
            timer_seconds: null,
            round_rest_seconds: null,
            rep_scheme: 'fixed',
            block_notes: null,
          },
          exercises: section.exercises,
        },
      ],
    })),
  }) as unknown as SessionSnapshot

describe('resuming (SES-01a)', () => {
  it('resumes at the first unfinished exercise, in the correct section', () => {
    const point = resumePoint(
      snapshot([
        { id: 'c0000001-0000-4000-8000-000000000000', order: 0, exercises: [exercise('e0000001-0000-4000-8000-000000000000', 'completed', 0)] },
        { id: 'c0000002-0000-4000-8000-000000000000', order: 1, exercises: [exercise('e0000002-0000-4000-8000-000000000000', 'not_started', 0)] },
      ]),
    )

    expect(point?.sectionId).toBe('c0000002-0000-4000-8000-000000000000')
    expect(point?.sectionOrder).toBe(1)
    expect(point?.workoutExerciseId).toBe('e0000002-0000-4000-8000-000000000000')
  })

  it('passes over a skipped exercise rather than re-offering it', () => {
    // Skipping is a decision the user already made (DATA_MODEL §8). Resuming
    // at it would be the app forgetting.
    const point = resumePoint(
      snapshot([
        {
          id: 'c0000001-0000-4000-8000-000000000000',
          order: 0,
          exercises: [
            exercise('e0000001-0000-4000-8000-000000000000', 'skipped', 0),
            exercise('e0000002-0000-4000-8000-000000000000', 'not_started', 1),
          ],
        },
      ]),
    )

    expect(point?.workoutExerciseId).toBe('e0000002-0000-4000-8000-000000000000')
  })

  it('counts the next set one past the highest logged, never the count', () => {
    const state = snapshot([
      {
        id: 'c0000001-0000-4000-8000-000000000000',
        order: 0,
        exercises: [exercise('e0000001-0000-4000-8000-000000000000', 'not_started', 0)],
      },
    ])
    // Two logs, numbered 1 and 3: EXE-07 flushes a queue, so a gap is
    // possible and counting rows would hand set 3 back out to be written twice.
    state.sections[0].blocks[0].exercises[0].set_logs = [
      { set_number: 1 },
      { set_number: 3 },
    ] as SessionSnapshot['sections'][number]['blocks'][number]['exercises'][number]['set_logs']

    const point = resumePoint(state)

    expect(point?.loggedSets).toBe(2)
    expect(point?.nextSetNumber).toBe(4)
  })

  it('answers null when every exercise is done — a session waiting to finish', () => {
    expect(
      resumePoint(
        snapshot([
          {
            id: 'c0000001-0000-4000-8000-000000000000',
            order: 0,
            exercises: [
              exercise('e0000001-0000-4000-8000-000000000000', 'completed', 0),
              exercise('e0000002-0000-4000-8000-000000000000', 'skipped', 1),
            ],
          },
        ]),
      ),
    ).toBeNull()
  })
})
