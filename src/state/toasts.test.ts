/**
 * DS-05 acceptance, queue half: at most one toast is current, later messages
 * queue in order, and removal is two-phase (`dismiss` marks leaving for the
 * exit animation, `settle` removes and promotes) so nothing is unmounted
 * mid-animation. `errorToast` maps an AppError onto the interrupting
 * contract: negative variant, user message, requestId, exactly one retry.
 */
import { describe, expect, it, vi } from 'vitest'

import { createError, ErrorCode } from './errors'
import { createToastQueue, errorToast } from './toasts'

describe('toast queue', () => {
  it('shows the first toast and queues later ones in order', () => {
    const queue = createToastQueue()

    const first = queue.show({ variant: 'info', message: 'Saved locally' })
    const second = queue.show({ variant: 'positive', message: 'Synced' })
    const third = queue.show({ variant: 'info', message: 'Copied' })

    const state = queue.getState()
    expect(state.current?.id).toBe(first)
    expect(state.phase).toBe('visible')
    expect(state.queue.map((toast) => toast.id)).toEqual([second, third])
  })

  it('dismiss marks the current toast leaving without removing it', () => {
    const queue = createToastQueue()
    const id = queue.show({ variant: 'info', message: 'Saved locally' })
    queue.show({ variant: 'positive', message: 'Synced' })

    queue.dismiss(id)

    const state = queue.getState()
    expect(state.current?.id).toBe(id)
    expect(state.phase).toBe('leaving')
    expect(state.queue).toHaveLength(1)
  })

  it('settle removes the leaving toast and promotes the next as visible', () => {
    const queue = createToastQueue()
    const first = queue.show({ variant: 'info', message: 'Saved locally' })
    const second = queue.show({ variant: 'positive', message: 'Synced' })

    queue.dismiss(first)
    queue.settle(first)

    const state = queue.getState()
    expect(state.current?.id).toBe(second)
    expect(state.phase).toBe('visible')
    expect(state.queue).toHaveLength(0)
  })

  it('settle is ignored for a toast that is not current', () => {
    const queue = createToastQueue()
    const first = queue.show({ variant: 'info', message: 'Saved locally' })
    const second = queue.show({ variant: 'positive', message: 'Synced' })

    queue.settle(second)

    const state = queue.getState()
    expect(state.current?.id).toBe(first)
    expect(state.queue.map((toast) => toast.id)).toEqual([second])
  })

  it('dismissing a queued toast removes it outright — it was never visible', () => {
    const queue = createToastQueue()
    const first = queue.show({ variant: 'info', message: 'Saved locally' })
    const second = queue.show({ variant: 'positive', message: 'Synced' })

    queue.dismiss(second)

    const state = queue.getState()
    expect(state.current?.id).toBe(first)
    expect(state.phase).toBe('visible')
    expect(state.queue).toHaveLength(0)
  })

  it('a second dismiss while leaving keeps the exit phase intact', () => {
    const queue = createToastQueue()
    const id = queue.show({ variant: 'info', message: 'Saved locally' })

    queue.dismiss(id)
    queue.dismiss(id)

    expect(queue.getState().phase).toBe('leaving')
    expect(queue.getState().current?.id).toBe(id)
  })

  it('notifies subscribers on every transition and stops after unsubscribe', () => {
    const queue = createToastQueue()
    const listener = vi.fn()
    const unsubscribe = queue.subscribe(listener)

    const id = queue.show({ variant: 'info', message: 'Saved locally' })
    queue.dismiss(id)
    queue.settle(id)
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
    queue.show({ variant: 'info', message: 'Again' })
    expect(listener).toHaveBeenCalledTimes(3)
  })
})

describe('errorToast — AppError routes to the interrupting contract', () => {
  it('is negative and carries the user message, requestId and one retry action', () => {
    const error = createError(ErrorCode.PERSISTENCE_WRITE_FAILED, {
      requestId: 'req_test_123abc',
    })
    const onRetry = vi.fn()

    const toast = errorToast(error, { onRetry })

    expect(toast.variant).toBe('negative')
    expect(toast.message).toBe('Could not save. Try again.')
    expect(toast.requestId).toBe('req_test_123abc')
    expect(toast.actionLabel).toBe('Retry')
    expect(toast.onAction).toBe(onRetry)
  })

  it('offers no action at all when there is no retry — never a dead button', () => {
    const toast = errorToast(createError(ErrorCode.NETWORK_OFFLINE))

    expect(toast.actionLabel).toBeUndefined()
    expect(toast.onAction).toBeUndefined()
  })
})
