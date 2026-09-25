import { describe, expect, it } from 'vitest'

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
import { promptInput, TODAY } from './generation-prompt-fixtures'

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

  it('holds conditioning when OVR-03 has said nothing', () => {
    expect(buildTrainingHistory({ anchors: [], today: TODAY }).conditioningTrend).toBe('hold')
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
