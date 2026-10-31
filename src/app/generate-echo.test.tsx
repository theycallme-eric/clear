/**
 * Effects TASK-004 (REQ-004) — Phosphor Echo applied through the app's shared
 * owners, on the real `/generate` and `/settings` route trees.
 *
 * What jsdom can say: which owners carry a rear source, that nested content
 * carries none, that every rear source is a decorative sibling *beneath* its
 * real component (so neither the echo nor the foundation bleed/glow filters
 * the other's subtree), that the one shared filter is referenced, and that
 * Visual effects off leaves no source at all. What it looks like — offset,
 * softness, masking and painted role colour per skin — is proven in the real
 * browser by `e2e/effects/echo-applied-fidelity.spec.ts`.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createError, ErrorCode, err, type Result } from '../state/errors'
import { historyQueryKey } from '../state/history-queries'
import { QueryClient } from '../state/query'
import type { Profile } from '../state/schemas'
import { SETTINGS_BACK_LABEL } from '../state/settings'
import { locationsQueryKey, profileQueryKey } from '../state/user-queries'
import { VisualEffectsProvider } from '../state/visual-effects'
import { createFakeConstraintsClient } from '../test/constraints-double'
import { createFakeGenerationClient } from '../test/generation-double'
import { renderApp, renderWithProviders, signedIn } from '../test/render'
import {
  createFakeUserDataClient,
  fixtureLocation,
  FIXTURE_USER_ID,
  onboardedProfile,
} from '../test/user-data-double'
import { AppDialog } from '../ui/app-dialog'
import { Card } from '../ui/card'
import { ActionRow, ListFrame, ListMessage, ListRow, MetricFrame, MetricGrid } from '../ui/composition'
import { PHOSPHOR_ECHO_FILTER_ID } from '../ui/phosphor-echo'
import { Button } from '../design-system/index'
import { Generate } from './Generate'

const KEY = 'clear.visual-effects'

const ECHO_CSS = readFileSync('src/ui/phosphor-echo.css', 'utf8')
const BINDING_CSS = readFileSync('src/ui/foreground-echo.css', 'utf8')

/** jsdom lays nothing out: give every element a box, and each wrapper the origin. */
function layOut() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const origin = this.classList.contains('clr-echo')
    return DOMRect.fromRect(
      origin ? { x: 0, y: 0, width: 0, height: 0 } : { x: 0, y: 0, width: 120, height: 48 },
    )
  })
}

function warmCache() {
  const cache = new QueryClient()
  cache.setData(profileQueryKey(FIXTURE_USER_ID), onboardedProfile({ goal_preset: 'strength' }))
  cache.setData(locationsQueryKey(FIXTURE_USER_ID), [fixtureLocation()])
  cache.setData(historyQueryKey(FIXTURE_USER_ID, 1), { sessions: [], hasMore: false })
  return cache
}

function renderGenerate(cache = warmCache()) {
  renderApp(
    ['/generate'],
    signedIn({ queryClient: cache, generation: createFakeGenerationClient() }),
  )
}

function renderSettings() {
  renderApp(
    ['/settings'],
    signedIn({
      queryClient: warmCache(),
      userData: createFakeUserDataClient(),
      constraints: createFakeConstraintsClient(),
    }),
  )
}

const main = () => screen.getByRole('main')
const sources = () => [...document.querySelectorAll<Element>('.clr-echo__source')]
const frameWrappers = () => [...main().querySelectorAll<HTMLElement>('[data-echo="frame"]')]

/** The echo wrapper a real element is the outer owner of, or null. */
function echoOf(element: Element): HTMLElement | null {
  const wrapper = element.closest<HTMLElement>('[data-echo="frame"]')
  return wrapper
}

/** The rear source drawn for a framed owner: the wrapper's first child, under it. */
function rearOf(wrapper: HTMLElement) {
  const rear = wrapper.firstElementChild
  expect(rear).toHaveClass('clr-echo__rear')
  expect(rear).toHaveAttribute('aria-hidden', 'true')
  return rear as SVGSVGElement
}

const headingEcho = () =>
  screen.getByRole('heading', { level: 1, name: 'Generate' }).querySelector('[data-echo="text"]')

const backAction = () => screen.getByRole('button', { name: 'Home' })
const cta = () => screen.getByRole('button', { name: /generate workout/i })
const formCard = () => main().querySelector<HTMLElement>('.clr-card')!

