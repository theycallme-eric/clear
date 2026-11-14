/**
 * CORE-04 reference screen: one representative data-driven view rendered
 * through the shared four-state helpers, with every state of the contract
 * simulated. This is the demonstration named by the convention in
 * `docs/conventions/state-contract.md` — the first shipping data-driven
 * screen must follow this shape.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button, EmptyState } from '../design-system/index'
import { GalleryRefinements } from '../dev/gallery-refinements'
import { createError, err, ErrorCode, ok } from '../state/errors'
import { QueryClient } from '../state/query'
import {
  SLOW_THRESHOLD_MS,
  viewEmpty,
  viewError,
  viewLoading,
  viewReady,
  type ViewState,
} from '../state/view-state'
import { renderApp, renderWithProviders, signedIn } from '../test/render'
import { createFakeUserDataClient, onboardedProfile } from '../test/user-data-double'
import { Card } from './card'
import { ListMessage } from './composition'
import { ErrorView, SLOW_LOADING_LABEL, ViewStateSwitch } from './view-state'

function ReferenceHistoryScreen({
  state,
  onRetry,
  onGenerate,
}: {
  state: ViewState<string[]>
  onRetry?: () => void
  onGenerate?: () => void
}) {
  return (
    <section aria-label="History">
      <ViewStateSwitch
        state={state}
        loadingLabel="Reading history"
        empty={
          <>
            <EmptyState
              title="No sessions logged"
              message="Completed workouts appear here."
            />
            {onGenerate && <Button onClick={onGenerate}>Generate workout</Button>}
          </>
        }
        errorTitle="History didn't load"
        onRetry={onRetry}
      >
        {(sessions) => (
          <ul>
            {sessions.map((session) => (
              <li key={session}>{session}</li>
            ))}
          </ul>
        )}
      </ViewStateSwitch>
    </section>
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('reference screen: loading', () => {
  it('shows a polite busy status region, not a blank and not the empty copy', () => {
    renderWithProviders(<ReferenceHistoryScreen state={viewLoading()} />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Reading history')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('No sessions logged')).not.toBeInTheDocument()
  })

  it('admits it is slow after the threshold instead of appearing frozen', () => {
    vi.useFakeTimers()
    renderWithProviders(<ReferenceHistoryScreen state={viewLoading()} />)

    expect(screen.getByRole('status')).toHaveTextContent('Reading history')

    act(() => {
      vi.advanceTimersByTime(SLOW_THRESHOLD_MS)
    })

    expect(screen.getByRole('status')).toHaveTextContent(SLOW_LOADING_LABEL)
  })
})

describe('reference screen: empty', () => {
  it('is a distinct screen: factual copy and one action, no busy region, no alert', async () => {
    const onGenerate = vi.fn()
    renderWithProviders(
      <ReferenceHistoryScreen state={viewEmpty()} onGenerate={onGenerate} />,
    )

    expect(screen.getByText('No sessions logged')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Generate workout' }),
    )
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })
})

describe('reference screen: error', () => {
  const error = createError(ErrorCode.PERSISTENCE_READ_FAILED, {
    requestId: 'req_test_abc123',
  })

  it('renders the AppError as an alert: plain message, requestId, what failed', () => {
    renderWithProviders(
      <ReferenceHistoryScreen state={viewError(error)} onRetry={() => {}} />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("History didn't load")
    expect(alert).toHaveTextContent('Could not load. Try again.')
    expect(alert).toHaveTextContent('req_test_abc123')

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('No sessions logged')).not.toBeInTheDocument()
  })

  it('the retry action re-runs the failed operation', async () => {
    const onRetry = vi.fn()
    renderWithProviders(
      <ReferenceHistoryScreen state={viewError(error)} onRetry={onRetry} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('reference screen: populated', () => {
  it('renders the data and none of the other three states', () => {
    renderWithProviders(
      <ReferenceHistoryScreen state={viewReady(['Monday EMOM', 'Friday AMRAP'])} />,
    )

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('Monday EMOM')).toBeInTheDocument()
    expect(screen.getByText('Friday AMRAP')).toBeInTheDocument()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('No sessions logged')).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Containment and loop coordination (0.14.3)
// ─────────────────────────────────────────────────────────────────────────────

function reduceMotion(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduced && query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

/** A section the way a route composes one: the card owns the heading. */
function SectionCard({
  heading,
  state,
  loadingLabel,
  onRetry,
}: {
  heading: string
  state: ViewState<string[]>
  loadingLabel: string
  onRetry?: () => void
}) {
  return (
    <Card heading={heading}>
      <ViewStateSwitch
        state={state}
        loadingLabel={loadingLabel}
        empty={<ListMessage title="No sessions logged" message="Completed workouts appear here." />}
        errorTitle={`${heading} didn't load`}
        onRetry={onRetry}
      >
        {(rows) => <p>{rows.join(', ')}</p>}
      </ViewStateSwitch>
    </Card>
  )
}

