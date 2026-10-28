/**
 * REQ-020 · JOURNEY-016 — a long swap list stays contained, scrolls, lets the
 * last choice be picked, and the pick lands back on Review with feedback from
 * the app's one toast queue.
 *
 * Every test mounts the real route tree at `/review` on a phone-sized window,
 * over a synthetic candidate fixture long enough that an uncontained list
 * would run past the screen. jsdom lays nothing out, so geometry is stated on
 * the scroller where a browser would compute it; what is proved here is the
 * structure, the scroll wiring, reachability and the return path.
 *
 * NOT PROVEN HERE: the reported installed-iPhone scrolling defect. The sources
 * do not give its exact reproduction (iOS version, list length, gesture), so
 * it is recorded as unknown, and the device outcome stays with post-launch
 * manual UAT on the installed iOS build. Neither jsdom nor local Chromium is
 * that proof.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Candidate, SectionCandidates } from '../data/candidates'
import { reviewHandoff } from '../state/review-handoff'
import { toastQueue } from '../state/toasts'
import { makeSessionAcceptance } from '../test/factories'
import { createFakeGenerationClient } from '../test/generation-double'
import { AppProviders, signedIn } from '../test/render'
import { createWorkoutDouble } from '../test/workout-double'
import { START_LABEL } from './Review'
import { REVIEW_PATH } from './ReviewRoute'
import { routes } from './router'

/** Back squat (barbell) and kb swing in the primary lift; air squat warms up. */
const ACCEPTANCE = makeSessionAcceptance()

const LONG_LIST_LENGTH = 32

function candidate(index: number): Candidate {
  const n = String(index + 1).padStart(2, '0')
  return {
    exerciseId: `synthetic-hinge-${n}`,
    name: `Synthetic hinge ${n}`,
    patterns: ['hinge'],
    primaryPatterns: ['hinge'],
    role: 'compound_lift',
    components: [],
    muscles: [],
    canBePrimary: true,
    usableEquipment: ['barbell'],
  }
}

/** A primary-lift pool far longer than any phone screen holds. */
const LONG_SETS: readonly SectionCandidates[] = [
  {
    section: 'primary_lift',
    relaxed: false,
    candidates: Array.from({ length: LONG_LIST_LENGTH }, (_, index) => candidate(index)),
  },
]

const LAST_NAME = `Synthetic hinge ${LONG_LIST_LENGTH}`

const PHONE = { width: 390, height: 844 }
let restoreWindow: () => void = () => {}

function phoneWindow() {
  const { innerWidth, innerHeight } = window
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: PHONE.width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: PHONE.height })
  restoreWindow = () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: innerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight })
  }
  window.dispatchEvent(new Event('resize'))
}

