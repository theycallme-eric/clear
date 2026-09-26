/**
 * HOME-03's acceptance, as arithmetic over fixture history.
 *
 * Four criteria live here: the focus matches least-recent-focus logic against
 * fixture rows, pattern-level staleness is available and is a pattern rather
 * than a region, the suggestion carries the prefilled destination, and thin
 * history produces nothing at all. The screen half — tapping and dismissing —
 * is `src/app/Home.test.tsx`.
 */
import { describe, expect, it } from 'vitest'

import { makeSessionRow } from '../test/factories'
import { focusPatternMap } from '../test/seed-catalog'
import { generatePath } from './generation-form'
import {
  FOCUS_PATTERNS,
  focusStaleness,
  hasEnoughHistory,
  MIN_SUGGESTION_SESSIONS,
  NEVER_TRAINED_STALENESS_DAYS,
  patternStaleness,
  readSuggestionDismissal,
  SESSION_FOCUSES,
  SUGGESTIBLE_PATTERNS,
  suggestedIntensity,
  suggestionDismissed,
  suggestSession,
  suggestSessionFocus,
  writeSuggestionDismissal,
  type SuggestionStorage,
} from './session-suggestion'
import type { WorkoutSessionRow } from './schemas'

const NOW = new Date('2026-09-25T12:00:00.000Z')
const OPTIONS = { now: NOW, timeZone: 'UTC' }

let nextId = 0

function session(
  day: string,
  overrides: Partial<WorkoutSessionRow> = {},
): WorkoutSessionRow {
  nextId += 1

  return makeSessionRow({
    id: `b${String(nextId).padStart(7, '0')}-0000-4000-8000-000000000000`,
    date: day,
    created_at: `${day}T08:00:00.000Z`,
    started_at: `${day}T09:00:00.000Z`,
    completed_at: `${day}T10:00:00.000Z`,
    ...overrides,
  })
}

/** Three completed sessions, all upper body: enough history, one stale half. */
function upperBodyOnly(): WorkoutSessionRow[] {
  return [
    session('2026-09-14', { session_focus: 'upper_body', effective_intensity: 6 }),
    session('2026-09-18', { session_focus: 'upper_body', effective_intensity: 7 }),
    session('2026-09-22', { session_focus: 'upper_body', effective_intensity: 8 }),
  ]
}

describe('the taxonomy it reads', () => {
  it('mirrors focus_pattern_map exactly as the catalog migration seeds it', () => {
    const seeded = focusPatternMap()

    expect([...seeded.keys()].sort()).toEqual([...SESSION_FOCUSES].sort())
    for (const focus of SESSION_FOCUSES) {
      expect([...FOCUS_PATTERNS[focus]].sort()).toEqual([...(seeded.get(focus) ?? [])].sort())
    }
  })

  it('leaves conditioning out — it derives from no session focus', () => {
    expect(SUGGESTIBLE_PATTERNS).not.toContain('conditioning')
    expect(SUGGESTIBLE_PATTERNS).toEqual(
      expect.arrayContaining(['squat', 'hinge', 'press', 'pull', 'unilateral', 'power']),
    )
  })
})

describe('focusStaleness', () => {
  it('ranks the focus trained longest ago first and dates each one', () => {
    const stale = focusStaleness(
      [
        session('2026-09-24', { session_focus: 'full_body' }),
        session('2026-09-20', { session_focus: 'upper_body' }),
        session('2026-09-10', { session_focus: 'lower_body' }),
      ],
      OPTIONS,
    )

    expect(stale.map((entry) => [entry.value, entry.daysSince])).toEqual([
      ['lower_body', 15],
      ['power', null],
      ['upper_body', 5],
      ['full_body', 1],
    ])
  })

  it('ranks a never-trained focus at the ceiling, not at infinity', () => {
    const stale = focusStaleness(
      [session('2026-09-04', { session_focus: 'lower_body' })],
      OPTIONS,
    )

    const power = stale.find((entry) => entry.value === 'power')
    expect(power).toEqual({ value: 'power', daysSince: null, rank: NEVER_TRAINED_STALENESS_DAYS })
    // Lower body is three weeks cold, so a dated gap outranks an absent one.
    expect(stale[0].value).toBe('lower_body')
  })

  it('reads an unstarted session as no training and a partial one as training', () => {
    const rows = [
      session('2026-09-24', {
        session_focus: 'power',
        started_at: null,
        completed_at: null,
        abandoned_at: '2026-09-24T09:00:00.000Z',
      }),
      session('2026-09-23', {
        session_focus: 'full_body',
        completed_at: null,
        abandoned_at: '2026-09-23T09:40:00.000Z',
      }),
    ]

    const byFocus = new Map(
      focusStaleness(rows, OPTIONS).map((entry) => [entry.value, entry.daysSince]),
    )
    expect(byFocus.get('power')).toBeNull()
    expect(byFocus.get('full_body')).toBe(2)
  })
})

