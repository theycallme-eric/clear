/**
 * FAV-02's derivation, as rules rather than as a screen.
 *
 * Every fixture is a `session_as_performed` payload built by
 * `reconstructionFixture`, so what these tests read is the shape the database
 * answers with (SES-01b) — never a hand-rolled fourth reconstruction.
 *
 * The acceptance criteria checked here: a best is only beaten strictly; the
 * repeat surface states the last comparable performance and the run it came
 * from; the delta between two runs is stated in words; and a deload keeps the
 * history while dropping the competitive verdict.
 */
import { describe, expect, it } from 'vitest'

import { reconstructionFixture, type SectionFixture } from '../test/workout-double'
import {
  BESTS_LABEL_COMPETITIVE,
  BESTS_LABEL_DELOAD,
  COMPARISON_LABEL_COMPETITIVE,
  COMPARISON_LABEL_DELOAD,
  COMPLETED_HEADLINE,
  compareRuns,
  completionHistory,
  DELOAD_NOTE,
  deloadInEffect,
  favoriteProgression,
  FIRST_ATTEMPT_NOTE,
  lastWeights,
  NO_RUNS_NOTE,
  personalBests,
  runMeasures,
  type FavoriteRun,
} from './favorite-progression'
import type { WorkoutSessionRow } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** A completed run of a favorite, on a day, with the sections it performed. */
function run(
  day: string,
  sections: SectionFixture[],
  session: Partial<WorkoutSessionRow> = {},
): FavoriteRun {
  return {
    sessionId: `session-${day}`,
    completedAt: `${day}T19:00:00+00:00`,
    performed: reconstructionFixture({
      session: { date: day, completed_at: `${day}T19:00:00+00:00`, ...session },
      sections,
    }),
  }
}

/** One For Time block that finished inside the cap, in `elapsed` seconds. */
function forTime(elapsed: number, underCap = true): SectionFixture {
  return {
    title: 'Conditioning',
    sectionType: 'conditioning',
    blocks: [
      {
        structureType: 'for_time',
        timerSeconds: 900,
        timerType: 'cap',
        result: { elapsed_seconds: elapsed, completed_under_cap: underCap },
      },
    ],
  }
}

/** One AMRAP block scored at `rounds` complete rounds plus `partial` reps. */
function amrap(rounds: number, partial: number | null = null): SectionFixture {
  return {
    title: 'Finisher',
    sectionType: 'conditioning',
    blocks: [
      {
        structureType: 'amrap',
        timerSeconds: 600,
        timerType: 'window',
        result: { rounds_completed: rounds, partial_round_reps: partial },
      },
    ],
  }
}

