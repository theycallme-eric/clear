/**
 * Effects TASK-007 (REQ-007, JOURNEY-004) — the comfort end states, on the
 * real route tree.
 *
 * One mounted app, never reloaded: Visual effects is unchecked in `/settings`
 * and the athlete goes on to Home and `/generate`; it is checked again; OS
 * reduced motion turns on and off mid-session; the tab is hidden and shown.
 * Each step asserts what the screens render — the Phosphor Echo rear images,
 * the one CRT field and its two clocks, the atmosphere blobs and the retired
 * scans — and that focus, input, loading/busy and errors keep working under
 * every combination of Visual effects and reduced motion.
 *
 * jsdom has no Web Animations, so the field's two clocks are recorded by a
 * stand-in `animate`: what is asserted is that they are created once, paused
 * in place and played again — never recreated, so never restarted or caught
 * up. The painted result and the clock arithmetic are proven in a real
 * browser by `e2e/effects/comfort-transitions.spec.ts`.
 */
import { act, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { historyQueryKey } from '../state/history-queries'
import {
  GENERATION_FAILED_LABEL,
  GENERATION_LOADING_TITLE,
} from '../state/generation-loading'
import { QueryClient } from '../state/query'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { createFakeConstraintsClient } from '../test/constraints-double'
import { makeGenerationError } from '../test/factories'
import { createFakeGenerationClient, type FakeGenerationClient } from '../test/generation-double'
import { renderApp, signedIn } from '../test/render'
import {
  createFakeUserDataClient,
  fixtureLocation,
  FIXTURE_USER_ID,
  onboardedProfile,
} from '../test/user-data-double'
import { CRT_FIELD_ANIMATIONS } from '../ui/crt-field/crt-field'
import { CRT_FIELD_CONFIG, crtFieldCustomProperties } from '../ui/crt-field/config'
import { PHOSPHOR_ECHO_FILTER_ID } from '../ui/phosphor-echo'
import { PHOSPHOR_ECHO_PRESET } from '../ui/phosphor-echo-preset'

const KEY = 'clear.visual-effects'

// ---------------------------------------------------------------------------
// Doubles: the OS preference, document visibility, layout and Web Animations.
// ---------------------------------------------------------------------------

/** A live `prefers-reduced-motion` the test can flip, telling every listener. */
function installReducedMotion(initial = false) {
  let reduced = initial
  const listeners = new Set<() => void>()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query.includes('prefers-reduced-motion') ? reduced : false
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        addListener: (listener: () => void) => listeners.add(listener),
        removeListener: (listener: () => void) => listeners.delete(listener),
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
  return (next: boolean) => {
    reduced = next
    act(() => {
      for (const listener of [...listeners]) listener()
    })
  }
}

/** Hide or show the document, as the browser announces it. */
function installVisibility() {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  return (state: 'hidden' | 'visible') => {
    visibility.mockReturnValue(state)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
  }
}

/** jsdom lays nothing out: give every element a box, and each Echo wrapper the origin. */
function layOut() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const origin = this.classList.contains('clr-echo')
    return DOMRect.fromRect(origin ? { x: 0, y: 0, width: 0, height: 0 } : { x: 0, y: 0, width: 120, height: 48 })
  })
}

interface FakeClock {
  id: string
  currentTime: number
  /** Each play/pause/cancel, in order. */
  calls: string[]
  playState: 'running' | 'paused' | 'idle'
}

/** A stand-in for `Element.animate`, recording every clock the field creates. */
function installAnimate() {
  const clocks: FakeClock[] = []
  const animate = vi.fn(function (this: Element) {
    const clock: FakeClock = { id: '', currentTime: 0, calls: [], playState: 'running' }
    clocks.push(clock)
    return {
      get id() {
        return clock.id
      },
      set id(value: string) {
        clock.id = value
      },
      get currentTime() { return clock.currentTime },
      set currentTime(value: number) { clock.currentTime = value },
      play: () => {
        clock.calls.push('play')
        clock.playState = 'running'
      },
      pause: () => {
        clock.calls.push('pause')
        clock.playState = 'paused'
      },
      cancel: () => {
        clock.calls.push('cancel')
        clock.playState = 'idle'
      },
    } as unknown as Animation
  })
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, writable: true, value: animate })
  return {
    clocks,
    /** The field's clocks that are still alive (not cancelled), by id. */
    live: () => clocks.filter((clock) => clock.playState !== 'idle'),
    restore: () => {
      delete (Element.prototype as Partial<Element>).animate
    },
  }
}