beforeEach(layOut)

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('/generate with Visual effects on: the four outer owners echo', () => {
  it('gives the heading, the back frame, the form card and the CTA one rear source each', async () => {
    renderGenerate()
    await screen.findByRole('group', { name: 'Anchor' })

    // The heading: one aria-hidden duplicate behind the real text, which keeps the name.
    const heading = headingEcho()
    expect(heading).not.toBeNull()
    expect(heading!.querySelectorAll('.clr-echo__source')).toHaveLength(1)
    expect(heading!.querySelector('.clr-echo__source')).toHaveAttribute('aria-hidden', 'true')

    // The framed back action, the form card and the CTA: one filled silhouette each.
    const owners = [backAction(), formCard(), cta()]
    for (const owner of owners) {
      const wrapper = echoOf(owner)
      expect(wrapper, `${owner.className} is not an echo owner`).not.toBeNull()
      const rear = rearOf(wrapper!)
      const path = rear.querySelector('path.clr-echo__source')
      expect(path).toHaveAttribute('fill', 'currentColor')
      expect(path?.getAttribute('d')).toMatch(/^M0 0H120V\d+(\.\d+)?L/)
    }

    // Exactly those four in the document, and three distinct frame owners.
    expect(new Set(owners.map(echoOf)).size).toBe(3)
    expect(frameWrappers().filter((wrapper) => wrapper.querySelector('.clr-echo__rear'))).toHaveLength(3)
    expect(sources()).toHaveLength(4)
  })

  it('uses the one shared filter: one definition, referenced by every rear source', async () => {
    renderGenerate()
    await screen.findByRole('group', { name: 'Anchor' })

    expect(document.querySelectorAll(`filter#${PHOSPHOR_ECHO_FILTER_ID}`)).toHaveLength(1)
    expect(ECHO_CSS).toMatch(
      new RegExp(`\\.clr-echo__source\\s*\\{[^}]*filter:\\s*url\\(#${PHOSPHOR_ECHO_FILTER_ID}\\)`),
    )
    // No owner carries a filter or style of its own for the echo.
    for (const source of sources()) expect(source.getAttribute('style') ?? '').not.toMatch(/filter/)
  })
})

describe('nested content, the back arrow and the CTA label have no echo of their own', () => {
  it('excludes every card control, label and field, and the glyph and label inside a frame', async () => {
    renderGenerate()
    const anchors = await screen.findByRole('group', { name: 'Anchor' })

    const card = formCard()
    // Nothing inside the card is an owner: no wrapper, no rear source.
    expect(card.querySelector('.clr-echo, .clr-echo__source, [data-echo]')).toBeNull()
    for (const chip of within(anchors).getAllByRole('button')) {
      expect(echoOf(chip)).toBe(echoOf(card))
    }
    const fields = [...card.querySelectorAll('input, textarea, select, label')]
    expect(fields.length).toBeGreaterThan(3)
    for (const field of fields) expect(echoOf(field)).toBe(echoOf(card))

    // The back arrow and the CTA label sit inside their frame; no rear source draws them.
    const back = backAction()
    expect(back.querySelector('svg')).not.toBeNull()
    expect(back.querySelector('.clr-echo__source')).toBeNull()
    expect(rearOf(echoOf(back)!).querySelector('svg svg, text')).toBeNull()
    expect(cta().querySelector('.clr-echo__source')).toBeNull()
    expect(rearOf(echoOf(cta())!).textContent).toBe('')

    // The only duplicate is the heading's, drawn and hidden: its text is said once.
    expect(screen.getAllByRole('button', { name: /generate workout/i })).toHaveLength(1)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('Generate')
    expect(h1.querySelector('.clr-echo__source')).toHaveAttribute('data-echo-text', 'Generate')
  })

  it('never filters a subtree twice: no rear source holds another, or any real component', async () => {
    renderGenerate()
    await screen.findByRole('group', { name: 'Anchor' })

    for (const source of sources()) {
      expect(source.querySelector('.clr-echo__source')).toBeNull()
      expect(source.querySelector('button, input, textarea, select, .clr-chamfer, .clr-bleed')).toBeNull()
      expect(source.closest('.clr-bleed, .clr-glow, .clr-chamfer')).toBeNull()
    }
    for (const wrapper of frameWrappers()) {
      expect(wrapper.parentElement?.closest('[data-echo]')).toBeNull()
    }
  })
})

