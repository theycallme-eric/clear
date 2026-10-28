/**
 * REQ-018 / TASK-015 — the active workout's footer: progress immediately above
 * one compact paired row, Previous on the left and Next/Finish on the right,
 * reachable inside the safe areas, with the navigation's flow unchanged.
 *
 * Driven through the real `/workout` route, so the footer is the one the
 * athlete sees rather than the component on its own.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parse } from 'postcss'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AppProviders, signedIn } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type SectionFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { routes } from './router'

const NAV_CSS = readFileSync(resolve(import.meta.dirname, '../ui/workout-navigation.css'), 'utf-8')
const SHELL_CSS = readFileSync(resolve(import.meta.dirname, '../styles/shell.css'), 'utf-8')

/** Synthetic: one finished section, one under way, one untouched. */
const SECTIONS: SectionFixture[] = [
  { title: 'Warm-up', blocks: [{ exercises: ['completed'] }] },
  {
    title: 'Primary lift',
    sectionType: 'primary_lift',
    blocks: [{ structureType: 'emom', timerSeconds: 600, exercises: ['completed', 'not_started'] }],
  },
  {
    title: 'Finisher',
    sectionType: 'conditioning',
    blocks: [{ structureType: 'amrap', timerSeconds: 480 }],
  },
]

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

async function workout(): Promise<{ double: WorkoutDouble; router: ReturnType<typeof createMemoryRouter> }> {
  const double = createWorkoutDouble({
    session: snapshotFixture({
      sections: SECTIONS,
      startedAt: new Date(Date.now() - 750 * 1000).toISOString(),
    }),
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

function footerNav() {
  return screen.getByRole('navigation', { name: 'Workout sections' })
}

/** The paired row: the nav's element children after the progress bar. */
function pairedRow(): HTMLElement {
  const row = footerNav().querySelector('.clr-workout-nav__pair')
  if (!(row instanceof HTMLElement)) throw new Error('no paired row')
  return row
}

function actionsInRow(): HTMLButtonElement[] {
  return Array.from(pairedRow().querySelectorAll('button'))
}

async function jumpTo(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'All sections' }))
  await user.click(screen.getByRole('button', { name }))
}

describe('AC-064: progress sits immediately above one compact paired row', () => {
  it('puts the session progress in the pinned footer, directly above the actions', async () => {
    await workout()

    const nav = footerNav()
    expect(nav.closest('footer')).not.toBeNull()

    const bar = within(nav).getByRole('progressbar', { name: 'Section 2 of 3' })
    expect(bar).toHaveAttribute('aria-valuenow', '1')

    // Immediately above: the bar and the row are adjacent siblings, in that
    // order, with nothing between them.
    const barFrame = Array.from(nav.children).find((child) => child.contains(bar))
    expect(barFrame).toBeDefined()
    expect(barFrame?.nextElementSibling).toBe(pairedRow())
    expect(nav.lastElementChild).toBe(pairedRow())

    // One bar on the screen: the header keeps its jump list, not a second bar.
    expect(screen.getAllByRole('progressbar', { name: /^Section / })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'All sections' })).toBeInTheDocument()
  })

  it('pairs Previous on the left with Next section on the right in one row', async () => {
    await workout()

    const names = actionsInRow().map((button) => button.textContent)
    expect(names).toEqual(['Previous', 'Next section'])
    // Compact: the standard control size, not the oversized one.
    for (const button of actionsInRow()) expect(button).not.toHaveClass('clr-chamfer--lg')
  })

  it('keeps the pair on the last section, with Finish workout on the right', async () => {
    const user = userEvent.setup()
    await workout()

    await jumpTo(user, 'Conditioning, not started')

    expect(actionsInRow().map((button) => button.textContent)).toEqual([
      'Previous',
      'Finish workout',
    ])
    expect(within(footerNav()).getByRole('progressbar', { name: 'Section 3 of 3' })).toBeInTheDocument()
  })

  it('lays the row out as two equal columns at every width, never stacked', async () => {
    await workout()
    const pair = /\.clr-workout-nav__pair\s*\{([^}]*)\}/.exec(NAV_CSS)?.[1] ?? ''
    expect(pair).toMatch(/display:\s*grid/)
    expect(pair).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    // No breakpoint re-flows the pair, and no `order` swaps the sides.
    const responsivePairRules: string[] = []
    parse(NAV_CSS).walkAtRules('media', (media) => {
      media.walkRules((rule) => {
        if (rule.selector.includes('.clr-workout-nav__pair')) responsivePairRules.push(rule.toString())
      })
    })
    expect(responsivePairRules).toEqual([])
    expect(NAV_CSS).not.toMatch(/\border\s*:/)
    // The row does not use the shipped stacking action row.
    expect(pairedRow()).not.toHaveClass('clr-actions')
  })
})

describe('AC-065: readable, aligned, reachable, and the same flow', () => {
  it('keeps both actions full-cell, aligned and labelled at the control height', async () => {
    await workout()

    const [previous, next] = actionsInRow()
    for (const button of [previous, next]) {
      expect(button.style.minHeight).toBe('var(--control-height)')
      expect(button).toHaveAccessibleName()
    }
    expect(NAV_CSS).toMatch(/\.clr-workout-nav__pair > \.clr-bleed > \.clr-btn,[^{]*\{[^}]*width:\s*100%/)
    expect(NAV_CSS).toMatch(/\.clr-workout-nav__pair > \*\s*\{[^}]*min-width:\s*0/)
    // Tokens only.
    expect(NAV_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|\d+px/i)
  })

  it('stays inside the device safe areas the contained shell reserves', async () => {
    await workout()

    expect(footerNav().closest('.clr-shell--contained')).not.toBeNull()
    const max = (property: string, inset: string) =>
      new RegExp(`${property}:\\s*max\\(var\\(--spacing-\\d+\\),\\s*env\\(safe-area-inset-${inset}\\)\\)`)
    expect(SHELL_CSS).toMatch(max('padding-bottom', 'bottom'))
    expect(SHELL_CSS).toMatch(max('--shell-inset-left', 'left'))
    expect(SHELL_CSS).toMatch(max('--shell-inset-right', 'right'))
  })

  it('keeps Previous disabled on the first section and moves back without saving', async () => {
    const user = userEvent.setup()
    const { double } = await workout()

    await user.click(within(pairedRow()).getByRole('button', { name: 'Previous' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Warm-up' })).toHaveFocus()
    expect(within(pairedRow()).getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(within(footerNav()).getByRole('progressbar', { name: 'Section 1 of 3' })).toBeInTheDocument()
    expect(double.recorded()).toEqual([])
  })

  it('saves the open section before Next section moves on', async () => {
    const user = userEvent.setup()
    const { double } = await workout()

    await user.click(within(pairedRow()).getByRole('button', { name: 'Next section' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Conditioning' })).toHaveFocus()
    expect(double.recorded().length).toBeGreaterThan(0)
    expect(within(footerNav()).getByRole('progressbar', { name: 'Section 3 of 3' })).toBeInTheDocument()
  })

  it('ends through the existing finish flow from the right-hand action', async () => {
    const user = userEvent.setup()
    const { double, router } = await workout()

    await jumpTo(user, 'Conditioning, not started')
    await user.click(within(pairedRow()).getByRole('button', { name: 'Finish workout' }))

    await screen.findByRole('heading', { level: 1, name: 'Nice work' })
    expect(router.state.location.pathname).toBe('/summary')
    expect(double.completed()).toEqual([{ sessionId: FIXTURE_SESSION_ID, minutes: 12 }])
  })
})
