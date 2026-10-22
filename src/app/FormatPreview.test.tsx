/**
 * E06 / REQ-019 — the Settings-linked format preview, on the real route tree.
 *
 * Two criteria. The preview shows representative prescriptions, timing and
 * execution states from fixed data, and is not the developer gallery. And it
 * can be opened from Settings and inspected without generating, starting,
 * logging or saving anything, or changing the athlete's real data — proved by
 * spying on every method of every client the app is given, and on `fetch`,
 * across the whole journey: Settings, the preview, every control it has, Back.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SKINS } from '../design-system/skin'
import { prescriptionText, exerciseName } from '../state/prescription'
import { QueryClient } from '../state/query'
import { STATUS_LABELS } from '../state/session-detail'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { structureIdentity } from '../state/workout-progress'
import { PACING_NOTES, timingSummary } from '../ui/ladder-block'
import { SessionSectionCard } from '../ui/session-detail'
import { createFakeConstraintsClient } from '../test/constraints-double'
import { createFakeGenerationClient } from '../test/generation-double'
import { createFakeRestDayClient } from '../test/rest-day-double'
import { renderApp, signedIn } from '../test/render'
import { createFakeSummaryClient } from '../test/summary-double'
import {
  createFakeUserDataClient,
  fixtureLocation,
  FIXTURE_USER_ID,
  onboardedProfile,
} from '../test/user-data-double'
import { createWorkoutDouble } from '../test/workout-double'
import {
  FORMAT_PREVIEW_NOTE,
  FORMAT_PREVIEW_ROUTE,
  FORMAT_PREVIEW_TITLE,
  PREVIEW_LADDERS,
  PREVIEW_SECTIONS,
  previewSectionView,
} from './FormatPreview'

const heading = (name: string) => screen.findByRole('heading', { level: 1, name })

/**
 * Wraps every method on a client — and on the clients it holds — in a spy that
 * records `path.method`, so "nothing was called" is a statement about every
 * seam the app has rather than about the few a test thought to check.
 */
function spyOnEveryMethod(target: object, path: string, calls: string[], depth = 0) {
  const record = target as Record<string, unknown>
  for (const key of Object.keys(record)) {
    const value = record[key]
    if (typeof value === 'function') {
      const original = value as (...args: unknown[]) => unknown
      record[key] = vi.fn((...args: unknown[]) => {
        calls.push(`${path}.${key}`)
        return original.apply(target, args)
      })
    } else if (depth < 1 && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      spyOnEveryMethod(value, `${path}.${key}`, calls, depth + 1)
    }
  }
}

function spiedApp() {
  const calls: string[] = []
  const generation = createFakeGenerationClient()
  const workout = createWorkoutDouble()
  const userData = createFakeUserDataClient()
  const constraints = createFakeConstraintsClient()
  const summary = createFakeSummaryClient()
  const restDays = createFakeRestDayClient()

  spyOnEveryMethod(generation, 'generation', calls)
  spyOnEveryMethod(workout.clients, 'workout', calls)
  spyOnEveryMethod(userData, 'userData', calls)
  spyOnEveryMethod(constraints, 'constraints', calls)
  spyOnEveryMethod(summary, 'summary', calls)
  spyOnEveryMethod(restDays, 'restDays', calls)

  const cache = new QueryClient()
  const profile = onboardedProfile()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), profile)
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])

  return {
    calls,
    generation,
    workout,
    userData,
    cache,
    profile,
    providers: signedIn({
      queryClient: cache,
      generation,
      workout: workout.clients,
      userData,
      constraints,
      summary,
      restDays,
    }),
  }
}

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
  document.documentElement.removeAttribute('data-skin')
  localStorage.clear()
})

