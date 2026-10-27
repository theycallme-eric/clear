/**
 * REQ-010 / JOURNEY-008 — the set-logging sheet's one minimise control, and
 * logging access that does not depend on rest, at the workout-screen boundary.
 *
 * Mounted through the real route tree on a synthetic session from the workout
 * double: no personal data, no backend. The wall clock is the only thing the
 * test moves.
 *
 * What it holds the screen to:
 *
 *   · the top chevron is the sheet's only minimise control — there is no
 *     second, bottom Minimize button anywhere on the screen;
 *   · with the sheet minimised — rest running in the footer, skipped, or run
 *     out — the movement card's own Log set and saved-row Edit still open the
 *     sheet; the footer's temporary Rest control offers only Add 30s and Skip
 *     rest, so it is never the way back into logging;
 *   · a minimised draft comes back as it was typed, and the rest keeps
 *     counting while the sheet is hidden.
 *
 * Baseline, recorded rather than assumed: on the reviewed base the sheet
 * (`set-logging-sheet.tsx`) already draws only the chevron, and the card's
 * controls are drawn whatever the rest is doing. These tests pin that. The one
 * gap found: reopening a minimised correction through its own saved row's Edit
 * started over from the stored result; `set-logger.tsx` now hands it back.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders, signedIn } from '../test/render'
import { createWorkoutDouble, snapshotFixture, type SectionFixture } from '../test/workout-double'
import { routes } from './router'

/** Synthetic: one straight-sets movement with its own rest. */
const SECTIONS: SectionFixture[] = [
  {
    title: 'Strength',
    sectionType: 'primary_lift',
    blocks: [{ exercises: [{ prescription: { exercise_id: 'back-squat', rest_seconds: 90 } }] }],
  },
]

/** The wall clock every reading is taken from, moved by the test. */
let clock = 0