// ---------------------------------------------------------------------------
// The app.
// ---------------------------------------------------------------------------

function warmCache() {
  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile({ goal_preset: 'strength' }))
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
  cache.setData(historyQueryKey(FIXTURE_USER_ID, 1), { sessions: [], hasMore: false })
  return cache
}

function renderJourney(initial = '/settings') {
  const generation = createFakeGenerationClient()
  const rendered = renderApp(
    [initial],
    signedIn({
      queryClient: warmCache(),
      userData: createFakeUserDataClient(),
      constraints: createFakeConstraintsClient(),
      generation,
    }),
  )
  return { ...rendered, generation, user: userEvent.setup() }
}

const field = () => document.querySelectorAll<HTMLElement>('.clr-effects-host > .clr-crt-field')
const host = () => document.querySelector<HTMLElement>('.clr-effects-host')!
const atmosphere = () => document.querySelector<HTMLElement>('.clr-atmosphere')!
const blobs = () => [...document.querySelectorAll<HTMLElement>('.clr-atmosphere__blob')]
const echoSources = () => document.querySelectorAll('.clr-echo__source')
const visualEffects = () => screen.getByRole('checkbox', { name: 'Visual effects' })

/** No CRT field, and none of the old decorative scans in the rendered tree. */
function expectNoFieldNorOldScans() {
  expect(field()).toHaveLength(0)
  expect(document.querySelector('.clr-crt-field')).toBeNull()
  expect(document.querySelector('.clr-atmosphere__scan')).toBeNull()
  expect(document.querySelector('.scanlines-overlay')).toBeNull()
}

/** The blobs: all three, in their role colours, whatever the motion. */
function expectBlobs() {
  expect(document.querySelectorAll('.clr-atmosphere')).toHaveLength(1)
  expect(blobs().map((blob) => blob.className)).toEqual([
    'clr-atmosphere__blob clr-atmosphere__blob--structure',
    'clr-atmosphere__blob clr-atmosphere__blob--interaction',
    'clr-atmosphere__blob clr-atmosphere__blob--info',
  ])
  expect(document.querySelector('.clr-atmosphere__overlay')).not.toBeNull()
}

/** The one field, with the centralized configuration identity and values. */
function expectFieldIdentity() {
  expect(field()).toHaveLength(1)
  const element = field()[0]!
  expect(element).toHaveAttribute('data-crt-config', CRT_FIELD_CONFIG.id)
  for (const [name, value] of Object.entries(crtFieldCustomProperties())) {
    expect(element.style.getPropertyValue(name), name).toBe(value)
  }
  return element
}

/** The one Echo filter, built from the centralized preset. */
function expectEchoIdentity() {
  const filters = document.querySelectorAll(`filter#${PHOSPHOR_ECHO_FILTER_ID}`)
  expect(filters).toHaveLength(1)
  const filter = filters[0]!
  expect(Number(filter.querySelector('feGaussianBlur')?.getAttribute('stdDeviation'))).toBe(PHOSPHOR_ECHO_PRESET.blur)
  expect(Number(filter.querySelector('feOffset')?.getAttribute('dx'))).toBe(PHOSPHOR_ECHO_PRESET.x)
  expect(Number(filter.querySelector('feOffset')?.getAttribute('dy'))).toBe(PHOSPHOR_ECHO_PRESET.y)
  expect(Number(filter.querySelector('feFuncA')?.getAttribute('slope'))).toBe(PHOSPHOR_ECHO_PRESET.opacity)
}

