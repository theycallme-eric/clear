import { describe, expect, it } from 'vitest'

import { createError, err, ErrorCode, ok } from '../state/errors'
import type { ConditioningHistoryRow, GenerationRequest } from '../state/schemas'
import {
  performGeneration,
  type GenerationComposerFactory,
  type GenerationDatabase,
} from '../../supabase/functions/_shared/generate.ts'
import {
  buildUserMessage,
  SYSTEM_PROMPT,
  type PromptInput,
} from '../../supabase/functions/_shared/prompt.ts'
import {
  anchorNote,
  anchorTrend,
  buildTrainingHistory,
  sessionDirective,
  TRAINING_HISTORY_LIMIT,
  type AnchorHistory,
} from '../../supabase/functions/_shared/training-history.ts'
import { promptInput, sectionFixture, TODAY } from './generation-prompt-fixtures'

// OVR-02. The block is a decision about what the model is allowed to know, so
// the tests are mostly about what is *not* in it: no anchor value, no unit, no
// weight in any field — open question 6, decided as labels-only and asserted
// here rather than described in a comment somewhere.

const anchor = (
  overrides: Partial<AnchorHistory['anchor']> & { recentValues?: readonly number[] } = {},
): AnchorHistory => {
  const { recentValues, ...anchorOverrides } = overrides

  return {
    anchor: {
      exercise_id: 'back-squat',
      equipment_used: 'barbell',
      anchor_value: 285,
      unit: 'lb',
      confidence: 'high',
      session_count: 5,
      last_session_date: '2026-09-21',
      ...anchorOverrides,
    },
    recentValues,
  }
}

describe('the anchor labels', () => {
  it('reads an increase at the top of the series as progressing', () => {
    expect(anchorTrend([285, 280, 275])).toBe('progressing')
  })

  it('reads two sessions without an increase as stalled', () => {
    expect(anchorTrend([280, 280, 280])).toBe('stalled')
    expect(anchorTrend([275, 280, 285])).toBe('stalled')
  })

  it('does not call one flat session after a rise a stall', () => {
    // The newest session held, the one before it moved. That is a session, not a
    // plateau, and §5's rule counts consecutive sessions for exactly this reason.
    expect(anchorTrend([280, 280, 275])).toBeNull()
  })

  it('says nothing about one session, which has no direction', () => {
    expect(anchorTrend([285])).toBeNull()
    expect(anchorTrend(undefined)).toBeNull()
  })

  it('lets staleness outrank a trend measured before the gap', () => {
    expect(anchorNote('re_entry', 'progressing', 0)).toBe('re-entry — cap RPE 8')
    expect(anchorNote('recalibration', 'stalled', 3)).toBe(
      're-entry — confirm this number, cap RPE 7',
    )
    expect(anchorNote('fresh', 'stalled', 2)).toBe('stalled 2 sessions')
    expect(anchorNote('fresh', null, 0)).toBeNull()
  })
})

describe('the TRAINING HISTORY block', () => {
  it('carries labels and confidence, and never the anchor value', () => {
    const history = buildTrainingHistory({
      anchors: [anchor({ recentValues: [285, 280, 275] })],
      today: TODAY,
    })

    const [entry] = history.anchors
    expect(entry).toEqual({
      exerciseId: 'back-squat',
      equipment: 'barbell',
      confidence: 'high',
      sessionCount: 5,
      daysSinceLastSession: 4,
      staleness: 'fresh',
      trend: 'progressing',
      note: 'progressing',
    })
    expect(JSON.stringify(history)).not.toContain('285')
  })

  it('caps at the 40 most recently trained, most recent first', () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      anchor({
        exercise_id: `lift-${`${index}`.padStart(2, '0')}`,
        // One per day into the past, so recency order is unambiguous.
        last_session_date: new Date(Date.parse('2026-09-24') - index * 86_400_000)
          .toISOString()
          .slice(0, 10),
      }),
    )

    const history = buildTrainingHistory({ anchors: many, today: TODAY })

    expect(history.anchors).toHaveLength(TRAINING_HISTORY_LIMIT)
    expect(history.anchors[0].exerciseId).toBe('lift-00')
    expect(
      history.anchors.map((entry) => entry.daysSinceLastSession),
    ).toEqual([...history.anchors.map((entry) => entry.daysSinceLastSession)].sort((a, b) => a - b))
  })

  it('leaves a discarded anchor out entirely rather than showing it with a caveat', () => {
    const history = buildTrainingHistory({
      anchors: [anchor({ last_session_date: '2026-05-01' })],
      today: TODAY,
    })

    expect(history.anchors).toEqual([])
  })

  it('reads the directive from the deload, then from the freshest anchor', () => {
    expect(sessionDirective({ anchors: [anchor()], today: TODAY, deload: true })).toBe('deload')
    expect(sessionDirective({ anchors: [anchor()], today: TODAY })).toBe('normal')
    expect(
      sessionDirective({
        anchors: [anchor({ last_session_date: '2026-08-20' })],
        today: TODAY,
      }),
    ).toBe('re_entry')
    expect(sessionDirective({ anchors: [], today: TODAY })).toBe('normal')
  })

  it('carries no conditioning trend when OVR-03 has said nothing, rather than guessing hold', () => {
    expect(buildTrainingHistory({ anchors: [], today: TODAY }).conditioningTrend).toBeNull()
    expect(
      buildTrainingHistory({ anchors: [], today: TODAY, conditioningTrend: null })
        .conditioningTrend,
    ).toBeNull()
  })
})