const cards = () => document.querySelectorAll('.clr-card')
const nestedCards = () => document.querySelectorAll('.clr-card .clr-card')

describe('containment: a state never puts a card inside a card', () => {
  const error = createError(ErrorCode.PERSISTENCE_READ_FAILED, {
    requestId: 'req_test_abc123',
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('standalone, each state is the one self-framed card and nothing wraps it', () => {
    const states: ViewState<string[]>[] = [viewLoading(), viewEmpty(), viewError(error)]
    for (const state of states) {
      const { unmount } = renderWithProviders(<ReferenceHistoryScreen state={state} />)
      expect(cards()).toHaveLength(1)
      expect(nestedCards()).toHaveLength(0)
      unmount()
    }
  })

  it('loading inside a card keeps the heading and adds the scan and one cursor line', () => {
    renderWithProviders(
      <SectionCard heading="Recent sessions" state={viewLoading()} loadingLabel="Reading history" />,
    )

    expect(cards()).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Recent sessions' })).toBeInTheDocument()

    const status = screen.getByRole('status')
    expect(status.closest('.clr-card')).toBe(cards()[0])
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveClass('clr-scan')
    expect(status.querySelectorAll(':scope > .clr-scan-band')).toHaveLength(1)

    const lines = status.querySelectorAll('.clr-cursor')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveTextContent('Reading history')
    // One line, not a placeholder for the rows that are coming.
    expect(status.querySelectorAll('p')).toHaveLength(1)
    expect(document.querySelector('[class*="skeleton"]')).toBeNull()
  })

  it('a slow section inside a card says so on the same line and stays busy', () => {
    vi.useFakeTimers()
    renderWithProviders(
      <SectionCard heading="Recent sessions" state={viewLoading()} loadingLabel="Reading history" />,
    )

    act(() => {
      vi.advanceTimersByTime(SLOW_THRESHOLD_MS)
    })

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status.querySelector('.clr-cursor')).toHaveTextContent(SLOW_LOADING_LABEL)
    expect(screen.getByRole('heading', { name: 'Recent sessions' })).toBeInTheDocument()
  })

  it('a failure inside a card keeps its glyph, message, request id and action', async () => {
    const onRetry = vi.fn()
    renderWithProviders(
      <SectionCard
        heading="Recent sessions"
        state={viewError(error)}
        loadingLabel="Reading history"
        onRetry={onRetry}
      />,
    )

    expect(cards()).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Recent sessions' })).toBeInTheDocument()

    const alert = screen.getByRole('alert')
    expect(alert.closest('.clr-card')).toBe(cards()[0])
    expect(alert).toHaveTextContent("Recent sessions didn't load")
    expect(alert).toHaveTextContent('Could not load. Try again.')
    expect(alert).toHaveTextContent('req_test_abc123')
    expect(alert.querySelector('svg')).not.toBeNull()
    // Nothing here claims to be working, or to have worked.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('a failure glitches once, standalone and inside a card', () => {
    const standalone = renderWithProviders(<ReferenceHistoryScreen state={viewError(error)} />)
    expect(screen.getByRole('alert')).toHaveClass('clr-glitch')
    expect(screen.getByRole('alert')).not.toHaveClass('clr-glitch--loop')
    standalone.unmount()

    renderWithProviders(
      <SectionCard heading="Recent sessions" state={viewError(error)} loadingLabel="Reading history" />,
    )
    expect(screen.getByRole('alert')).toHaveClass('clr-glitch')
    expect(document.querySelector('.clr-glitch--loop')).toBeNull()
  })

  it('an error without a retry offers no action rather than a dead one', () => {
    renderWithProviders(
      <SectionCard heading="Recent sessions" state={viewError(error)} loadingLabel="Reading history" />,
    )
    expect(within(screen.getByRole('alert')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('emptiness inside a card is that card’s copy, not a second card', () => {
    renderWithProviders(
      <SectionCard heading="Recent sessions" state={viewEmpty()} loadingLabel="Reading history" />,
    )

    expect(cards()).toHaveLength(1)
    expect(screen.getByText('No sessions logged').closest('.clr-card')).toBe(cards()[0])
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('one interface loop across concurrently loading sections', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function Sections({ first, second }: { first: ViewState<string[]>; second: ViewState<string[]> }) {
    return (
      <>
        <SectionCard heading="Recent sessions" state={first} loadingLabel="Reading history" />
        <SectionCard heading="Favorites" state={second} loadingLabel="Reading favorites" />
        <ViewStateSwitch state={viewLoading()} loadingLabel="Reading profile" empty={null}>
          {() => null}
        </ViewStateSwitch>
      </>
    )
  }

  const loops = () => screen.getAllByRole('status').map((region) => region.getAttribute('data-loop'))

  it('runs the first and stills the rest, every one still busy under its own label', () => {
    reduceMotion(false)
    renderWithProviders(<Sections first={viewLoading()} second={viewLoading()} />)

    const regions = screen.getAllByRole('status')
    expect(regions).toHaveLength(3)
    expect(loops()).toEqual(['run', 'still', 'still'])
    for (const region of regions) expect(region).toHaveAttribute('aria-busy', 'true')
    expect(regions[0]).toHaveTextContent('Reading history')
    expect(regions[1]).toHaveTextContent('Reading favorites')
    expect(regions[2]).toHaveTextContent('Reading profile')
    // Stilled is static, not removed: the band and the cursor are still there.
    expect(regions[1].querySelector('.clr-scan-band')).not.toBeNull()
    expect(regions[1].querySelector('.clr-cursor')).not.toBeNull()
    expect(regions[2].querySelector('.clr-scan-band')).not.toBeNull()
  })

  it('hands the loop to the next section when the first arrives', () => {
    reduceMotion(false)
    const { rerender } = renderWithProviders(
      <Sections first={viewLoading()} second={viewLoading()} />,
    )

    rerender(<Sections first={viewReady(['Monday EMOM'])} second={viewLoading()} />)

    expect(screen.getByText('Monday EMOM')).toBeInTheDocument()
    expect(loops()).toEqual(['run', 'still'])
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Reading favorites')
  })

  it('a section that fails gives the loop up and does not stay busy', () => {
    reduceMotion(false)
    const { rerender } = renderWithProviders(
      <Sections first={viewLoading()} second={viewLoading()} />,
    )

    rerender(
      <Sections
        first={viewError(createError(ErrorCode.PERSISTENCE_READ_FAILED))}
        second={viewLoading()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent("Recent sessions didn't load")
    expect(screen.getByRole('alert')).not.toHaveAttribute('aria-busy')
    expect(loops()).toEqual(['run', 'still'])
  })

  it('is static everywhere under reduced motion and still truthfully busy', () => {
    reduceMotion(true)
    renderWithProviders(<Sections first={viewLoading()} second={viewLoading()} />)

    const regions = screen.getAllByRole('status')
    expect(loops()).toEqual(['still', 'still', 'still'])
    for (const region of regions) expect(region).toHaveAttribute('aria-busy', 'true')
    expect(regions[0]).toHaveTextContent('Reading history')
    expect(regions[1]).toHaveTextContent('Reading favorites')
  })

  it('the stilled treatment covers the scan band and the cursor', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app-motion.css'), 'utf8')
    const rule = /\n(\[data-loop='still'\][^{]*)\{([^}]*)\}/.exec(css)

    expect(rule?.[1]).toContain("[data-loop='still'] .clr-scan-band")
    expect(rule?.[1]).toContain("[data-loop='still'] .clr-cursor::after")
    expect(rule?.[2]).toContain('animation: none')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-028 (REQ-028; C55, G23; R22): the released semantic error treatment is
// a regression invariant. PR611's correction (pilot c0d5782 / 55843bd) is
// retained in the one shared ErrorView, not reimplemented: the alert root
// scopes both existing border hooks to the error role, so the frame, the
// accent bar and the emission it holds read one role in every skin, and the
// glyph paints the error icon role. Colours per skin are read in the browser
// (e2e/refinement/task-028.spec.ts); here, the DOM contract that produces them.
// ─────────────────────────────────────────────────────────────────────────────

const ERROR_ROLE = 'var(--border-toast-negative)'
const ERROR_SURFACE = 'var(--surface-toast-negative)'
const ERROR_ICON = 'var(--icon-toast-negative)'
/** The AlertTriangle outline in the 0.14.3 icon set. */
const ALERT_TRIANGLE = 'M12 2.5L23 21.5H1L12 2.5Z'

function errorGlyphHost(alert: HTMLElement) {
  const glyph = [...alert.querySelectorAll('svg path')].find((path) =>
    path.getAttribute('d')?.startsWith(ALERT_TRIANGLE))
  return glyph?.closest('svg')?.parentElement ?? null
}

function walk(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path, keep)
    return keep(path) ? [path] : []
  })
}

describe('TASK-028 released error role (C55, R22)', () => {
  const timeout = createError(ErrorCode.NETWORK_TIMEOUT, { requestId: 'req_task_028' })

  it('AC-C55-01 a standalone error scopes both border hooks to the error role at its root, so its frame, accent bar and emission share one role, and the glyph paints the error icon role', async () => {
    const onRetry = vi.fn()
    renderWithProviders(<ErrorView error={timeout} title="That session didn’t load" onRetry={onRetry} />)

    const alert = screen.getByRole('alert')
    // The root: both existing hooks, never a repainted recipe.
    expect(alert.style.getPropertyValue('--border-card')).toBe(ERROR_ROLE)
    expect(alert.style.getPropertyValue('--brd')).toBe(ERROR_ROLE)
    // The frame body keeps the released error surface and border.
    const card = alert.querySelector<HTMLElement>('.clr-card')!
    expect(card).not.toBeNull()
    const framed = [card, ...card.querySelectorAll<HTMLElement>('*')]
      .find((element) => element.style.getPropertyValue('--surface') !== '')!
    expect(framed.style.getPropertyValue('--surface')).toBe(ERROR_SURFACE)
    expect(framed.style.getPropertyValue('--brd')).toBe(ERROR_ROLE)
    // Bar and emission are siblings of the body, inside the scoped root.
    for (const part of ['.clr-card__body', '.clr-card__bar', '.clr-bleed']) {
      expect(alert.querySelector(part), part).not.toBeNull()
      expect(alert.querySelector(part)!.closest('[role="alert"]')).toBe(alert)
    }
    // Severity carries a glyph in the error icon role, not colour alone.
    expect(errorGlyphHost(alert)?.style.color).toBe(ERROR_ICON)
    expect(alert).toHaveTextContent('That session didn’t load')
    expect(alert).toHaveTextContent(timeout.message)
    expect(alert).toHaveTextContent('req_task_028')
    expect(alert).toHaveClass('clr-glitch')

    // The one recovery action re-runs the failed operation, once per press.
    const retry = within(alert).getByRole('button', { name: 'Retry' })
    expect(retry).toHaveClass('clr-btn')
    expect(retry.className).not.toMatch(/clr-btn--(?:primary|quiet|critical)/)
    await userEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('AC-C55-01 an error inside a card is that card’s content: the root keeps the error hooks, the glyph keeps the error icon role and no second frame, bar or emission is drawn', () => {
    renderWithProviders(
      <Card heading="Recent sessions">
        <ErrorView error={timeout} title="Recent sessions didn’t load" onRetry={() => undefined} />
      </Card>,
    )

    const alert = screen.getByRole('alert')
    expect(alert.closest('.clr-card')).toBe(cards()[0])
    expect(alert.style.getPropertyValue('--border-card')).toBe(ERROR_ROLE)
    expect(alert.style.getPropertyValue('--brd')).toBe(ERROR_ROLE)
    expect(alert.querySelectorAll('.clr-card, .clr-card__bar, .clr-card__body')).toHaveLength(0)
    expect(errorGlyphHost(alert)?.style.color).toBe(ERROR_ICON)
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('AC-C55-01 a real route’s account-load error renders the shared error owner with its role, and Try again re-reads the account into the route', async () => {
    const user = userEvent.setup()
    let reads = 0
    const userData = createFakeUserDataClient({
      profile: async () => {
        reads += 1
        return reads === 1
          ? err(createError(ErrorCode.NETWORK_OFFLINE, { requestId: 'req_task_028_guard' }))
          : ok(onboardedProfile())
      },
    })
    renderApp(['/'], signedIn({ userData, queryClient: new QueryClient() }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your account didn’t load')
    expect(alert).toHaveTextContent(createError(ErrorCode.NETWORK_OFFLINE).message)
    expect(alert.style.getPropertyValue('--border-card')).toBe(ERROR_ROLE)
    expect(alert.style.getPropertyValue('--brd')).toBe(ERROR_ROLE)
    expect(errorGlyphHost(alert)?.style.color).toBe(ERROR_ICON)

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(reads).toBe(2)
  }, 20_000)

  it('AC-C55-01 the accepted gallery state ?state=errors draws the shared error owner: a network timeout with the error role and its Retry', () => {
    render(
      <MemoryRouter initialEntries={['/gallery/refinements?state=errors']}>
        <GalleryRefinements />
      </MemoryRouter>,
    )
    const state = document.querySelector<HTMLElement>('[data-refinement-state="errors"]')!
    expect(state).not.toBeNull()
    expect(within(state).getByRole('heading', { name: 'Released error semantics' })).toBeInTheDocument()

    const alert = within(state).getByRole('alert')
    expect(alert).toHaveTextContent('Request failed')
    expect(alert).toHaveTextContent(createError(ErrorCode.NETWORK_TIMEOUT).message)
    expect(alert.style.getPropertyValue('--border-card')).toBe(ERROR_ROLE)
    expect(alert.style.getPropertyValue('--brd')).toBe(ERROR_ROLE)
    expect(errorGlyphHost(alert)?.style.color).toBe(ERROR_ICON)
    expect(within(alert).getAllByRole('button').map((button) => button.textContent)).toEqual(['Retry'])
  })

  it('AC-R028-01 error owner retained: PR611’s correction stays in the one shared ErrorView, no second error owner or stylesheet restates the role, and the pilot’s regression proof is in place', () => {
    const root = process.cwd()
    const owner = readFileSync(resolve(root, 'src/ui/view-state.tsx'), 'utf8')
    const errorView = owner.slice(owner.indexOf('export function ErrorView'), owner.indexOf('// The switch'))
    expect(errorView).toMatch(/'--border-card': 'var\(--border-toast-negative\)'/)
    expect(errorView).toMatch(/'--brd': 'var\(--border-toast-negative\)'/)
    expect(errorView).toMatch(/'--surface': 'var\(--surface-toast-negative\)'/)
    expect(errorView).toMatch(/color: 'var\(--icon-toast-negative\)'/)

    // One owner: no duplicate ErrorView pilot anywhere in the app source.
    const sources = walk(resolve(root, 'src'), (path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    const owners = sources.filter((path) => /export function ErrorView\b/.test(readFileSync(path, 'utf8')))
    expect(owners.map((path) => relative(root, path))).toEqual([join('src', 'ui', 'view-state.tsx')])

    // No route or refinement stylesheet repaints the error role.
    const sheets = walk(resolve(root, 'src'), (path) => path.endsWith('.css')
      && !path.startsWith(resolve(root, 'src/design-system')))
    const restated = sheets.filter((path) =>
      /--(?:border|surface|icon)-toast-negative/.test(readFileSync(path, 'utf8')))
    expect(restated.map((path) => relative(root, path))).toEqual([])

    // The completed pilot's regression proof is retained, not restarted.
    const pilot = readFileSync(resolve(root, 'e2e/library-error-role.spec.ts'), 'utf8')
    expect(pilot).toContain('error-role-consistency')
    expect(pilot).toContain("const OWNER = 'src/ui/view-state.tsx'")
  })
})