function expectMotion(state: 'running' | 'still') {
  expect(host()).toHaveAttribute('data-motion', state === 'running' ? 'allowed' : 'still')
  if (state === 'running') expect(atmosphere()).not.toHaveAttribute('data-static')
  else expect(atmosphere()).toHaveAttribute('data-static', 'true')
  if (field().length > 0) {
    expect(field()[0]).toHaveAttribute('data-motion', state === 'running' ? 'running' : 'paused')
  }
}

async function onGenerate() {
  expect(await screen.findByRole('heading', { level: 1, name: 'Generate' })).toBeInTheDocument()
  await screen.findByRole('group', { name: 'Anchor' })
}

/** Settings → Back → Home → its primary action → Generate, in the app. */
async function settingsToGenerate(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Back' }))
  await user.click(await screen.findByRole('button', { name: 'Generate workout' }))
  await onGenerate()
}

/** Generate → its Home action → Settings, in the app. */
async function generateToSettings(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Home' }))
  await user.click(await screen.findByRole('button', { name: 'Settings' }))
  await screen.findByRole('checkbox', { name: 'Visual effects' })
}

/** Focus, keyboard input, loading/busy and an error with its recovery, on `/generate`. */
async function exerciseFeedback(user: UserEvent, generation: FakeGenerationClient) {
  const anchor = within(screen.getByRole('group', { name: 'Anchor' })).getByRole('button', { name: /upper body/i })
  anchor.focus()
  expect(anchor).toHaveFocus()
  if (anchor.getAttribute('aria-pressed') !== 'true') await user.keyboard(' ')
  expect(anchor).toHaveAttribute('aria-pressed', 'true')

  const submit = screen.getByRole('button', { name: /generate workout/i })
  submit.focus()
  expect(submit).toHaveFocus()
  await user.keyboard('{Enter}')
  const calls = generation.calls.length
  expect(generation.outstanding).toBe(1)

  const status = within(screen.getByRole('main')).getByRole('status')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(GENERATION_LOADING_TITLE)
  expect(status).toHaveAttribute('aria-busy', 'true')

  await act(async () => {
    generation.fail(makeGenerationError({ requestId: `req_comfort_${calls}` }))
  })
  expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent(GENERATION_FAILED_LABEL)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(`req_comfort_${calls}`)
  expect(within(alert).getByRole('button', { name: 'Retry' })).toBeEnabled()

  const cancel = screen.getByRole('button', { name: 'Cancel' })
  cancel.focus()
  expect(cancel).toHaveFocus()
  await user.keyboard('{Enter}')
  await onGenerate()
}

let animations: ReturnType<typeof installAnimate>

beforeEach(() => {
  layOut()
  animations = installAnimate()
})