describe('the chosen bleed/glow composition: emission kept, echo beneath it as a sibling', () => {
  it('leaves the CTA glow and the card bleed as shipped, outside the rear source', async () => {
    renderGenerate()
    await screen.findByRole('group', { name: 'Anchor' })

    const ctaWrapper = echoOf(cta())!
    const glow = cta().parentElement!
    expect(glow).toHaveClass('clr-bleed', 'clr-glow')
    expect(glow.parentElement).toBe(ctaWrapper)
    expect(ctaWrapper.children[0]).toBe(rearOf(ctaWrapper))
    expect(ctaWrapper.children[1]).toBe(glow)

    const cardWrapper = echoOf(formCard())!
    const bleed = cardWrapper.querySelector(':scope > .clr-bleed')
    expect(bleed).not.toBeNull()
    expect(bleed).not.toHaveClass('clr-glow')
    expect(cardWrapper.children[0]).toBe(rearOf(cardWrapper))
  })
})

describe('states stay readable and the effect stays outside them', () => {
  it('keeps the disabled CTA echoed and its disabled state intact', async () => {
    renderGenerate()
    await screen.findByRole('group', { name: 'Anchor' })

    expect(cta()).toBeDisabled()
    expect(rearOf(echoOf(cta())!)).toBeInTheDocument()
  })

  it('keeps the chosen chip selected, and the CTA enabled, with no echo on the chip', async () => {
    renderGenerate()
    const user = userEvent.setup()
    const anchors = await screen.findByRole('group', { name: 'Anchor' })

    const [first] = within(anchors).getAllByRole('button')
    await user.click(first!)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(first!.closest('[data-echo]')).toBe(echoOf(formCard()))
    expect(cta()).toBeEnabled()
  })

  it('keeps the CTA action row order: the primary is the row’s first cell when stacked', () => {
    expect(BINDING_CSS).toMatch(
      /\.clr-actions > \.clr-echo:has\(> \.clr-bleed > :is\(\.clr-btn--primary, \.clr-btn--critical\)\)\s*\{\s*order:\s*-1/,
    )
    expect(BINDING_CSS).toMatch(/\.clr-actions > \.clr-echo > \.clr-bleed > \.clr-btn\s*\{\s*width:\s*100%/)
  })

  // The route guard reads the profile too, so Generate's own read states are
  // mounted directly, under the same root effects policy.
  function renderGenerateRead(profile: () => Promise<Result<Profile | null>>) {
    renderWithProviders(
      <VisualEffectsProvider>
        <Generate />
      </VisualEffectsProvider>,
      {
        route: '/generate',
        ...signedIn({
          queryClient: new QueryClient(),
          userData: createFakeUserDataClient({ profile }),
        }),
      },
    )
  }

  it('shows the loading state with the heading and back frame echoed and the status readable', async () => {
    renderGenerateRead(() => new Promise(() => {}))

    expect(await screen.findByText(/reading your profile/i)).toBeInTheDocument()
    expect(headingEcho()).not.toBeNull()
    expect(rearOf(echoOf(backAction())!)).toBeInTheDocument()

    // The standalone ScanLoader is its own card on the background: one echo,
    // nothing inside it echoed again.
    const status = main().querySelector<HTMLElement>('[role="status"]')!
    expect(status).toHaveAttribute('aria-busy', 'true')
    const loader = status.closest('.clr-scan')!
    expect(rearOf(echoOf(loader)!)).toBeInTheDocument()
    expect(loader.querySelector('[data-echo], .clr-echo__source')).toBeNull()
  })

  it('shows the error state with its Retry CTA echoed and the message readable', async () => {
    renderGenerateRead(() => Promise.resolve(err(createError(ErrorCode.PERSISTENCE_READ_FAILED))))

    const retry = await screen.findByRole('button', { name: 'Retry' })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/your profile didn’t load/i)
    expect(rearOf(echoOf(retry)!)).toBeInTheDocument()

    // The failure card and its action are two outer owners, one echo each.
    const failure = within(alert).getByText(/your profile didn’t load/i).closest<HTMLElement>('.clr-chamfer')!
    expect(rearOf(echoOf(failure)!)).toBeInTheDocument()
    expect(echoOf(failure)).not.toBe(echoOf(retry))
    expect(failure.querySelector('[data-echo], .clr-echo__source')).toBeNull()
  })

  it('shows the no-places empty state as one echoed card above the Add a place action', async () => {
    const cache = warmCache()
    cache.setData(locationsQueryKey(FIXTURE_USER_ID), [])
    renderGenerate(cache)

    const empty = (await screen.findByText('No places yet')).closest<HTMLElement>('.clr-chamfer')!
    expect(rearOf(echoOf(empty)!)).toBeInTheDocument()
    expect(empty.querySelector('[data-echo], .clr-echo__source')).toBeNull()
  })
})

describe('Visual effects off: every rear source is gone, the components are untouched', () => {
  it('renders no rear source and the same real owners', async () => {
    localStorage.setItem(KEY, 'off')
    renderGenerate()
    await screen.findByRole('group', { name: 'Anchor' })

    expect(sources()).toHaveLength(0)
    expect(document.querySelectorAll('.clr-echo__rear')).toHaveLength(0)
    expect(cta()).toBeInTheDocument()
    expect(backAction()).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Generate' })).toBeInTheDocument()
  })
})

describe('the same rule on /settings: every outer owner, and nothing nested', () => {
  it('echoes the heading, the back frame and each outer card, never a card’s contents', async () => {
    renderSettings()
    await screen.findByRole('heading', { level: 2, name: 'Appearance' })

    expect(
      screen.getByRole('heading', { level: 1 }).querySelector('[data-echo="text"] .clr-echo__source'),
    ).not.toBeNull()
    expect(rearOf(echoOf(screen.getByRole('button', { name: SETTINGS_BACK_LABEL }))!)).toBeInTheDocument()

    const cards = [...main().querySelectorAll<HTMLElement>('.clr-card')]
    expect(cards.length).toBeGreaterThan(1)
    for (const card of cards) {
      const wrapper = echoOf(card)
      expect(wrapper, 'an outer card has no echo').not.toBeNull()
      expect(rearOf(wrapper!)).toBeInTheDocument()
      expect(card.querySelector('[data-echo], .clr-echo__source')).toBeNull()
    }

    const box = screen.getByRole('checkbox', { name: 'Visual effects' })
    expect(box.closest('.clr-card')).not.toBeNull()
    expect(echoOf(box)).toBe(echoOf(box.closest('.clr-card')!))
  })
})

describe('the shared frame owners on any screen: outer frame echoes, a card’s copy does not', () => {
  function Frames() {
    return (
      <>
        <ListFrame aria-label="Standalone list">
          <ListRow>Row</ListRow>
        </ListFrame>
        <MetricGrid>
          <MetricFrame aria-label="Standalone metric">12</MetricFrame>
        </MetricGrid>
        <ListMessage title="Nothing logged" />
      </>
    )
  }

  it('echoes a standalone list frame, metric frame and empty message once each', () => {
    render(
      <VisualEffectsProvider>
        <Frames />
      </VisualEffectsProvider>,
    )

    const owners = [
      screen.getByLabelText('Standalone list'),
      screen.getByLabelText('Standalone metric'),
      screen.getByText('Nothing logged').closest<HTMLElement>('.clr-chamfer')!,
    ]
    for (const owner of owners) {
      expect(owner).toHaveClass('clr-chamfer')
      expect(rearOf(echoOf(owner)!)).toBeInTheDocument()
      expect(owner.querySelector('[data-echo], .clr-echo__source')).toBeNull()
    }
    expect(new Set(owners.map(echoOf)).size).toBe(owners.length)
  })

  it('gives the same owners inside a card no echo: only the card has one', () => {
    render(
      <VisualEffectsProvider>
        <Card heading="Week">
          <Frames />
        </Card>
      </VisualEffectsProvider>,
    )

    const card = document.querySelector<HTMLElement>('.clr-card')!
    expect(rearOf(echoOf(card)!)).toBeInTheDocument()
    expect(document.querySelectorAll('[data-echo]')).toHaveLength(1)
    expect(screen.getByLabelText('Standalone list')).not.toHaveClass('clr-chamfer')
    expect(screen.getByLabelText('Standalone metric')).not.toHaveClass('clr-chamfer')
  })
})

describe('a dialog is not the background', () => {
  it('gives a card and an action row inside a dialog no echo, while the screen row keeps one', () => {
    render(
      <VisualEffectsProvider>
        <ActionRow>
          <Button variant="primary">Outside</Button>
        </ActionRow>
        <AppDialog open title="Train hard today?" onClose={() => {}}>
          <Card heading="Inside">
            <p>Body</p>
          </Card>
          <ActionRow>
            <Button variant="primary">Inside action</Button>
          </ActionRow>
        </AppDialog>
      </VisualEffectsProvider>,
    )

    const dialog = document.querySelector('dialog')!
    expect(dialog.querySelector('[data-echo], .clr-echo__source')).toBeNull()
    expect(screen.getByRole('button', { name: 'Outside', hidden: true }).closest('[data-echo]')).not.toBeNull()
  })

  it('draws nothing extra for a Card or an ActionRow rendered outside the app root', () => {
    render(
      <>
        <Card heading="Alone">
          <p>Body</p>
        </Card>
        <ActionRow>
          <Button>Alone</Button>
        </ActionRow>
      </>,
    )
    expect(document.querySelector('[data-echo]')).toBeNull()
  })
})
