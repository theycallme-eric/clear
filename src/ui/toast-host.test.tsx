/**
 * DS-05 acceptance, host half: one root host renders at most one toast and
 * queues later messages; removal waits for `.clr-phosphor-out` when the
 * animation runs and never waits when it cannot; dismissal is a keyboard
 * reachable button that steals no focus and hands focus back to the action it
 * came from; only `negative` announces assertively (`role="alert"`) — a
 * success stays a polite `status`.
 *
 * Placement is the 0.14.3 overlay contract, not the retired 0.9.7 VIBE-D
 * footer-clearance geometry: a toast is a temporary, dismissable overlay that
 * may cover the footer action and never reserves space for itself.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createError, ErrorCode } from '../state/errors'
import { createToastQueue, errorToast, type ToastQueue } from '../state/toasts'
import { renderWithProviders } from '../test/render'
import { ToastHost } from './toast-host'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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

/** jsdom lacks AnimationEvent; React detects its prefixed fallback at import. */
function fireAnimationEnd(element: Element, animationName: string) {
  const event = new Event('animationend', { bubbles: true })
  Object.assign(event, { animationName })
  fireEvent(element, event)
  const prefixed = new Event('webkitAnimationEnd', { bubbles: true })
  Object.assign(prefixed, { animationName })
  fireEvent(element, prefixed)
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

    // 0.14.3 owns dismissal motion; notification arrives only after its exit.
    await waitFor(() => expect(screen.queryByText('Saved locally')).not.toBeInTheDocument())
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

/** jsdom runs no stylesheet, so the package's own rules are read as shipped. */
function vendored(path: string) {
  return readFileSync(resolve(process.cwd(), 'src/design-system', path), 'utf8')
}

function renderOverPinnedAction(queue: ToastQueue) {
  const view = renderWithProviders(
    <>
      <main>
        <div className="clr-scroll-region__foot" data-testid="pinned-footer">
          <button type="button">Start session</button>
        </div>
      </main>
      <ToastHost queue={queue} />
    </>,
  )
  // A footer the 0.9.7 host would have measured and lifted the toast above.
  vi.spyOn(screen.getByTestId('pinned-footer'), 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 680,
    top: 680,
    right: 800,
    bottom: 760,
    left: 0,
    width: 800,
    height: 80,
    toJSON: () => ({}),
  })
  return view
}

describe('0.14.3 overlay placement', () => {
  it('the package rules a toast a temporary overlay that may cover the footer action', () => {
    expect(vendored('README.md')).toMatch(
      /\*\*Overlay:\*\*[^\n]*`Toast`[^\n]*A toast may cover the footer action, because it's temporary and dismissable\./,
    )
  })

  it('sits at one token offset whatever the screen has pinned beneath it', () => {
    const queue = createToastQueue()
    const { container } = renderOverPinnedAction(queue)

    act(() => {
      queue.show({ variant: 'negative', message: 'Sync failed.' })
    })

    const host = container.querySelector<HTMLElement>('[data-clear-toast-host]')
    expect(host).toHaveStyle({ position: 'fixed', zIndex: '3' })
    // No measured footer inset: the retired clearance wrote a pixel calc here.
    expect(host?.style.bottom).toBe('var(--spacing-500)')

    // A resize does not re-measure the footer either.
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(host?.style.bottom).toBe('var(--spacing-500)')
  })

  it('adds no permanent obstruction: nothing stays mounted once the toast is gone', () => {
    const queue = createToastQueue()
    const { container } = renderOverPinnedAction(queue)
    expect(container.querySelector('[data-clear-toast-host]')).toBeNull()

    let id = 0
    act(() => {
      id = queue.show({ variant: 'info', message: 'Saved locally' })
    })
    expect(container.querySelector('[data-clear-toast-host]')).not.toBeNull()
    // The covered action is never disabled, hidden or made inert by the overlay.
    const action = screen.getByRole('button', { name: 'Start session' })
    expect(action).toBeEnabled()
    expect(action.closest('[inert], [aria-hidden="true"]')).toBeNull()

    act(() => queue.dismiss(id))
    expect(container.querySelector('[data-clear-toast-host]')).toBeNull()
  })
})

