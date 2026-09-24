/**
 * REQ-057 acceptance, the half that is arithmetic: what the boot screen shows
 * for a given set of real init results, and the negative that matters most —
 * nothing in the boot path can wait for a clock.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { HistoryPage } from '../data/history'
import type { UserConstraint } from '../data/constraints'
import { makeAppError, makeSessionRow } from '../test/factories'
import { fixtureLocation, onboardedProfile } from '../test/user-data-double'
import {
  BOOT_DATA_INTACT,
  BOOT_FAILURE_TITLE,
  BOOT_STEPS,
  bootView,
  constraintsDetail,
  equipmentDetail,
  historyDetail,
  profileDetail,
  type BootCheck,
  type BootChecks,
} from './boot'

const CHECKING: BootCheck = { status: 'checking' }

function checks(overrides: Partial<BootChecks> = {}): BootChecks {
  return {
    profile: CHECKING,
    history: CHECKING,
    equipment: CHECKING,
    constraints: CHECKING,
    ...overrides,
  }
}

function done(detail: string): BootCheck {
  return { status: 'done', detail }
}

function page(count: number, hasMore = false): HistoryPage {
  return {
    sessions: Array.from({ length: count }, (_, index) =>
      makeSessionRow({ id: `session-${String(index)}` }),
    ),
    hasMore,
  }
}

function constraint(id: string): UserConstraint {
  return {
    id,
    userId: 'user-1',
    action: 'exclude',
    target: { scope: 'movement_pattern', pattern: 'press' },
    appliesTo: { persistence: 'persistent' },
    note: null,
    createdAt: '2026-09-22T09:00:00.000Z',
  }
}

describe('REQ-057 boot view', () => {
  it('reports progress out of the four real checks, and nothing finished before it is', () => {
    const view = bootView(checks({ profile: done('loaded') }))

    expect(view).toEqual({
      status: 'checking',
      lines: ['Profile · loaded'],
      value: 1,
      max: 4,
    })
  })

  it('lists finished rows in step order regardless of which read answered first', () => {
    const view = bootView(
      checks({ constraints: done('none'), profile: done('loaded') }),
    )

    expect(view).toMatchObject({
      status: 'checking',
      lines: ['Profile · loaded', 'Constraints · none'],
      value: 2,
    })
  })

  it('is ready — the app continuing on its own — the moment every check is done', () => {
    const view = bootView({
      profile: done('loaded'),
      history: done('42 entries'),
      equipment: done('Home'),
      constraints: done('none'),
    })

    expect(view).toEqual({ status: 'ready' })
  })

  it('has no state between the last check and the app: readiness is the only outcome', () => {
    // Pattern 7's "don't": a ready app behind a keypress. There is no view the
    // user can be shown that requires an action to leave.
    const statuses = new Set([
      bootView(checks()).status,
      bootView(checks({ profile: { status: 'failed', error: makeAppError() } })).status,
      bootView({
        profile: done('loaded'),
        history: done('no entries'),
        equipment: done('none set'),
        constraints: done('none'),
      }).status,
    ])

    expect(statuses).toEqual(new Set(['checking', 'failed', 'ready']))
  })

  it('fails with the template’s reassurance, naming what could not be read', () => {
    const error = makeAppError()
    const view = bootView(checks({ history: { status: 'failed', error } }))

    expect(view).toEqual({
      status: 'failed',
      failure: {
        step: BOOT_STEPS[1],
        error,
        message: `Could not read session history. ${BOOT_DATA_INTACT}`,
      },
    })
    expect(BOOT_FAILURE_TITLE).toBe('System check failed')
  })

  it('names one failure even when two reads failed, and never reports progress instead', () => {
    const first = makeAppError({ message: 'profile' })
    const second = makeAppError({ message: 'constraints' })

    const view = bootView(
      checks({
        profile: { status: 'failed', error: first },
        constraints: { status: 'failed', error: second },
      }),
    )

    expect(view).toMatchObject({ status: 'failed', failure: { error: first } })
  })
})

describe('REQ-057 boot rows say what actually arrived', () => {
  it('distinguishes a loaded profile from a user who has no row yet', () => {
    expect(profileDetail(onboardedProfile())).toBe('loaded')
    expect(profileDetail(null)).toBe('new account')
  })

  it('counts history entries, and says so when there are none', () => {
    expect(historyDetail(page(0))).toBe('no entries')
    expect(historyDetail(page(1))).toBe('1 entry')
    expect(historyDetail(page(20))).toBe('20 entries')
    // A full page with more behind it is not a total, and does not claim to be.
    expect(historyDetail(page(20, true))).toBe('20+ entries')
  })

  it('names the default location for equipment, and admits when there is none', () => {
    expect(equipmentDetail([fixtureLocation({ name: 'Garage' })])).toBe('Garage')
    expect(
      equipmentDetail([
        fixtureLocation({ id: 'l-1', name: 'Hotel', is_default: false }),
        fixtureLocation({ id: 'l-2', name: 'Home', is_default: true }),
      ]),
    ).toBe('Home')
    expect(equipmentDetail([])).toBe('none set')
  })

  it('counts the constraints in force', () => {
    expect(constraintsDetail([])).toBe('none')
    expect(constraintsDetail([constraint('c-1')])).toBe('1 in force')
    expect(constraintsDetail([constraint('c-1'), constraint('c-2')])).toBe('2 in force')
  })
})

describe('REQ-057 · no artificial minimum boot duration exists', () => {
  /**
   * The acceptance criterion is a negative about the code, not about a render:
   * a delay added "for the brand" would still pass every behavioural test above
   * because every one of them would simply take longer. So the boot path is
   * read as source, and a timer anywhere in it fails here.
   *
   * `useSlowThreshold` is deliberately not in this list. It does not hold boot
   * back — it changes what a still-running check is *called* after four
   * seconds, which is pattern 7's "if initialization outruns the budget, say
   * so", and it lives in `view-state.ts` where every loading view shares it.
   */
  const repoRoot = resolve(import.meta.dirname, '../..')
  const bootPath = [
    'src/state/boot.ts',
    'src/state/boot-queries.ts',
    'src/app/BootSequence.tsx',
  ]

  it.each(bootPath)('%s starts no timer and waits on no animation', (file) => {
    const source = readFileSync(resolve(repoRoot, file), 'utf-8')
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

    expect(code).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/)
    // Reduced motion is never held on an animation because nothing in the boot
    // path observes one finishing.
    expect(code).not.toMatch(/onAnimationEnd|animationend|onTransitionEnd/)
  })
})
