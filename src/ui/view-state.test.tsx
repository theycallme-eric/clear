/**
 * CORE-04 reference screen: one representative data-driven view rendered
 * through the shared four-state helpers, with every state of the contract
 * simulated. This is the demonstration named by the convention in
 * `docs/conventions/state-contract.md` — the first shipping data-driven
 * screen must follow this shape.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button, EmptyState } from '../design-system/index'
import { createError, ErrorCode } from '../state/errors'
import {
  SLOW_THRESHOLD_MS,
  viewEmpty,
  viewError,
  viewLoading,
  viewReady,
  type ViewState,
} from '../state/view-state'
import { renderWithProviders } from '../test/render'
import { Card } from './card'
import { ListMessage } from './composition'
import { SLOW_LOADING_LABEL, ViewStateSwitch } from './view-state'

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