describe('patternStaleness', () => {
  it('answers per pattern, not per region', () => {
    const stale = patternStaleness(
      [
        session('2026-09-24', { session_focus: 'upper_body' }),
        session('2026-09-14', { session_focus: 'lower_body' }),
      ],
      OPTIONS,
    )

    const byPattern = new Map(stale.map((entry) => [entry.value, entry.daysSince]))
    // Press and pull are yesterday's; the lower-body patterns are eleven days
    // cold, and power has never been trained at all.
    expect(byPattern.get('press')).toBe(1)
    expect(byPattern.get('pull')).toBe(1)
    expect(byPattern.get('hinge')).toBe(11)
    expect(byPattern.get('squat')).toBe(11)
    expect(byPattern.get('power')).toBeNull()
    expect(stale[0].value).toBe('power')
  })

  it('credits every pattern a full-body session admits', () => {
    const byPattern = new Map(
      patternStaleness([session('2026-09-24', { session_focus: 'full_body' })], OPTIONS).map(
        (entry) => [entry.value, entry.daysSince],
      ),
    )

    for (const pattern of FOCUS_PATTERNS.full_body) expect(byPattern.get(pattern)).toBe(1)
    expect(byPattern.get('power')).toBeNull()
  })
})

describe('suggestedIntensity', () => {
  it('averages the last three completed sessions and rounds', () => {
    // 8, 7, 6 → 7. The fourth session is deliberately outside the window.
    expect(suggestedIntensity([...upperBodyOnly(), session('2026-09-02', { effective_intensity: 1 })], OPTIONS)).toBe(7)
  })

  it('ignores a session that was never completed', () => {
    const rows = [
      ...upperBodyOnly(),
      session('2026-09-24', {
        effective_intensity: 2,
        completed_at: null,
        abandoned_at: '2026-09-24T09:30:00.000Z',
      }),
    ]

    expect(suggestedIntensity(rows, OPTIONS)).toBe(7)
  })

  it('has nothing to average with no completed session', () => {
    expect(suggestedIntensity([], OPTIONS)).toBeNull()
  })
})

describe('insufficient history', () => {
  it('suggests nothing below the minimum number of completed sessions', () => {
    const rows = upperBodyOnly().slice(0, MIN_SUGGESTION_SESSIONS - 1)

    expect(hasEnoughHistory(rows, OPTIONS)).toBe(false)
    expect(suggestSessionFocus(rows, OPTIONS)).toBeNull()
    expect(suggestSession(rows, OPTIONS)).toBeNull()
  })

  it('suggests nothing when the history is long but cold', () => {
    const rows = [
      session('2026-06-01', { session_focus: 'upper_body' }),
      session('2026-06-03', { session_focus: 'lower_body' }),
      session('2026-06-05', { session_focus: 'full_body' }),
    ]

    expect(hasEnoughHistory(rows, OPTIONS)).toBe(false)
    expect(suggestSession(rows, OPTIONS)).toBeNull()
  })

  it('suggests nothing at all with no history', () => {
    expect(suggestSession([], OPTIONS)).toBeNull()
  })
})

