/**
 * CORE-04 reference screen: one representative data-driven view rendered
 * through the shared four-state helpers, with every state of the contract
 * simulated. This is the demonstration named by the convention in
 * `docs/conventions/state-contract.md` — the first shipping data-driven
 * screen must follow this shape.
 */
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmptyState } from '../design-system/index'
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
          <EmptyState
            title="No sessions logged"
            message="Completed workouts appear here."
            actionLabel="Generate workout"
            onAction={onGenerate}
          />
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
