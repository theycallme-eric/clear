/**
 * REQ-019 / TASK-016 — Abandon in the framed top menu. The menu trigger shows
 * its glyph without the visible "Actions" word and keeps that word as its
 * accessible name; Abandon asks the accepted confirm, confirming abandons with
 * the existing retention behaviour, and dismissing returns to the active
 * workout unchanged.
 *
 * Driven through the real `/workout` route, so the header is the one the
 * athlete sees rather than the component on its own.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createError, err, ErrorCode } from '../state/errors'
import { WORKOUT_SHELL_STORAGE_KEY } from '../state/workout-persistence'
import { AppProviders, signedIn } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type SectionFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import type { SessionsClient } from '../data/sessions'
import { routes } from './router'

const NAV_CSS = readFileSync(resolve(import.meta.dirname, '../ui/workout-navigation.css'), 'utf-8')

/** Synthetic: one finished section and one under way. */
const SECTIONS: SectionFixture[] = [
  { title: 'Warm-up', blocks: [{ exercises: ['completed'] }] },
  {
    title: 'Primary lift',
    sectionType: 'primary_lift',
    blocks: [{ exercises: ['completed', 'not_started'] }],
  },
]

const ABANDON_CONFIRM = 'Abandon workout?'
const HOME_HEADING = 'Today'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

async function workout(
  sessions?: Partial<SessionsClient>,
): Promise<{ double: WorkoutDouble; router: ReturnType<typeof createMemoryRouter> }> {
  const double = createWorkoutDouble({
    session: snapshotFixture({
      sections: SECTIONS,
      startedAt: new Date(Date.now() - 750 * 1000).toISOString(),
    }),
    sessions,
  })
  const router = createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Workout' })
  await screen.findByRole('navigation', { name: 'Workout sections' })
  return { double, router }
}

function header(): HTMLElement {
  const heading = screen.getByRole('heading', { level: 1, name: 'Workout' })
  const found = heading.closest('header')
  if (found === null) throw new Error('no header')
  return found
}

function trigger(): HTMLElement {
  return within(header()).getByRole('button', { name: 'Actions' })
}

function openDialog(title: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).find(
    (dialog) => dialog.querySelector('h2')?.textContent === title,
  )
}

function confirmDialog(): HTMLElement {
  const dialog = openDialog(ABANDON_CONFIRM)
  if (dialog === undefined) throw new Error(`no open dialog titled "${ABANDON_CONFIRM}"`)
  return dialog
}

async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(trigger())
  return within(header()).getByRole('group', { name: 'Actions' })
}

describe('AC-067: the menu icon shows no visible "Actions" word and keeps its name', () => {
  it('names the header trigger "Actions" while drawing only its glyph', async () => {
    await workout()

    const button = trigger()
    expect(button).toHaveAccessibleName('Actions')
    // No visible word: the button's rendered text is empty and its one child
    // is the icon.
    expect(button.textContent?.trim()).toBe('')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(within(header()).queryByText(/actions/i)).not.toBeInTheDocument()
    // Framed: the shipped icon button's chamfer, not the borderless quiet one.
    expect(button).toHaveClass('clr-chamfer')
    expect(button).not.toHaveClass('clr-btn--quiet')
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps Abandon out of the header until the menu is opened', async () => {
    await workout()

    expect(screen.queryByRole('button', { name: 'Abandon' })).not.toBeInTheDocument()
    expect(trigger().getAttribute('aria-controls')).toBeTruthy()
  })
})

describe('AC-066: Abandon lives in the framed top menu', () => {
  it('opens a framed panel beneath the trigger that holds Abandon', async () => {
    const user = userEvent.setup()
    await workout()

    const panel = await openMenu(user)
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(trigger()).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toHaveClass('clr-bleed')
    expect(panel.querySelector('.clr-workout-menu__frame')).toHaveClass('clr-chamfer', 'clr-chamfer--sm')
    expect(within(panel).getByRole('button', { name: 'Abandon' })).toBeInTheDocument()
    // The panel overlays the content below the header instead of pushing it.
    expect(NAV_CSS).toMatch(/\.clr-workout-menu\s*\{[^}]*position:\s*relative/)
    expect(NAV_CSS).toMatch(/\.clr-workout-menu__panel\s*\{[^}]*position:\s*absolute/)
  })

  it('closes on Esc and on a press outside without abandoning anything', async () => {
    const user = userEvent.setup()
    const { double, router } = await workout()

    await openMenu(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Abandon' })).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')

    await openMenu(user)
    await user.click(screen.getByRole('heading', { name: 'Primary lift' }))
    expect(screen.queryByRole('button', { name: 'Abandon' })).not.toBeInTheDocument()

    expect(openDialog(ABANDON_CONFIRM)).toBeUndefined()
    expect(double.abandoned()).toEqual([])
    expect(router.state.location.pathname).toBe('/workout')
  })

  it('asks the accepted confirm, and dismissing returns to the unchanged workout', async () => {
    const user = userEvent.setup()
    const { double, router } = await workout()

    const panel = await openMenu(user)
    await user.click(within(panel).getByRole('button', { name: 'Abandon' }))

    await waitFor(() => expect(openDialog(ABANDON_CONFIRM)).toBeDefined())
    const dialog = confirmDialog()
    expect(dialog).toHaveTextContent('Everything logged so far is kept.')
    expect(dialog).toHaveTextContent('it does not count towards your streak')
    // The menu closed before the question was asked.
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')

    await user.click(within(dialog).getByRole('button', { name: 'Keep going' }))
    await waitFor(() => expect(openDialog(ABANDON_CONFIRM)).toBeUndefined())

    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
    expect(double.abandoned()).toEqual([])
    expect(double.completed()).toEqual([])
    expect(router.state.location.pathname).toBe('/workout')
    expect(screen.queryByRole('button', { name: 'Abandon' })).not.toBeInTheDocument()
  })

  it('abandons on confirm with the existing retention behaviour and destination', async () => {
    const user = userEvent.setup()
    const { double, router } = await workout()

    const panel = await openMenu(user)
    await user.click(within(panel).getByRole('button', { name: 'Abandon' }))
    await waitFor(() => expect(openDialog(ABANDON_CONFIRM)).toBeDefined())
    await user.click(within(confirmDialog()).getByRole('button', { name: 'Abandon' }))

    // The existing post-abandon destination is Home; this session is not resumable.
    expect(await screen.findByRole('heading', { name: HOME_HEADING })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    // Abandoned is a state, not a delete, and it is not a completion.
    expect(double.abandoned()).toEqual([FIXTURE_SESSION_ID])
    expect(double.completed()).toEqual([])
    expect(window.localStorage.getItem(WORKOUT_SHELL_STORAGE_KEY)).toBeNull()
  })

  it('keeps the session running when the abandon itself fails', async () => {
    const user = userEvent.setup()
    await workout({ abandon: async () => err(createError(ErrorCode.NETWORK_OFFLINE)) })

    const panel = await openMenu(user)
    await user.click(within(panel).getByRole('button', { name: 'Abandon' }))
    await waitFor(() => expect(openDialog(ABANDON_CONFIRM)).toBeDefined())
    await user.click(within(confirmDialog()).getByRole('button', { name: 'Abandon' }))

    expect(await screen.findByText('No connection. Check your network.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Primary lift' })).toBeInTheDocument()
  })

  it('still asks the same confirm for a blocked in-app navigation', async () => {
    const { router } = await workout()

    await router.navigate('/history')

    await waitFor(() => expect(openDialog(ABANDON_CONFIRM)).toBeDefined())
    expect(router.state.location.pathname).toBe('/workout')
  })
})