describe('phosphor arrival and decay', () => {
  it('arrives on the package phosphor class and leaves on its decay', () => {
    vi.useFakeTimers()
    const queue = createToastQueue()
    renderHost(queue)

    act(() => {
      queue.show({ variant: 'info', message: 'Saved locally' })
    })
    const toast = screen.getByRole('status')
    expect(toast).toHaveClass('clr-phosphor-in')
    expect(toast).not.toHaveClass('clr-phosphor-out')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(toast).toHaveClass('clr-phosphor-out')
    expect(toast).not.toHaveClass('clr-phosphor-in')
  })

  it('the package defines both phases and silences them under reduced motion', () => {
    const css = vendored('css/motion.css')
    expect(css).toMatch(/@keyframes clr-phosphor-in\b/)
    expect(css).toMatch(/@keyframes clr-phosphor-out\b/)
    expect(css).toMatch(/\.clr-phosphor-in\s*\{[^}]*animation:\s*clr-phosphor-in\b/)
    expect(css).toMatch(/\.clr-phosphor-out\s*\{[^}]*animation:\s*clr-phosphor-out\b/)
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.clr-phosphor-out, \.clr-phosphor-in\b/)
  })
})

describe('keyboard dismissal returns to the action', () => {
  it('tabbing from the covered action into the toast and dismissing lands back on it', async () => {
    const user = userEvent.setup()
    const queue = createToastQueue()
    renderOverPinnedAction(queue)
    const action = screen.getByRole('button', { name: 'Start session' })
    action.focus()

    act(() => {
      queue.show({ variant: 'negative', message: 'Sync failed.' })
    })
    expect(action).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveFocus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await waitFor(() => expect(action).toHaveFocus())
  })

  it('a toast action taken from the keyboard returns there too', async () => {
    const user = userEvent.setup()
    const queue = createToastQueue()
    renderOverPinnedAction(queue)
    const action = screen.getByRole('button', { name: 'Start session' })
    action.focus()

    const onRetry = vi.fn()
    act(() => {
      queue.show(errorToast(createError(ErrorCode.GENERATION_FAILED), { onRetry }))
    })
    await user.tab()
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(onRetry).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await waitFor(() => expect(action).toHaveFocus())
  })

  it('does not pull focus back when the user never entered the toast', async () => {
    const queue = createToastQueue()
    renderWithProviders(
      <>
        <button type="button">Start session</button>
        <input aria-label="Session notes" />
        <ToastHost queue={queue} />
      </>,
    )
    const input = screen.getByRole('textbox', { name: 'Session notes' })
    input.focus()

    let id = 0
    act(() => {
      id = queue.show({ variant: 'info', message: 'Saved locally' })
    })
    act(() => queue.dismiss(id))
    await act(async () => {
      await Promise.resolve()
    })

    expect(input).toHaveFocus()
  })

  it('does not pull focus back after the user tabbed on out of the toast', async () => {
    const user = userEvent.setup()
    const queue = createToastQueue()
    renderWithProviders(
      <>
        <button type="button">Start session</button>
        <ToastHost queue={queue} />
        <input aria-label="Session notes" />
      </>,
    )
    screen.getByRole('button', { name: 'Start session' }).focus()

    let id = 0
    act(() => {
      id = queue.show({ variant: 'info', message: 'Saved locally' })
    })
    await user.tab()
    await user.tab()
    const input = screen.getByRole('textbox', { name: 'Session notes' })
    expect(input).toHaveFocus()

    act(() => queue.dismiss(id))
    await act(async () => {
      await Promise.resolve()
    })
    expect(input).toHaveFocus()
  })
})

describe('0.14.3 vendor dismissal completion', () => {
  it('waits for the vendor fallback, then promotes and independently dismisses the next toast', () => {
    vi.useFakeTimers()
    const queue = createToastQueue()
    renderHost(queue)
    act(() => {
      queue.show({ variant: 'info', message: 'First' })
      queue.show({ variant: 'positive', message: 'Second' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    act(() => vi.advanceTimersByTime(259))
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.queryByText('Second')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('First')).not.toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    act(() => vi.advanceTimersByTime(260))
    expect(queue.getState().current).toBeNull()
  })

  it('animation completion settles exactly once without a second host exit', () => {
    vi.useFakeTimers()
    mockPhosphorOutRuns()
    const queue = createToastQueue()
    const settle = vi.spyOn(queue, 'settle')
    renderHost(queue)
    act(() => {
      queue.show({ variant: 'info', message: 'First' })
      queue.show({ variant: 'info', message: 'Second' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    fireAnimationEnd(screen.getByRole('status'), 'clr-phosphor-out')
    expect(screen.queryByText('First')).not.toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(settle).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(260))
    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(settle).toHaveBeenCalledTimes(1)
  })
})