beforeEach(() => {
  window.localStorage.clear()
  clock = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

function advance(seconds: number) {
  clock += seconds * 1000
}

/** What the platform fires when a backgrounded tab comes back. */
function returnToForeground() {
  act(() => {
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}

async function shell() {
  const double = createWorkoutDouble({
    session: snapshotFixture({
      sections: SECTIONS,
      startedAt: new Date(Date.now() - 600_000).toISOString(),
    }),
  })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider
        router={createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })}
      />
    </AppProviders>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Workout' })
  return double
}

/** The movement's card, on the main screen — not the sheet in the footer. */
function movementCard(): HTMLElement {
  const card = screen
    .getAllByRole('heading', { name: /back squat$/ })
    .map((heading) => heading.closest('section'))
    .find((section) => section !== null && within(section).queryByRole('button', { name: 'Log set' }))
  if (card === undefined || card === null) throw new Error('no back squat card')
  return card
}

function openSheet(): HTMLElement | null {
  return screen.queryByRole('form', { name: /^(Log|Edit) set \d+ of back squat$/ })
}

/** The sheet's whole frame: title, chevron, context, rest and form. */
function sheetSection(): HTMLElement {
  const section = screen.getByRole('heading', { name: /^(Log|Edit) set \d+$/ }).closest('section')
  if (section === null) throw new Error('no sheet')
  return section
}

function restTimer(): HTMLElement {
  return within(screen.getByRole('region', { name: 'Rest' })).getByRole('timer', {
    name: 'Time remaining',
  })
}

/** Opens the sheet from the card, logs set 1, and minimises the sheet. */
async function logAndMinimise(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.click(within(movementCard()).getByRole('button', { name: 'Log set' }))
  const form = within(screen.getByRole('form', { name: 'Log set 1 of back squat' }))
  await user.click(form.getByRole('button', { name: 'Log set 1' }))
  await screen.findByRole('form', { name: 'Log set 2 of back squat' })
  await user.click(screen.getByRole('button', { name: 'Minimize' }))
  expect(openSheet()).toBeNull()
}

/**
 * The card's own controls reopen logging: Log set opens set 2, and the saved
 * row's Edit opens the correction of set 1. Neither is inside the footer.
 */
async function expectCardReopensLogging(user: ReturnType<typeof userEvent.setup>) {
  const card = within(movementCard())
  expect(card.getByRole('list', { name: 'Logged sets' })).toHaveTextContent('8 reps')

  await user.click(card.getByRole('button', { name: 'Log set' }))
  expect(screen.getByRole('form', { name: 'Log set 2 of back squat' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Minimize' }))
  expect(openSheet()).toBeNull()

  await user.click(within(movementCard()).getByRole('button', { name: 'Edit set 1' }))
  expect(screen.getByRole('form', { name: 'Edit set 1 of back squat' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Minimize' }))
  expect(openSheet()).toBeNull()
}

describe('Set-logging sheet — the top chevron is the only minimise control (AC-036)', () => {
  it('draws one Minimize control, in the sheet head beside its title, and no bottom Minimize', async () => {
    const user = userEvent.setup()
    await shell()
    fireEvent.click(within(movementCard()).getByRole('button', { name: 'Log set' }))

    const sheet = sheetSection()
    const minimise = screen.getAllByRole('button', { name: /minimi[sz]e/i })
    expect(minimise).toHaveLength(1)
    // The chevron sits in the head with the title, above the form.
    const head = within(sheet).getByRole('heading', { name: 'Log set 1' }).parentElement
    expect(head).not.toBeNull()
    expect(head).toContainElement(minimise[0])
    expect(minimise[0]).toHaveAttribute('aria-expanded', 'true')
    // Nothing in the form or below it is a second way to minimise.
    const form = screen.getByRole('form', { name: 'Log set 1 of back squat' })
    expect(within(form).queryByRole('button', { name: /minimi[sz]e|hide|collapse/i })).toBeNull()
    expect(within(form).getAllByRole('button').map((b) => b.textContent)).toContain('Log set 1')

    await user.click(minimise[0])
    expect(openSheet()).toBeNull()
    expect(screen.queryAllByRole('button', { name: /minimi[sz]e/i })).toEqual([])
  })

  it('keeps Cancel / Save correction in edit mode, with the same single chevron', async () => {
    const user = userEvent.setup()
    await shell()
    await logAndMinimise(user)

    await user.click(within(movementCard()).getByRole('button', { name: 'Edit set 1' }))
    const form = within(screen.getByRole('form', { name: 'Edit set 1 of back squat' }))
    expect(form.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Save correction' })).toBeInTheDocument()
    expect(form.queryByRole('button', { name: /minimi[sz]e/i })).toBeNull()
    expect(screen.getAllByRole('button', { name: /minimi[sz]e/i })).toHaveLength(1)
  })
})

describe('Logging access is independent of rest (AC-037)', () => {
  it('reopens Log set and Edit from the card while the rest runs collapsed in the footer', async () => {
    const user = userEvent.setup()
    await shell()
    await logAndMinimise(user)

    const rest = within(screen.getByRole('region', { name: 'Rest' }))
    // The temporary Rest control is not a way into logging.
    expect(rest.getAllByRole('button').map((b) => b.textContent)).toEqual(['Add 30s', 'Skip rest'])
    expect(rest.queryByRole('button', { name: /log|edit|open/i })).toBeNull()

    await expectCardReopensLogging(user)
  })

  it('reopens Log set and Edit from the card after the rest is skipped', async () => {
    const user = userEvent.setup()
    await shell()
    await logAndMinimise(user)

    await user.click(screen.getByRole('button', { name: 'Skip rest' }))
    expect(screen.queryByRole('region', { name: 'Rest' })).toBeNull()

    await expectCardReopensLogging(user)
  })

  it('reopens Log set and Edit from the card after the countdown runs out', async () => {
    const user = userEvent.setup()
    await shell()
    await logAndMinimise(user)

    advance(91)
    returnToForeground()
    expect(screen.queryByRole('region', { name: 'Rest' })).toBeNull()

    await expectCardReopensLogging(user)
  })

  it('reopens logging from the card when the sheet is minimised before any rest exists', async () => {
    const user = userEvent.setup()
    await shell()
    await user.click(within(movementCard()).getByRole('button', { name: 'Log set' }))
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(screen.queryByRole('region', { name: 'Rest' })).toBeNull()

    await user.click(within(movementCard()).getByRole('button', { name: 'Log set' }))
    expect(screen.getByRole('form', { name: 'Log set 1 of back squat' })).toBeInTheDocument()
  })
})

describe('A minimised draft survives, and hiding the sheet does not pause rest (AC-038)', () => {
  it('hands back the unsaved entry on reopen while the rest keeps counting', async () => {
    const user = userEvent.setup()
    const double = await shell()
    fireEvent.click(within(movementCard()).getByRole('button', { name: 'Log set' }))
    await user.click(
      within(screen.getByRole('form', { name: 'Log set 1 of back squat' })).getByRole('button', {
        name: 'Log set 1',
      }),
    )
    const recorded = double.loggedSets().length
    expect(restTimer()).toHaveTextContent('01:30')

    const form = within(screen.getByRole('form', { name: 'Log set 2 of back squat' }))
    await user.clear(form.getByLabelText(/^Reps/))
    await user.type(form.getByLabelText(/^Reps/), '6')
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(openSheet()).toBeNull()

    // Hidden, the rest runs on — read off the wall clock, not paused.
    advance(25)
    returnToForeground()
    expect(restTimer()).toHaveTextContent('01:05')

    advance(15)
    returnToForeground()
    await user.click(within(movementCard()).getByRole('button', { name: 'Log set' }))
    const reopened = within(screen.getByRole('form', { name: 'Log set 2 of back squat' }))
    expect(reopened.getByLabelText(/^Reps/)).toHaveValue(6)
    expect(restTimer()).toHaveTextContent('00:50')
    // Collapse and reopen record nothing.
    expect(double.loggedSets()).toHaveLength(recorded)
  })

  it('hands back an unsaved correction on reopen through the saved row', async () => {
    const user = userEvent.setup()
    await shell()
    await logAndMinimise(user)

    await user.click(within(movementCard()).getByRole('button', { name: 'Edit set 1' }))
    const form = within(screen.getByRole('form', { name: 'Edit set 1 of back squat' }))
    await user.clear(form.getByLabelText(/^Reps/))
    await user.type(form.getByLabelText(/^Reps/), '5')
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(openSheet()).toBeNull()

    await user.click(within(movementCard()).getByRole('button', { name: 'Edit set 1' }))
    expect(
      within(screen.getByRole('form', { name: 'Edit set 1 of back squat' })).getByLabelText(/^Reps/),
    ).toHaveValue(5)
  })
})