// OVR-03. The density directive is read from `conditioning_history(...)` and
// decided by `conditioningDirective` before the model is called; these drive
// the mounted pipeline with fixture history and read the prompt it composed.
describe('the density directive on the generation request', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111'
  const REQUEST_ID = 'req_ovr03_density'

  const request: GenerationRequest = {
    request_id: REQUEST_ID,
    goal: 'conditioning',
    date: TODAY,
    focus: 'full_body',
    requested_intensity: 7,
    requested_duration_mins: 45,
    location_id: '22222222-2222-4222-8222-222222222222',
    notes: null,
    deload: false,
  }

  // One scored AMRAP block per row, newest first as the function answers.
  // `perceived_effort` is the section RPE EXE-04's effort capture writes.
  const section = (
    index: number,
    overrides: Partial<ConditioningHistoryRow> = {},
  ): ConditioningHistoryRow => ({
    session_id: `c000000${index}-0000-4000-8000-000000000000`,
    session_date: `2026-09-${`${20 - index}`.padStart(2, '0')}`,
    effective_intensity: 7,
    goal_preset: 'conditioning',
    section_id: `a000000${index}-0000-4000-8000-000000000000`,
    section_order: 3,
    block_id: `b000000${index}-0000-4000-8000-000000000000`,
    block_order: 0,
    structure_type: 'amrap',
    rep_scheme: 'fixed',
    timer_type: 'countdown',
    timer_seconds: 600,
    rounds: null,
    round_rest_seconds: null,
    elapsed_seconds: null,
    completed_under_cap: null,
    rounds_completed: 8,
    partial_round_reps: null,
    minutes_completed: null,
    highest_rung: null,
    perceived_effort: 6,
    scored_at: '2026-09-20T10:30:00.000Z',
    prescriptions: [
      {
        exercise_id: 'kettlebell-swing',
        order_index: 0,
        modality: 'reps',
        sets: null,
        target_kind: 'fixed',
        target_value: 10,
        target_min: null,
        target_max: null,
        target_sequence: null,
        per_side: false,
        distance_unit: null,
        load_type: 'absolute',
        load_value: 24,
        equipment_used: 'kettlebell',
      },
    ],
    ...overrides,
  })
  const easy = (index: number, overrides: Partial<ConditioningHistoryRow> = {}) =>
    section(index, { perceived_effort: 6, ...overrides })
  const hard = (index: number) => section(index, { perceived_effort: 9 })
  const capped = (index: number) =>
    section(index, {
      structure_type: 'for_time',
      rounds: 5,
      completed_under_cap: false,
      rounds_completed: 2,
      perceived_effort: 9,
    })

  /** Runs the pipeline and returns the user message the model would have been sent. */
  async function composedMessage(
    conditioning: GenerationDatabase['conditioning'],
  ): Promise<string> {
    let message: string | null = null

    const db: GenerationDatabase = {
      candidates: async () => ok([sectionFixture('conditioning', ['box-jumps'])]),
      constraints: async () => ok([]),
      recentHistory: async () => ok({ focuses: [], patterns: [], exerciseIds: [] }),
      anchors: async () => ok([]),
      conditioning,
    }
    const composer: GenerationComposerFactory = () => ({
      async compose(input) {
        message = buildUserMessage(input)
        return err(createError(ErrorCode.GENERATION_FAILED, { requestId: REQUEST_ID }))
      },
    })

    await performGeneration(
      request,
      { userId: USER_ID, requestId: REQUEST_ID },
      { db, catalog: async () => ok(new Map()), composer },
    )

    if (message === null) throw new Error('the pipeline never composed')
    return message
  }

  it('states ready when the last two of three qualifying sections landed easily', async () => {
    const message = await composedMessage(async () => ok([easy(1), easy(2), hard(3)]))
    expect(message).toContain('CONDITIONING TREND: ready')
  })

  it('states backing_off when the last two of three qualifying sections hit the cap', async () => {
    const message = await composedMessage(async () => ok([capped(1), capped(2), easy(3)]))
    expect(message).toContain('CONDITIONING TREND: backing_off')
  })

  it('states hold when three qualifying sections are mixed', async () => {
    const message = await composedMessage(async () => ok([easy(1), hard(2), easy(3)]))
    expect(message).toContain('CONDITIONING TREND: hold')
  })

  it('omits the directive with fewer than three qualifying sections', async () => {
    expect(await composedMessage(async () => ok([]))).not.toContain('CONDITIONING TREND')
    expect(await composedMessage(async () => ok([easy(1), easy(2)]))).not.toContain(
      'CONDITIONING TREND',
    )
  })

  it('does not count a section below intensity 5 toward the three', async () => {
    const light = easy(3, { effective_intensity: 4 })
    const atFloor = easy(3, { effective_intensity: 5 })

    expect(await composedMessage(async () => ok([easy(1), easy(2), light]))).not.toContain(
      'CONDITIONING TREND',
    )
    expect(await composedMessage(async () => ok([easy(1), easy(2), atFloor]))).toContain(
      'CONDITIONING TREND: ready',
    )
  })

  it('omits the directive rather than failing when the history cannot be read', async () => {
    const message = await composedMessage(async () =>
      err(createError(ErrorCode.PERSISTENCE_READ_FAILED)),
    )
    expect(message).not.toContain('CONDITIONING TREND')
  })

  it('never asks the model to work the trend out', async () => {
    const message = await composedMessage(async () => ok([easy(1), easy(2), hard(3)]))

    // The model receives one decided value, not the rows it was decided from.
    expect(message).not.toContain('perceived_effort')
    expect(message).not.toMatch(/CONDITIONING TREND: .*\|/)
    expect(SYSTEM_PROMPT).not.toMatch(/(?:decide|determine|infer|work out) the conditioning trend/i)
  })
})