afterEach(() => {
  animations.restore()
  vi.restoreAllMocks()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// The journey.
// ---------------------------------------------------------------------------

describe('JOURNEY-004: Visual effects off in Settings, then the other screens', () => {
  it('restores each field clock at its own saved phase after an off/on unmount', async () => {
    installReducedMotion(false)
    const { user } = renderJourney('/settings')
    await screen.findByRole('checkbox', { name: 'Visual effects' })
    const before = animations.live()
    before.find(clock => clock.id === CRT_FIELD_ANIMATIONS.lines)!.currentTime = 1234
    before.find(clock => clock.id === CRT_FIELD_ANIMATIONS.grain)!.currentTime = 5678
    await user.click(visualEffects())
    expect(animations.live()).toHaveLength(0)
    await user.click(visualEffects())
    expect(animations.live().find(clock => clock.id === CRT_FIELD_ANIMATIONS.lines)!.currentTime).toBe(1234)
    expect(animations.live().find(clock => clock.id === CRT_FIELD_ANIMATIONS.grain)!.currentTime).toBe(5678)
    expectMotion('running')
  })
  it('shows no Echo, no CRT field and no old scans on Settings, Home and /generate; the blobs stay, still', async () => {
    const setReducedMotion = installReducedMotion(false)
    const { user, generation } = renderJourney('/settings')
    await screen.findByRole('checkbox', { name: 'Visual effects' })

    // Effects on: the baseline the journey returns to.
    expectFieldIdentity()
    expectEchoIdentity()
    expectMotion('running')
    expectBlobs()
    const ground = atmosphere()
    const blobNodes = blobs()
    expect(animations.live().map((clock) => clock.id).sort()).toEqual(
      [CRT_FIELD_ANIMATIONS.grain, CRT_FIELD_ANIMATIONS.lines].sort(),
    )

    await user.click(visualEffects())
    expect(visualEffects()).not.toBeChecked()
    expect(visualEffects()).toHaveFocus()
    expect(localStorage.getItem(KEY)).toBe('off')

    // Settings itself, at once.
    expect(host()).toHaveAttribute('data-effects', 'off')
    expectNoFieldNorOldScans()
    expect(echoSources()).toHaveLength(0)
    expectMotion('still')
    expect(atmosphere()).toBe(ground)
    expect(blobs()).toEqual(blobNodes)
    // The field's clocks were cancelled with it: nothing is left to schedule.
    expect(animations.live()).toHaveLength(0)

    // Home, on the way.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    const generateAction = await screen.findByRole('button', { name: 'Generate workout' })
    expectNoFieldNorOldScans()
    expect(echoSources()).toHaveLength(0)
    expectMotion('still')

    // /generate: the ordinary UI is all there and usable.
    await user.click(generateAction)
    await onGenerate()
    expectNoFieldNorOldScans()
    expect(echoSources()).toHaveLength(0)
    expect(document.querySelectorAll('.clr-echo__rear')).toHaveLength(0)
    expectMotion('still')
    expect(atmosphere()).toBe(ground)
    expectBlobs()
    expect(screen.getByRole('button', { name: /generate workout/i })).toBeVisible()
    expect(screen.getByRole('main').querySelector('.clr-card')).not.toBeNull()
    await exerciseFeedback(user, generation)

    // Off and reduced motion together: still the same, still usable.
    setReducedMotion(true)
    expectNoFieldNorOldScans()
    expect(echoSources()).toHaveLength(0)
    expectMotion('still')
    expectBlobs()
    await exerciseFeedback(user, generation)
    expect(animations.clocks).toHaveLength(2)
  })
})

describe('JOURNEY-004: Visual effects on again, without a reload', () => {
  it('restores the Echo, the field and the atmosphere motion with the same preset identities', async () => {
    installReducedMotion(false)
    localStorage.setItem(KEY, 'off')
    const { user, generation } = renderJourney('/generate')
    await onGenerate()
    expectNoFieldNorOldScans()
    expect(echoSources()).toHaveLength(0)
    const ground = atmosphere()
    const filter = document.querySelector(`filter#${PHOSPHOR_ECHO_FILTER_ID}`)

    await generateToSettings(user)
    expect(visualEffects()).not.toBeChecked()
    await user.click(visualEffects())
    expect(visualEffects()).toBeChecked()
    expect(localStorage.getItem(KEY)).toBe('on')

    // On Settings at once: the field, its clocks, the motion, the same ground.
    const restored = expectFieldIdentity()
    expect(restored).toHaveAttribute('data-motion', 'running')
    expectEchoIdentity()
    expectMotion('running')
    expect(atmosphere()).toBe(ground)
    expect(document.querySelector(`filter#${PHOSPHOR_ECHO_FILTER_ID}`)).toBe(filter)
    expect(animations.live().map((clock) => clock.id).sort()).toEqual(
      [CRT_FIELD_ANIMATIONS.grain, CRT_FIELD_ANIMATIONS.lines].sort(),
    )
    expect(document.querySelector('.clr-atmosphere__scan')).toBeNull()

    // /generate: the four outer owners echo again.
    await settingsToGenerate(user)
    expect(field()[0]).toBe(restored)
    expect(echoSources()).toHaveLength(4)
    for (const source of echoSources()) expect(source.closest('[aria-hidden="true"]')).not.toBeNull()
    expectEchoIdentity()
    expectMotion('running')
    await exerciseFeedback(user, generation)
  })

  it('falls back to effects on when the stored choice is unknown, and the app still renders', async () => {
    installReducedMotion(false)
    localStorage.setItem(KEY, 'sometimes')
    renderJourney('/generate')
    await onGenerate()

    expectFieldIdentity()
    expectMotion('running')
    expect(echoSources()).toHaveLength(4)
  })
})

describe('JOURNEY-004: OS reduced motion, live', () => {
  it('stops blobs, drift and grain together mid-session; the static glass and Echo stay; no atmosphere scan', async () => {
    const setReducedMotion = installReducedMotion(false)
    const { user, generation } = renderJourney('/generate')
    await onGenerate()
    const fieldNode = expectFieldIdentity()
    const ground = atmosphere()
    const echoes = [...echoSources()]
    expect(echoes).toHaveLength(4)
    const clocks = animations.live()
    expect(clocks).toHaveLength(2)

    setReducedMotion(true)
    expectMotion('still')
    // The same nodes: nothing remounted, nothing reloaded.
    expect(field()[0]).toBe(fieldNode)
    expect(atmosphere()).toBe(ground)
    expectBlobs()
    expect(document.querySelector('.clr-atmosphere__scan')).toBeNull()
    // Drift and grain both paused, in place — not cancelled and recreated.
    expect(animations.clocks).toHaveLength(2)
    for (const clock of clocks) expect(clock.playState, clock.id).toBe('paused')
    // The static Echo stays.
    expect([...echoSources()]).toEqual(echoes)
    expectEchoIdentity()
    expectFieldIdentity()
    await exerciseFeedback(user, generation)

    setReducedMotion(false)
    expectMotion('running')
    expect(animations.clocks).toHaveLength(2)
    for (const clock of clocks) {
      expect(clock.playState, clock.id).toBe('running')
      expect(clock.calls.at(-1)).toBe('play')
    }
    expect(field()[0]).toBe(fieldNode)
    await exerciseFeedback(user, generation)
  })

  it('starts still when reduced motion is already on, with the Echo and the static glass', async () => {
    installReducedMotion(true)
    renderJourney('/generate')
    await onGenerate()

    expectFieldIdentity()
    expectMotion('still')
    expectBlobs()
    expect(echoSources()).toHaveLength(4)
    for (const clock of animations.live()) expect(clock.playState, clock.id).toBe('paused')
    expect(document.querySelector('.clr-atmosphere__scan')).toBeNull()
  })
})

describe('JOURNEY-004: a hidden tab', () => {
  it('stops effect work while hidden and resumes the same clocks when shown again', async () => {
    installReducedMotion(false)
    const setVisibility = installVisibility()
    renderJourney('/generate')
    await onGenerate()
    const fieldNode = expectFieldIdentity()
    const clocks = animations.live()
    expect(clocks).toHaveLength(2)

    setVisibility('hidden')
    expectMotion('still')
    expect(field()[0]).toBe(fieldNode)
    for (const clock of clocks) expect(clock.playState, clock.id).toBe('paused')
    expect(echoSources()).toHaveLength(4)

    setVisibility('visible')
    expectMotion('running')
    expect(field()[0]).toBe(fieldNode)
    // The same two clocks played on — never recreated, so never restarted or
    // caught up — and no other clock was created.
    expect(animations.clocks).toHaveLength(2)
    for (const clock of clocks) {
      expect(clock.playState, clock.id).toBe('running')
      expect(clock.calls).not.toContain('cancel')
    }
  })

  it('a hidden tab with effects off stays off when shown', async () => {
    installReducedMotion(false)
    const setVisibility = installVisibility()
    localStorage.setItem(KEY, 'off')
    renderJourney('/generate')
    await onGenerate()

    setVisibility('hidden')
    setVisibility('visible')
    expectNoFieldNorOldScans()
    expect(echoSources()).toHaveLength(0)
    expectMotion('still')
    expect(animations.clocks).toHaveLength(0)
  })
})
