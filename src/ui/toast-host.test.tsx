/**
 * DS-05 acceptance, host half: one root host renders at most one toast and
 * queues later messages; removal waits for `.clr-phosphor-out` when the
 * animation runs and never waits when it cannot; dismissal is a keyboard
 * reachable button that steals no focus; only `negative` announces
 * assertively (`role="alert"`) — a success stays a polite `status`.
 */
import { act, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createError, ErrorCode } from '../state/errors'
import { createToastQueue, errorToast, type ToastQueue } from '../state/toasts'
import { renderWithProviders } from '../test/render'
import { ToastHost } from './toast-host'

afterEach(() => vi.restoreAllMocks())

/**
 * jsdom computes no animations, so by default the host settles immediately —
 * the "cannot run" path. To exercise the waiting path, report the phosphor
 * exit animation as running on any element carrying its class.
 */
function mockPhosphorOutRuns() {
  const original = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = original(element, pseudo)
    if (!(element instanceof Element) || !element.classList.contains('clr-phosphor-out')) {
      return style
    }
    return new Proxy(style, {
      get(target, property) {
        if (property === 'animationName') return 'clr-phosphor-out'
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  })
}

function renderHost(queue: ToastQueue) {
  return renderWithProviders(<ToastHost queue={queue} />)
}

/** jsdom has no AnimationEvent; build the end event by hand. */
function fireAnimationEnd(element: Element, animationName: string) {
  const event = new Event('animationend', { bubbles: true })
  Object.assign(event, { animationName })
  fireEvent(element, event)
}

describe('one host, one visible toast', () => {
  it('renders nothing until a toast is shown', () => {
    const queue = createToastQueue()
    renderHost(queue)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the first toast and holds the second in the queue', () => {
    const queue = createToastQueue()
    renderHost(queue)

    act(() => {
      queue.show({ variant: 'info', message: 'Saved locally' })
      queue.show({ variant: 'info', message: 'Copied' })
    })

    expect(screen.getByText('Saved locally')).toBeInTheDocument()
    expect(screen.queryByText('Copied')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('promotes the queued toast after the visible one settles', () => {
    const queue = createToastQueue()
    renderHost(queue)

    let first = 0
    act(() => {
      first = queue.show({ variant: 'info', message: 'Saved locally' })
      queue.show({ variant: 'info', message: 'Copied' })
    })
    act(() => queue.dismiss(first))

    // No animation can run in jsdom, so the exit settles immediately.
    expect(screen.queryByText('Saved locally')).not.toBeInTheDocument()
    expect(screen.getByText('Copied')).toBeInTheDocument()
  })
})

describe('phosphor-out before removal', () => {
  it('keeps the dismissed toast mounted until the exit animation ends', () => {
    mockPhosphorOutRuns()
    const queue = createToastQueue()
    renderHost(queue)

    let first = 0
    act(() => {
      first = queue.show({ variant: 'info', message: 'Saved locally' })
      queue.show({ variant: 'info', message: 'Copied' })
    })
    act(() => queue.dismiss(first))

    // Mid-animation: still mounted, decaying, and the next toast still waits.
    const toast = screen.getByText('Saved locally')
    const wrapper = toast.closest('.clr-phosphor-out')
    expect(wrapper).not.toBeNull()
    expect(screen.queryByText('Copied')).not.toBeInTheDocument()

    fireAnimationEnd(wrapper as Element, 'clr-phosphor-out')

    expect(screen.queryByText('Saved locally')).not.toBeInTheDocument()
    expect(screen.getByText('Copied')).toBeInTheDocument()
  })

  it('ignores animation ends that are not the phosphor exit', () => {
    mockPhosphorOutRuns()
    const queue = createToastQueue()
    renderHost(queue)

    let id = 0
    act(() => {
      id = queue.show({ variant: 'info', message: 'Saved locally' })
    })
    act(() => queue.dismiss(id))

    const wrapper = screen.getByText('Saved locally').closest('.clr-phosphor-out')
    fireAnimationEnd(wrapper as Element, 'clr-materialize')

    expect(screen.getByText('Saved locally')).toBeInTheDocument()
  })

  it('settles immediately when the exit animation cannot run', () => {
    const queue = createToastQueue()
    renderHost(queue)

    let id = 0
    act(() => {
      id = queue.show({ variant: 'info', message: 'Saved locally' })
    })
    act(() => queue.dismiss(id))

    expect(screen.queryByText('Saved locally')).not.toBeInTheDocument()
  })
})

describe('dismissal — keyboard reachable, focus-safe', () => {
  it('arrival does not steal focus from what the user was doing', () => {
    const queue = createToastQueue()
    renderWithProviders(
      <>
        <input aria-label="Session notes" />
        <ToastHost queue={queue} />
      </>,
    )
    const input = screen.getByRole('textbox', { name: 'Session notes' })
    input.focus()

    act(() => {
      queue.show({ variant: 'negative', message: 'Sync failed.' })
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('the dismiss control is a labelled button operable from the keyboard', async () => {
    const user = userEvent.setup()
    const queue = createToastQueue()
    renderHost(queue)

    act(() => {
      queue.show({ variant: 'info', message: 'Saved locally' })
    })

    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    await user.tab()
    expect(dismiss).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.queryByText('Saved locally')).not.toBeInTheDocument()
  })
})

describe('AppError as an interrupting toast', () => {
  it('renders negative with the user message, requestId and one retry action', async () => {
    const user = userEvent.setup()
    const queue = createToastQueue()
    renderHost(queue)

    const onRetry = vi.fn()
    const error = createError(ErrorCode.GENERATION_FAILED, {
      requestId: 'req_test_123abc',
    })
    act(() => {
      queue.show(errorToast(error, { onRetry }))
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Could not generate workout. Try again.')
    expect(alert).toHaveTextContent('req_test_123abc')

    // Exactly one action besides dismiss, and it retries then dismisses.
    expect(screen.getAllByRole('button')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('announcement severity', () => {
  it('only negative is role="alert"; a success stays a polite status', () => {
    const queue = createToastQueue()
    renderHost(queue)

    let positive = 0
    act(() => {
      positive = queue.show({ variant: 'positive', message: 'Session saved' })
    })
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    act(() => {
      queue.dismiss(positive)
      queue.show({ variant: 'negative', message: 'Sync failed.' })
    })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'assertive')
  })
})