describe('the block as the prompt carries it', () => {
  const message = buildUserMessage(promptInput())

  it('states the columns, the directive and the trend', () => {
    expect(message).toContain('exercise_id | equipment | confidence | sessions | last trained | note')
    expect(message).toContain('back-squat | barbell | high | 5 | 4d ago | progressing')
    expect(message).toContain('SESSION DIRECTIVE: normal')
    expect(message).toContain('CONDITIONING TREND: hold')
  })

  it('omits directive rules when there is no directive to obey', () => {
    expect(message).not.toContain('DIRECTIVE RULES')
  })

  it('states a deload’s arithmetic as arithmetic, because the model does none', () => {
    const deload = buildUserMessage(
      promptInput({
        training: buildTrainingHistory({
          anchors: [anchor({ recentValues: [280, 280, 280] })],
          today: TODAY,
          deload: true,
          conditioningTrend: 'backing_off',
        }),
      }),
    )

    expect(deload).toContain('SESSION DIRECTIVE: deload')
    expect(deload).toContain('working sets × 0.6 rounded down, never below 2')
    expect(deload).toContain('rep targets unchanged')
    expect(deload).toContain('conditioning at intensity 6 or lower')
    expect(deload).toContain('state the RPE 7 ceiling in section_notes')
    expect(deload).toContain('CONDITIONING TREND: backing_off')
  })

  it('asks a re-entry for one fewer set and for the ceiling in the cues', () => {
    const reEntry = buildUserMessage(
      promptInput({
        training: buildTrainingHistory({
          anchors: [anchor({ last_session_date: '2026-08-20' })],
          today: TODAY,
        }),
      }),
    )

    expect(reEntry).toContain('SESSION DIRECTIVE: re_entry')
    expect(reEntry).toContain('one fewer working set on every exercise noted re-entry')
    expect(reEntry).toContain('re-entry — cap RPE 8')
  })

  it('says none rather than printing an empty table, and still states the directive', () => {
    const empty = buildUserMessage(
      promptInput({ training: buildTrainingHistory({ anchors: [], today: TODAY }) }),
    )

    expect(empty).toContain(
      'TRAINING HISTORY (labels and confidence only — the app fills every load after generation)\nnone',
    )
    expect(empty).toContain('SESSION DIRECTIVE: normal')
  })

  it('carries no weight, in any unit, anywhere in the message', () => {
    expect(message).not.toMatch(/\d+(?:\.\d+)?\s*(?:#|lbs?|kgs?|pounds?|kilograms?)\b/i)
  })
})

describe('what the system prompt says about loads', () => {
  it('forbids computing, stating or narrating one', () => {
    expect(SYSTEM_PROMPT).toContain('Never compute, state or narrate a weight')
    expect(SYSTEM_PROMPT).toContain('section_notes, block_notes, tempo and\nthe overview')
  })

  it('explains the directive it will be handed, and the trend', () => {
    expect(SYSTEM_PROMPT).toContain('TRAINING HISTORY AND DIRECTIVES')
    expect(SYSTEM_PROMPT).toContain('SESSION DIRECTIVE deload')
    expect(SYSTEM_PROMPT).toContain('SESSION DIRECTIVE re_entry')
    expect(SYSTEM_PROMPT).toContain('CONDITIONING TREND ready')
  })

  it('offers the swap for a stall and the rep band for a progression', () => {
    expect(SYSTEM_PROMPT).toContain('noted stalled may be swapped for a close variation')
    expect(SYSTEM_PROMPT).toContain('kept in the same rep band')
  })

  it('never tells the model what an anchor is worth', () => {
    const input: PromptInput = promptInput()
    expect(SYSTEM_PROMPT).toContain('It carries labels and never\nloads')
    expect(input.training.anchors.every((entry) => !('value' in entry))).toBe(true)
  })
})
