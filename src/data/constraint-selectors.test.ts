import { describe, expect, it } from 'vitest'

import {
  deprioritized,
  exclusions,
  hasNote,
  usableEquipment,
} from './constraint-selectors'
import type {
  ConstraintAction,
  ConstraintTarget,
  UserConstraint,
} from './constraints'

// DATA-05. These are read-side selectors over a constraint set the server
// already returned. The authoritative filter is SQL — `constraints_in_force`
// and `usable_equipment` in the migration — and these mirror it so a candidate
// rendered in the app reads the same way as the candidate handed to Claude.

let sequence = 0

const constraint = (
  action: ConstraintAction,
  target: ConstraintTarget,
  note: string | null = null,
): UserConstraint => ({
  id: `constraint-${++sequence}`,
  userId: 'user-1',
  action,
  target,
  appliesTo: { persistence: 'persistent' },
  note,
  createdAt: '2026-09-21T00:00:00Z',
})

const equipment = (equipmentId: string): ConstraintTarget => ({
  scope: 'equipment',
  equipmentId,
})

describe('constraint selectors — the hard set (DATA-05)', () => {
  it('collects exclusions by scope and nothing else', () => {
    const set = [
      constraint('exclude', { scope: 'exercise', exerciseId: 'back-squat' }),
      constraint('exclude', { scope: 'movement_pattern', pattern: 'hinge' }),
      constraint('exclude', equipment('barbell')),
      constraint('avoid', equipment('kettlebell')),
      constraint('prefer_not', { scope: 'movement_pattern', pattern: 'pull' }),
    ]

    expect(exclusions(set)).toEqual({
      exerciseIds: ['back-squat'],
      patterns: ['hinge'],
      equipment: ['barbell'],
    })
  })

  it('is deterministic regardless of the order rows arrive in', () => {
    const targets = ['rings', 'barbell', 'dumbbell']
    const forwards = targets.map((id) => constraint('exclude', equipment(id)))
    const backwards = [...targets].reverse().map((id) =>
      constraint('exclude', equipment(id)),
    )

    expect(exclusions(forwards).equipment).toEqual([
      'barbell',
      'dumbbell',
      'rings',
    ])
    expect(exclusions(backwards).equipment).toEqual(
      exclusions(forwards).equipment,
    )
  })

  it('carries the soft actions as context instead of as a filter', () => {
    const set = [
      constraint('avoid', equipment('kettlebell')),
      constraint('exclude', equipment('barbell')),
      constraint('prefer_not', { scope: 'movement_pattern', pattern: 'pull' }),
    ]

    expect(deprioritized(set).map((c) => c.action)).toEqual([
      'avoid',
      'prefer_not',
    ])
    expect(exclusions(set)).toMatchObject({ equipment: ['barbell'] })
  })
})

describe('constraint selectors — equipment narrows, it does not reject (DATA-05)', () => {
  const available = ['barbell', 'dumbbell', 'kettlebell']

  it('leaves an exercise usable with dumbbells offering dumbbells only', () => {
    const set = [constraint('exclude', equipment('barbell'))]

    // The acceptance case: a press usable with either bar survives the barbell
    // exclusion, and the candidate that reaches Claude offers one option.
    expect(usableEquipment(['barbell', 'dumbbell'], available, set)).toEqual([
      'dumbbell',
    ])
  })

  it('leaves nothing usable when every option is excluded', () => {
    const set = [constraint('exclude', equipment('barbell'))]

    // Empty is the signal the eligibility query reads as "not eligible" — the
    // exercise is removed by having no way to do it, not by name.
    expect(usableEquipment(['barbell'], available, set)).toEqual([])
  })

  it('removes what the user does not own as well as what they excluded', () => {
    const set = [constraint('exclude', equipment('barbell'))]

    expect(usableEquipment(['barbell', 'sled'], available, set)).toEqual([])
    expect(usableEquipment(['sled', 'dumbbell'], available, set)).toEqual([
      'dumbbell',
    ])
  })

  it('does not let a soft constraint remove an option', () => {
    const set = [
      constraint('avoid', equipment('barbell')),
      constraint('prefer_not', equipment('dumbbell')),
    ]

    expect(usableEquipment(['barbell', 'dumbbell'], available, set)).toEqual([
      'barbell',
      'dumbbell',
    ])
  })

  it('returns the options sorted, so two runs hand Claude the same candidate', () => {
    expect(usableEquipment(['kettlebell', 'barbell'], available, [])).toEqual([
      'barbell',
      'kettlebell',
    ])
  })
})

describe('constraint selectors — a note is not an input (DATA-05)', () => {
  it('excludes nothing on the strength of what a note says', () => {
    const set = [
      constraint(
        'avoid',
        { scope: 'movement_pattern', pattern: 'squat' },
        'no barbell squats, and no deadlifts either',
      ),
    ]

    // Every word in that note names something excludable. None of it is
    // excluded, because a deterministic exclusion is always an explicit row.
    expect(exclusions(set)).toEqual({
      exerciseIds: [],
      patterns: [],
      equipment: [],
    })
    expect(usableEquipment(['barbell'], ['barbell'], set)).toEqual(['barbell'])
  })

  it('answers only whether a note exists', () => {
    expect(hasNote(constraint('exclude', equipment('barbell'), 'hurts'))).toBe(
      true,
    )
    expect(hasNote(constraint('exclude', equipment('rings'), '  '))).toBe(false)
    expect(hasNote(constraint('exclude', equipment('sled'), null))).toBe(false)
  })
})