function mount() {
  const router = createMemoryRouter(routes, {
    initialEntries: ['/', { pathname: REVIEW_PATH, state: reviewHandoff(ACCEPTANCE) }],
    initialIndex: 1,
  })
  render(
    <AppProviders
      {...signedIn({
        workout: createWorkoutDouble({ session: null, candidateSets: LONG_SETS }).clients,
        generation: createFakeGenerationClient(),
      })}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

async function openLongList(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { level: 1, name: ACCEPTANCE.workout.title })
  await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
  const dialog = await screen.findByRole('dialog', { name: 'Swap back squat' })
  const list = await within(dialog).findByRole('list', { name: 'Alternatives' })
  return { dialog, list }
}

/** The public ScrollRegion's scrolling element that owns the list. */
function scrollerOf(list: HTMLElement): HTMLElement {
  const scroller = list.closest<HTMLElement>('.clr-scroll-region__scroller')
  if (scroller === null) throw new Error('the alternatives are not inside a ScrollRegion')
  return scroller
}

beforeEach(() => {
  toastQueue.clear()
  phoneWindow()
})

afterEach(() => {
  restoreWindow()
})

describe('swap-selection · a long list is contained (AC-068, AC-076)', () => {
  it('puts every alternative inside one bounded ScrollRegion, with the title and Keep outside it', async () => {
    const user = userEvent.setup()
    mount()
    const { dialog, list } = await openLongList(user)

    expect(within(list).getAllByRole('button')).toHaveLength(LONG_LIST_LENGTH)

    const scroller = scrollerOf(list)
    const region = scroller.parentElement!
    expect(region).toHaveClass('clr-scroll-region')
    // The one scroll owner: no second region nested inside it.
    expect(scroller.querySelector('.clr-scroll-region')).toBeNull()

    // The frame the region fills is capped to what the viewport leaves, in
    // tokens and dynamic-viewport units, never a fixed pixel height.
    const frame = region.closest<HTMLElement>('[data-swap-list-frame]')!
    expect(frame).not.toBeNull()
    expect(frame.style.maxHeight).toContain('100dvh')
    expect(frame.style.maxHeight).toContain('var(--spacing-600)')
    expect(frame.style.maxHeight).not.toMatch(/\d+px/)

    // The heading and the safe action stay pinned outside the scroller.
    const heading = within(dialog).getByRole('heading', { name: 'Swap back squat' })
    const keep = within(dialog).getByRole('button', { name: 'Keep back squat' })
    expect(scroller.contains(heading)).toBe(false)
    expect(scroller.contains(keep)).toBe(false)
  })

  it('scrolls under touch so the last alternative is reachable and selectable', async () => {
    const user = userEvent.setup()
    mount()
    const { list } = await openLongList(user)
    const scroller = scrollerOf(list)
    const region = scroller.parentElement!

    // State the geometry a phone would compute: a 32-row list in a short box.
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 360 })
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1800 })

    const last = within(list).getByRole('button', { name: new RegExp(`^${LAST_NAME}\\s*BARBELL$`) })
    fireEvent.touchStart(scroller, { touches: [{ clientX: 195, clientY: 600 }] })
    fireEvent.touchMove(scroller, { touches: [{ clientX: 195, clientY: 120 }] })
    scroller.scrollTop = 1800 - 360
    fireEvent.scroll(scroller)
    fireEvent.touchEnd(scroller)

    // The region took the scroll: its streaks and drawn bar respond.
    await waitFor(() => expect(region).toHaveAttribute('data-scrolling'))
    expect(scroller.scrollTop).toBe(1440)
    expect(scroller.contains(last)).toBe(true)
    expect(last).toBeEnabled()
  })
})

describe('swap-selection · selection returns to Review (AC-068, AC-069, AC-076)', () => {
  it('picks the last alternative, closes the list and lands back on the owning Review', async () => {
    const user = userEvent.setup()
    const router = mount()
    const { list } = await openLongList(user)

    await user.click(within(list).getByRole('button', { name: new RegExp(`^${LAST_NAME}\\s*BARBELL$`) }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('list', { name: 'Alternatives' })).toBeNull()
    expect(router.state.location.pathname).toBe(REVIEW_PATH)
    expect(screen.getByRole('heading', { level: 1, name: ACCEPTANCE.workout.title })).toBeInTheDocument()
    // The swapped slot is the one on Review now, with its undo and Start intact.
    expect(screen.getByRole('button', { name: `Swap ${LAST_NAME.toLowerCase()}` })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Undo swap — back to back squat' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Swap back squat' })).toBeNull()
    expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled()
  })

  it('confirms the pick through the existing toast queue and host, not a bespoke notice', async () => {
    const user = userEvent.setup()
    mount()
    const { list } = await openLongList(user)
    expect(toastQueue.getState().current).toBeNull()

    await user.click(within(list).getByRole('button', { name: new RegExp(`^${LAST_NAME}\\s*BARBELL$`) }))

    // One message, on the root queue the app's ToastHost renders.
    const { current, queue } = toastQueue.getState()
    expect(current).toMatchObject({ variant: 'positive', message: `Swapped in ${LAST_NAME}.` })
    expect(queue).toHaveLength(0)

    const host = document.querySelector<HTMLElement>('[data-clear-toast-host]')
    expect(host).not.toBeNull()
    expect(within(host!).getByRole('status')).toHaveTextContent(`Swapped in ${LAST_NAME}.`)
    // The only live feedback on screen is the host's.
    const notices = screen
      .queryAllByText(`Swapped in ${LAST_NAME}.`)
      .filter((node) => !host!.contains(node))
    expect(notices).toHaveLength(0)

    // Dismissal is the shared Toast's own control.
    await user.click(within(host!).getByRole('button', { name: /dismiss/i }))
    await waitFor(() => expect(toastQueue.getState().current).toBeNull())
  })

  it('keeping the movement returns to Review with nothing swapped and no toast', async () => {
    const user = userEvent.setup()
    mount()
    const { dialog } = await openLongList(user)

    await user.click(within(dialog).getByRole('button', { name: 'Keep back squat' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Swap back squat' })).toBeEnabled()
    expect(toastQueue.getState().current).toBeNull()
  })
})