describe('the preview is opened from Settings and leaves everything as it was', () => {
  it('opens from Settings, is inspected, and Back returns to Settings with no read or write', async () => {
    const user = userEvent.setup()
    const app = spiedApp()
    const storedSession = structuredClone(app.workout.stored())
    renderApp(['/settings'], app.providers)

    await heading('Settings')
    // Whatever Settings itself read on arrival is Settings' business; from the
    // moment the preview is asked for, nothing may be called at all.
    app.calls.length = 0
    fetchSpy.mockClear()

    await user.click(await screen.findByRole('button', { name: 'Preview formats' }))
    expect(await heading(FORMAT_PREVIEW_TITLE)).toBeVisible()

    // Every control the preview has, used: the section disclosures, twice each.
    const main = screen.getByRole('main')
    const controls = within(main).getAllByRole('button')
    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) {
      await user.click(control)
      await user.click(control)
    }

    expect(app.calls, JSON.stringify(app.calls)).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await heading('Settings')).toBeVisible()

    // No generation, no session started or ended, no set, block, note or
    // debrief written, no preference or place changed.
    expect(app.calls.filter((call) => !/\.(profile|locations|list|resume)$/.test(call))).toEqual([])
    expect(app.generation.calls).toEqual([])
    expect(app.generation.swaps).toEqual([])
    expect(app.workout.recorded()).toEqual([])
    expect(app.workout.loggedSets()).toEqual([])
    expect(app.workout.completed()).toEqual([])
    expect(app.workout.abandoned()).toEqual([])
    expect(app.workout.savedNotes()).toEqual([])
    expect(app.workout.swaps()).toEqual([])
    expect(app.workout.attempts()).toEqual([])
    expect(app.workout.stored()).toEqual(storedSession)
    expect(app.userData.preferenceWrites).toEqual([])
    expect(app.userData.onboardingCalls).toEqual([])
    expect(app.userData.locationWrites).toEqual([])
    expect(app.userData.defaultWrites).toEqual([])
    expect(app.userData.locationDeletes).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
    // The athlete's real data is what it was.
    expect(app.cache.getState(profileQueryKey(FIXTURE_USER_ID))).toEqual({
      status: 'ready',
      data: app.profile,
    })
  })

  it('opened directly, Back takes Settings’ place', async () => {
    const user = userEvent.setup()
    const app = spiedApp()
    renderApp([FORMAT_PREVIEW_ROUTE], app.providers)

    expect(await heading(FORMAT_PREVIEW_TITLE)).toBeVisible()
    expect(app.calls.filter((call) => call.startsWith('generation') || call.startsWith('summary'))).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await heading('Settings')).toBeVisible()
  })

  it('needs a signed-in athlete, like the Settings it hangs off', async () => {
    renderApp([FORMAT_PREVIEW_ROUTE])

    expect(await screen.findByRole('button', { name: 'Get started' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: FORMAT_PREVIEW_TITLE })).toBeNull()
  })
})