describe('suggestSession', () => {
  it('names the least-recently-trained focus with a pattern-level reason and a prefilled path', () => {
    const suggestion = suggestSession(
      [
        session('2026-09-14', { session_focus: 'upper_body', effective_intensity: 7 }),
        session('2026-09-20', { session_focus: 'upper_body', effective_intensity: 7 }),
        session('2026-09-24', { session_focus: 'upper_body', effective_intensity: 7 }),
        session('2026-08-30', { session_focus: 'lower_body', effective_intensity: 5 }),
      ],
      OPTIONS,
    )

    expect(suggestion).not.toBeNull()
    expect(suggestion?.focus).toBe('lower_body')
    expect(suggestion?.focusLabel).toBe('Lower body')
    expect(suggestion?.intensity).toBe(7)
    expect(suggestion?.focusStaleness.daysSince).toBe(26)
    // The requirement's own sentence shape: a movement pattern and a number of
    // days, not a body region. Squat, hinge and unilateral were all last
    // admitted by the same session, so the tie breaks on the enum's order —
    // focus-derived evidence cannot separate patterns inside one focus, which
    // is the bound the module documents.
    expect(suggestion?.patternStaleness.value).toBe('squat')
    expect(suggestion?.reason).toBe('No squat in 26 days.')
    expect(suggestion?.intensityReason).toBe('Your last 3 sessions averaged intensity 7.')
    expect(suggestion?.prefill).toEqual({ focus: 'lower_body', intensity: 7 })
    expect(suggestion?.path).toBe(generatePath({ focus: 'lower_body', intensity: 7 }))
    expect(suggestion?.path).toBe('/generate?focus=lower_body&intensity=7')
  })

  it('gives the reason as a pattern with a day count, never as a body region', () => {
    const suggestion = suggestSession(
      [
        session('2026-09-24', { session_focus: 'lower_body', effective_intensity: 6 }),
        session('2026-09-20', { session_focus: 'lower_body', effective_intensity: 6 }),
        session('2026-09-16', { session_focus: 'lower_body', effective_intensity: 6 }),
        session('2026-09-09', { session_focus: 'upper_body', effective_intensity: 8 }),
      ],
      OPTIONS,
    )

    expect(suggestion?.focus).toBe('upper_body')
    expect(suggestion?.reason).toBe('No press in 16 days.')
    expect(suggestion?.reason).not.toContain('upper body')
  })

  it('states an untrained pattern as an absence rather than as a number', () => {
    const suggestion = suggestSession(upperBodyOnly(), OPTIONS)

    // Upper body is all this user has done, so every other focus is unseen and
    // the enum order prefers a region focus to Power.
    expect(suggestion?.focus).toBe('lower_body')
    expect(suggestion?.reason).toBe('No squat in the sessions you’ve logged.')
  })

  it('says one day rather than 1 days', () => {
    const suggestion = suggestSession(
      [
        session('2026-09-24', { session_focus: 'upper_body' }),
        session('2026-09-23', { session_focus: 'lower_body' }),
        session('2026-09-22', { session_focus: 'power' }),
        session('2026-09-21', { session_focus: 'full_body' }),
      ],
      OPTIONS,
    )

    // Full body is the stalest focus at four days — but its squat was admitted
    // by the lower-body session two days ago, and the reason says the pattern's
    // gap rather than the focus's.
    expect(suggestion?.focus).toBe('full_body')
    expect(suggestion?.focusStaleness.daysSince).toBe(4)
    expect(suggestion?.reason).toBe('No squat in 2 days.')
    expect(
      suggestSession(
        [
          session('2026-09-24', { session_focus: 'lower_body' }),
          session('2026-09-24', { session_focus: 'upper_body' }),
          session('2026-09-24', { session_focus: 'power' }),
          session('2026-09-24', { session_focus: 'full_body' }),
        ],
        OPTIONS,
      )?.reason,
    ).toBe('No press in 1 day.')
  })
})

describe('dismissal', () => {
  function fakeStorage(initial: Record<string, string> = {}): SuggestionStorage {
    const values = new Map(Object.entries(initial))

    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    }
  }

  it('remembers a dismissal for today and forgets it tomorrow', () => {
    const storage = fakeStorage()

    expect(suggestionDismissed(storage, OPTIONS)).toBe(false)
    writeSuggestionDismissal(storage, '2026-09-25')
    expect(readSuggestionDismissal(storage)).toBe('2026-09-25')
    expect(suggestionDismissed(storage, OPTIONS)).toBe(true)
    expect(
      suggestionDismissed(storage, { now: new Date('2026-09-26T08:00:00.000Z'), timeZone: 'UTC' }),
    ).toBe(false)
  })

  it('ignores a malformed record and survives a storage that throws', () => {
    expect(readSuggestionDismissal(fakeStorage({ 'clear.home-suggestion': 'yesterday' }))).toBeNull()
    expect(readSuggestionDismissal(null)).toBeNull()

    const hostile: SuggestionStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }

    expect(readSuggestionDismissal(hostile)).toBeNull()
    expect(() => writeSuggestionDismissal(hostile, '2026-09-25')).not.toThrow()
    expect(() => writeSuggestionDismissal(null, '2026-09-25')).not.toThrow()
  })
})