/** A primary lift with `weight` on its working sets, plus a lighter warmup. */
function lift(weight: number, exerciseId = 'back-squat'): SectionFixture {
  return {
    title: 'Primary lift',
    sectionType: 'primary_lift',
    blocks: [
      {
        structureType: 'standard',
        exercises: [
          {
            status: 'completed',
            prescription: { exercise_id: exerciseId, equipment_used: 'barbell' },
            setLogs: [
              { set_number: 1, weight: 40, weight_unit: 'kg', is_warmup_set: true },
              { set_number: 2, weight: weight - 5, weight_unit: 'kg', actual_reps: 8 },
              { set_number: 3, weight, weight_unit: 'kg', actual_reps: 8 },
            ],
          },
        ],
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Readings off one run
// ─────────────────────────────────────────────────────────────────────────────

describe('the comparable readings of one run', () => {
  it('reads a For Time block as its completion time', () => {
    const measures = runMeasures(run('2026-09-01', [forTime(383)]).performed)

    expect(measures).toEqual([
      {
        key: 'time:0.0',
        kind: 'time',
        label: 'Conditioning · FOR TIME',
        value: 383,
        unit: null,
        display: '06:23',
      },
    ])
  })

  it('refuses a For Time that stopped at the cap — the clock is the cap, not a time', () => {
    expect(runMeasures(run('2026-09-01', [forTime(900, false)]).performed)).toEqual([])
  })

  it('reads an AMRAP as its rounds, with the partial round shown but not scored', () => {
    const [measure] = runMeasures(run('2026-09-01', [amrap(8, 4)]).performed)

    expect(measure.value).toBe(8)
    expect(measure.display).toBe('8 rounds + 4 reps')
  })

  it('states one round in the singular, and a zero partial round as nothing', () => {
    expect(runMeasures(run('2026-09-01', [amrap(1, 0)]).performed)[0].display).toBe('1 round')
  })

  it('keeps a scored zero: an AMRAP that managed no rounds is a result', () => {
    const [measure] = runMeasures(run('2026-09-01', [amrap(0)]).performed)

    expect(measure.value).toBe(0)
    expect(measure.display).toBe('0 rounds')
  })

  it('reads the heaviest working set per movement, and never a warmup', () => {
    const measures = runMeasures(run('2026-09-01', [lift(100)]).performed).filter(
      (measure) => measure.kind === 'weight',
    )

    expect(measures).toHaveLength(1)
    expect(measures[0].key).toBe('weight:back-squat:barbell')
    expect(measures[0].label).toBe('back squat')
    expect(measures[0].display).toBe('100 kg')
  })

  it('records no weight for a movement that logged none, rather than zero', () => {
    const bodyweight: SectionFixture = {
      title: 'Core',
      sectionType: 'core',
      blocks: [
        {
          exercises: [{ status: 'completed', setLogs: [{ set_number: 1, actual_reps: 20 }] }],
        },
      ],
    }

    expect(
      runMeasures(run('2026-09-01', [bodyweight]).performed).filter(
        (measure) => measure.kind === 'weight',
      ),
    ).toEqual([])
  })

  it('reads an unscored timed block as unscored — a block with no result row says nothing', () => {
    const unscored: SectionFixture = {
      title: 'Conditioning',
      sectionType: 'conditioning',
      blocks: [{ structureType: 'for_time', timerSeconds: 900, timerType: 'cap' }],
    }

    expect(runMeasures(run('2026-09-01', [unscored]).performed)).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Personal bests
// ─────────────────────────────────────────────────────────────────────────────

describe('personal bests across runs (favorites-v2 §Progression Tracking)', () => {
  it('takes the fastest For Time, and names the run that set it', () => {
    const bests = personalBests([
      run('2026-09-01', [forTime(400)]),
      run('2026-09-08', [forTime(383)]),
      run('2026-09-15', [forTime(395)]),
    ])

    expect(bests).toHaveLength(1)
    expect(bests[0].display).toBe('06:23')
    expect(bests[0].setOn).toBe('Tue 8 Sep 2026')
    expect(bests[0].runCount).toBe(3)
    expect(bests[0].fromLastRun).toBe(false)
  })

  it('takes the most AMRAP rounds', () => {
    const bests = personalBests([
      run('2026-09-01', [amrap(6, 2)]),
      run('2026-09-08', [amrap(9)]),
    ])

    expect(bests[0].value).toBe(9)
    expect(bests[0].fromLastRun).toBe(true)
  })

  it('updates only on a strict improvement — equalling a best leaves it where it was set', () => {
    const bests = personalBests([
      run('2026-09-01', [forTime(383)]),
      run('2026-09-08', [forTime(383)]),
    ])

    expect(bests[0].setOn).toBe('Tue 1 Sep 2026')
    expect(bests[0].fromLastRun).toBe(false)
  })

  it('tracks each timed block independently (favorites-v2 §Multiple Timed Sections)', () => {
    const bests = personalBests([
      run('2026-09-01', [forTime(400), amrap(6)]),
      run('2026-09-08', [forTime(420), amrap(8)]),
    ])

    expect(bests.map((best) => best.key)).toEqual(['time:0.0', 'rounds:1.0'])
    expect(bests[0].value).toBe(400)
    expect(bests[1].value).toBe(8)
  })

  it('has no best for a favorite with no completions', () => {
    expect(personalBests([])).toEqual([])
  })

  it('draws no best off a weight — a top set is progression, not a record', () => {
    expect(personalBests([run('2026-09-01', [lift(100)])])).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Last time
// ─────────────────────────────────────────────────────────────────────────────

describe('“last time” weights (favorites-v2 §"Last Time" Weight Display)', () => {
  it('reads the most recent completion only, with the day it came from', () => {
    const weights = lastWeights([
      run('2026-09-01', [lift(90)]),
      run('2026-09-08', [lift(100)]),
    ])

    expect(weights).toEqual([
      {
        key: 'weight:back-squat:barbell',
        label: 'back squat',
        display: '100 kg',
        setOn: 'Tue 8 Sep 2026',
      },
    ])
  })

  it('is empty for a favorite that has never been completed', () => {
    expect(lastWeights([])).toEqual([])
  })

  it('does not reach further back for a movement the last run did not log', () => {
    const weights = lastWeights([
      run('2026-09-01', [lift(90, 'front-squat')]),
      run('2026-09-08', [lift(100, 'back-squat')]),
    ])

    expect(weights.map((weight) => weight.label)).toEqual(['back squat'])
  })

  it('reads the input in completion order rather than trusting the order given', () => {
    const weights = lastWeights([
      run('2026-09-08', [lift(100)]),
      run('2026-09-01', [lift(90)]),
    ])

    expect(weights[0].display).toBe('100 kg')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Completion history
// ─────────────────────────────────────────────────────────────────────────────

describe('completion history', () => {
  it('lists date and headline result per run, newest first', () => {
    const history = completionHistory([
      run('2026-09-01', [forTime(400)]),
      run('2026-09-08', [forTime(383), amrap(8, 4)]),
    ])

    expect(history).toEqual([
      {
        key: 'session-2026-09-08',
        on: 'Tue 8 Sep 2026',
        headline: 'For time 06:23 · AMRAP 8 rounds + 4 reps',
      },
      { key: 'session-2026-09-01', on: 'Tue 1 Sep 2026', headline: 'For time 06:40' },
    ])
  })

  it('says a run with no scored format was completed, with its measured duration', () => {
    const [entry] = completionHistory([
      run('2026-09-01', [lift(100)], { actual_duration_mins: 47 }),
    ])

    expect(entry.headline).toBe(`${COMPLETED_HEADLINE} · 47 min`)
  })

  it('says only that it was completed when nothing timed it', () => {
    expect(completionHistory([run('2026-09-01', [lift(100)])])[0].headline).toBe(
      COMPLETED_HEADLINE,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The comparison
// ─────────────────────────────────────────────────────────────────────────────

describe('one run against another', () => {
  it('states a faster time as faster, against the day it beat', () => {
    const [delta] = compareRuns(
      run('2026-09-08', [forTime(383)]),
      run('2026-09-01', [forTime(395)]),
    )

    expect(delta.kind).toBe('time')
    expect(delta.current).toBe('06:23')
    expect(delta.previous).toBe('06:35')
    expect(delta.change).toBe('12s faster')
    expect(delta.direction).toBe('better')
    expect(delta.against).toBe('vs Tue 1 Sep 2026')
  })

  it('states a slower time as slower, and a gap over a minute in minutes', () => {
    const [delta] = compareRuns(
      run('2026-09-08', [forTime(480)]),
      run('2026-09-01', [forTime(383)]),
    )

    expect(delta.change).toBe('1m 37s slower')
    expect(delta.direction).toBe('worse')
  })

  it('states the same time as the same time rather than as an improvement', () => {
    const [delta] = compareRuns(
      run('2026-09-08', [forTime(383)]),
      run('2026-09-01', [forTime(383)]),
    )

    expect(delta.change).toBe('Same time')
    expect(delta.direction).toBe('level')
  })

  it('states rounds up and rounds down', () => {
    const up = compareRuns(run('2026-09-08', [amrap(9)]), run('2026-09-01', [amrap(8)]))
    const down = compareRuns(run('2026-09-08', [amrap(6)]), run('2026-09-01', [amrap(8)]))

    expect(up[0].change).toBe('1 round more')
    expect(up[0].direction).toBe('better')
    expect(down[0].change).toBe('2 rounds fewer')
    expect(down[0].direction).toBe('worse')
  })

  it('states weight moved, per movement', () => {
    const [delta] = compareRuns(
      run('2026-09-08', [lift(102.5)]),
      run('2026-09-01', [lift(100)]),
    )

    expect(delta.kind).toBe('weight')
    expect(delta.label).toBe('back squat')
    expect(delta.change).toBe('2.5 kg heavier')
    expect(delta.direction).toBe('better')
  })

  it('compares weight across units rather than comparing the numbers', () => {
    const current = run('2026-09-08', [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [
          {
            exercises: [
              {
                status: 'completed',
                setLogs: [{ set_number: 1, weight: 225, weight_unit: 'lb' }],
              },
            ],
          },
        ],
      },
    ])
    const previous = run('2026-09-01', [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [
          {
            exercises: [
              {
                status: 'completed',
                setLogs: [{ set_number: 1, weight: 100, weight_unit: 'kg' }],
              },
            ],
          },
        ],
      },
    ])

    const [delta] = compareRuns(current, previous)

    // 100 kg is 220.5 lb, so 225 lb is the heavier session — which comparing
    // 225 against 100 would also have said, for entirely the wrong reason.
    expect(delta.current).toBe('225 lb')
    expect(delta.previous).toBe('100 kg')
    expect(delta.change).toBe('4.5 lb heavier')
    expect(delta.direction).toBe('better')
  })

  it('draws nothing for a reading only one of the two runs holds', () => {
    expect(
      compareRuns(run('2026-09-08', [forTime(383)]), run('2026-09-01', [amrap(8)])),
    ).toEqual([])
  })

  it('matches blocks by position, so two restores of one snapshot compare', () => {
    // The fixture gives each run its own block ids, exactly as a restore does.
    const current = run('2026-09-08', [forTime(383)])
    const previous = run('2026-09-01', [forTime(395)])

    expect(current.performed.sections[0].blocks[0].block.id).toBe(
      previous.performed.sections[0].blocks[0].block.id,
    )
    expect(compareRuns(current, previous)[0].key).toBe('time:0.0')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The surface
// ─────────────────────────────────────────────────────────────────────────────

describe('the repeat surface', () => {
  const runs = [
    run('2026-09-01', [forTime(400), lift(95)]),
    run('2026-09-08', [forTime(395), lift(100)]),
    run('2026-09-15', [forTime(383), lift(102.5)]),
  ]

  it('states the last comparable performance and the run it was measured on', () => {
    const view = favoriteProgression(runs)

    expect(view.runCount).toBe(3)
    expect(view.lastRunOn).toBe('Tue 15 Sep 2026')
    expect(view.lastRunHeadline).toBe('For time 06:23')
    expect(view.lastWeights[0].display).toBe('102.5 kg')
    expect(view.lastWeights[0].setOn).toBe('Tue 15 Sep 2026')
  })

  it('sources every best and every delta to a day', () => {
    const view = favoriteProgression(runs)

    expect(view.bests[0].display).toBe('06:23')
    expect(view.bests[0].setOn).toBe('Tue 15 Sep 2026')
    expect(view.bests[0].fromLastRun).toBe(true)
    expect(view.deltas.map((delta) => delta.change)).toEqual([
      '12s faster',
      '2.5 kg heavier',
    ])
    expect(new Set(view.deltas.map((delta) => delta.against))).toEqual(
      new Set(['vs Tue 8 Sep 2026']),
    )
  })

  it('compares the last two runs, not the last against the first', () => {
    const view = favoriteProgression(runs)

    // 06:23 against 06:35, the run before it — not against 06:40.
    expect(view.deltas[0].previous).toBe('06:35')
  })

  it('lists every completion, newest first', () => {
    expect(favoriteProgression(runs).history.map((entry) => entry.on)).toEqual([
      'Tue 15 Sep 2026',
      'Tue 8 Sep 2026',
      'Tue 1 Sep 2026',
    ])
  })

  it('frames it competitively by default', () => {
    const view = favoriteProgression(runs)

    expect(view.framing).toBe('competitive')
    expect(view.bestsLabel).toBe(BESTS_LABEL_COMPETITIVE)
    expect(view.comparisonLabel).toBe(COMPARISON_LABEL_COMPETITIVE)
    expect(view.note).toBeNull()
  })

  it('says so, and compares nothing, when this would be the first repeat', () => {
    const view = favoriteProgression([runs[0]])

    expect(view.runCount).toBe(1)
    expect(view.deltas).toEqual([])
    expect(view.comparisonLabel).toBeNull()
    expect(view.note).toBe(FIRST_ATTEMPT_NOTE)
    // The one run it does have is still a performance, and still sourced.
    expect(view.bests[0].setOn).toBe('Tue 1 Sep 2026')
  })

  it('says a favorite has never been completed rather than showing an empty best', () => {
    const view = favoriteProgression([])

    expect(view.runCount).toBe(0)
    expect(view.lastRunOn).toBeNull()
    expect(view.bests).toEqual([])
    expect(view.history).toEqual([])
    expect(view.note).toBe(NO_RUNS_NOTE)
  })
})

describe('a deload keeps the history and drops the competition (REQ-059, per OVR-04)', () => {
  const runs = [run('2026-09-01', [forTime(400)]), run('2026-09-08', [forTime(383)])]

  it('still shows the bests, the history and the numbers', () => {
    const view = favoriteProgression(runs, { deload: true })

    expect(view.bests[0].display).toBe('06:23')
    expect(view.history).toHaveLength(2)
    expect(view.deltas[0].current).toBe('06:23')
    expect(view.deltas[0].previous).toBe('06:40')
    expect(view.deltas[0].change).toBe('17s faster')
  })

  it('withholds the verdict and the “beat your best” framing', () => {
    const view = favoriteProgression(runs, { deload: true })

    expect(view.framing).toBe('deload')
    expect(view.deltas[0].direction).toBe('unjudged')
    expect(view.bestsLabel).toBe(BESTS_LABEL_DELOAD)
    expect(view.comparisonLabel).toBe(COMPARISON_LABEL_DELOAD)
    expect(view.note).toBe(DELOAD_NOTE)
  })

  it('reads the deload off the workout the user is about to perform', () => {
    expect(
      deloadInEffect({ goal_preset: 'active_recovery', adjustment_reason: null }),
    ).toBe(true)
    expect(
      deloadInEffect({
        goal_preset: 'strength',
        adjustment_reason: 'Deload week — intensity held at 5.',
      }),
    ).toBe(true)
    expect(deloadInEffect({ goal_preset: 'strength', adjustment_reason: null })).toBe(false)
    expect(
      deloadInEffect({ goal_preset: 'hypertrophy', adjustment_reason: 'Intensity clamped to 6.' }),
    ).toBe(false)
  })
})