describe('representative prescriptions, timing and execution states', () => {
  async function openPreview() {
    renderApp([FORMAT_PREVIEW_ROUTE], spiedApp().providers)
    await heading(FORMAT_PREVIEW_TITLE)
    return screen.getByRole('main')
  }

  it('says it is a fixed, read-only preview', async () => {
    const main = await openPreview()

    expect(within(main).getByText(FORMAT_PREVIEW_NOTE)).toBeVisible()
  })

  it('names every structure and prescription in the workout’s own words', async () => {
    const main = await openPreview()
    const text = main.textContent ?? ''

    const structures = new Set<string>()
    for (const section of PREVIEW_SECTIONS) {
      for (const block of section.blocks) {
        const identity = structureIdentity(block.columns)
        structures.add(block.columns.structure_type)
        const badge = identity.detail === null ? identity.label : `${identity.label} · ${identity.detail}`
        expect(text).toContain(badge)
        for (const movement of block.movements) {
          expect(text).toContain(exerciseName(movement.columns.exercise_id))
          expect(text).toContain(prescriptionText(movement.columns))
        }
      }
    }
    // Every structure type the app performs is represented.
    expect([...structures].sort()).toEqual(
      ['amrap', 'circuit', 'emom', 'for_time', 'standard', 'superset'],
    )
    // Fixed, per-side, range, timed and distance prescriptions all appear.
    expect(text).toContain('3 × 5 reps')
    expect(text).toContain('3 × 8–10 reps each side')
    expect(text).toContain('3 × 30 sec each side')
    expect(text).toContain('1 × 40 m')
  })

  it('shows each execution state with a glyph, not colour alone', async () => {
    const main = await openPreview()

    for (const label of Object.values(STATUS_LABELS)) {
      const status = within(main).getAllByText(label)[0]!
      expect(status.querySelector('svg')).not.toBeNull()
    }
    // A scored block shows its result, an unscored one says so, and logged sets
    // are a real table.
    expect(within(main).getAllByText('Not scored').length).toBeGreaterThan(0)
    expect(within(main).getByText('3 of 4')).toBeVisible()
    expect(within(main).getByRole('table', { name: 'Sets logged for back squat' })).toBeVisible()
    expect(within(main).getAllByText('No sets logged').length).toBeGreaterThan(0)
  })

  it('shows every ladder timing mode with its rungs, read-only', async () => {
    const main = await openPreview()

    expect(PREVIEW_LADDERS.map((ladder) => ladder.timing.mode).sort()).toEqual(
      ['capped_window', 'for_time', 'scheduled_starts'],
    )
    for (const ladder of PREVIEW_LADDERS) {
      const region = within(within(main).getByRole('region', { name: ladder.heading }))
      expect(
        region.getByText(timingSummary(ladder.timing, ladder.columns.timer_seconds)),
      ).toBeVisible()
      expect(region.getByText(PACING_NOTES[ladder.timing.mode])).toBeVisible()
      const rungs = region.getByRole('list', { name: `${ladder.heading} rungs` })
      expect(within(rungs).getAllByRole('listitem')).toHaveLength(5)
    }
    // The pattern is data, never a choice.
    expect(within(main).queryAllByRole('radio')).toEqual([])
    expect(within(main).getByText('Finished the ladder')).toBeVisible()
    expect(within(main).getByText('Reached rung 3 of 5')).toBeVisible()
  })

  it('draws each section through History’s read-only renderer, markup for markup', async () => {
    const main = await openPreview()
    const rendered = [...main.querySelectorAll('[data-detail-block]')]
      .map((block) => block.closest('.clr-card')!)
      .filter((card, index, all) => all.indexOf(card) === index)

    expect(rendered).toHaveLength(PREVIEW_SECTIONS.length)
    PREVIEW_SECTIONS.forEach((section, index) => {
      const { container, unmount } = render(
        <SessionSectionCard section={previewSectionView(section)} />,
      )
      // ids from `useId` differ between trees; everything else must match.
      const normalise = (html: string) => html.replace(/_r_[a-z0-9]+_/gi, 'id')
      // Standalone the card brings its own bleed wrapper; compare the cards.
      expect(normalise(rendered[index]!.outerHTML)).toBe(
        normalise(container.querySelector('.clr-card')!.outerHTML),
      )
      unmount()
    })
  })

  it('has no form, no text field and nothing to start, log or save', async () => {
    const main = await openPreview()

    expect(main.querySelector('form, input, textarea, select')).toBeNull()
    for (const button of within(main).getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-expanded')
    }
  })

  it('renders the same content under every skin, and leaves the skin alone', async () => {
    for (const skin of SKINS) {
      document.documentElement.setAttribute('data-skin', skin)
      const { unmount } = renderApp([FORMAT_PREVIEW_ROUTE], spiedApp().providers)

      expect(await heading(FORMAT_PREVIEW_TITLE)).toBeVisible()
      expect(screen.getByRole('region', { name: 'Scheduled starts' })).toBeVisible()
      expect(document.documentElement.getAttribute('data-skin')).toBe(skin)
      expect(localStorage.getItem('clear.skin')).toBeNull()
      unmount()
    }
  })
})

describe('the preview is not the developer gallery', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'FormatPreview.tsx'), 'utf8')

  it('imports nothing from the gallery, the test harness or a data client', () => {
    expect(source).not.toMatch(/from '\.\.\/dev\//)
    expect(source).not.toMatch(/from '\.\.\/test\//)
    expect(source).not.toMatch(/from '\.\.\/data\/(?!database\.types)/)
    expect(source).not.toMatch(/use[A-Z]\w*Query\b|useAuth\b|useQueryClient\b/)
  })

  it('carries none of the gallery’s markup', async () => {
    renderApp([FORMAT_PREVIEW_ROUTE], spiedApp().providers)
    await heading(FORMAT_PREVIEW_TITLE)

    expect(document.querySelector('[class*="clr-dev-gallery"]')).toBeNull()
    expect(document.querySelector('a[href^="/dev/"]')).toBeNull()
  })
})
