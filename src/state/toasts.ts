/**
 * CLEAR Toast Queue (DS-05)
 *
 * The export ships the `Toast` component; queueing is application state, and
 * it lives here. The contract: at most one toast is visible, later messages
 * wait in FIFO order, and a toast leaves in two phases — `dismiss` marks it
 * `leaving` so the host can run `.clr-phosphor-out`, and `settle` removes it
 * once the exit animation has finished (or could not run). Nothing is ever
 * unmounted mid-animation because nothing is removed until it settles.
 *
 * The presentation half is `src/ui/toast-host.tsx`, mounted once at the app
 * root; screens only ever call `show` / `showErrorToast`.
 */
import type { AppError } from './errors'

// ─────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────

export type ToastVariant = 'info' | 'positive' | 'negative'

export interface ToastInput {
  readonly variant: ToastVariant
  /** User-safe copy; for failures this is the AppError message. */
  readonly message: string
  /** Shown for support correlation, exactly as ErrorView shows it. */
  readonly requestId?: string
  /** Terse and imperative: "Undo", "Retry" — never a sentence. */
  readonly actionLabel?: string
  readonly onAction?: () => void
}

export interface ToastMessage extends ToastInput {
  readonly id: number
}

export type ToastPhase = 'visible' | 'leaving'

export interface ToastQueueState {
  /** The one toast the host may render, or null. */
  readonly current: ToastMessage | null
  /** `leaving` while the exit animation runs; removal waits for `settle`. */
  readonly phase: ToastPhase
  /** Messages waiting for the current toast to settle, oldest first. */
  readonly queue: readonly ToastMessage[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue
// ─────────────────────────────────────────────────────────────────────────────

export interface ToastQueue {
  subscribe(listener: () => void): () => void
  getState(): ToastQueueState
  /** Shows the toast now, or queues it while another is on screen. */
  show(input: ToastInput): number
  /**
   * Begins dismissal. The current toast moves to `leaving` for its exit
   * animation; a queued toast is removed outright (it was never visible).
   */
  dismiss(id: number): void
  /** Reports the exit animation finished: remove and promote the next. */
  settle(id: number): void
  /** Drops everything immediately — tests and sign-out, not dismissal. */
  clear(): void
}

const EMPTY_STATE: ToastQueueState = {
  current: null,
  phase: 'visible',
  queue: [],
}

export function createToastQueue(): ToastQueue {
  let state = EMPTY_STATE
  let nextId = 1
  const listeners = new Set<() => void>()

  function setState(next: ToastQueueState) {
    state = next
    for (const listener of listeners) listener()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getState() {
      return state
    },

    show(input) {
      const toast: ToastMessage = { ...input, id: nextId++ }
      if (state.current === null) {
        setState({ current: toast, phase: 'visible', queue: [] })
      } else {
        setState({ ...state, queue: [...state.queue, toast] })
      }
      return toast.id
    },

    dismiss(id) {
      if (state.current?.id === id) {
        // Already leaving: the host is mid-animation, let it settle.
        if (state.phase === 'visible') {
          setState({ ...state, phase: 'leaving' })
        }
        return
      }
      const queue = state.queue.filter((toast) => toast.id !== id)
      if (queue.length !== state.queue.length) {
        setState({ ...state, queue })
      }
    },

    settle(id) {
      if (state.current?.id !== id) return
      const [next, ...rest] = state.queue
      setState({ current: next ?? null, phase: 'visible', queue: rest })
    },

    clear() {
      setState(EMPTY_STATE)
    },
  }
}

/** The one queue behind the root host. Screens show toasts through this. */
export const toastQueue = createToastQueue()

// ─────────────────────────────────────────────────────────────────────────────
// AppError routing — the interrupting half of the DS-05 contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps an `AppError` onto a negative toast: user message, requestId, and
 * exactly one retry action. The whole-screen half of the contract is
 * `ErrorView` in `src/ui/view-state.tsx` — use that when the screen itself
 * failed; use this when a failure interrupts a screen that still stands.
 */
export function errorToast(
  error: AppError,
  options: { onRetry?: () => void; actionLabel?: string } = {},
): ToastInput {
  return {
    variant: 'negative',
    message: error.message,
    requestId: error.requestId,
    actionLabel: options.onRetry ? (options.actionLabel ?? 'Retry') : undefined,
    onAction: options.onRetry,
  }
}

/** Shows an interrupting failure on the root host. */
export function showErrorToast(
  error: AppError,
  options: { onRetry?: () => void; actionLabel?: string } = {},
): number {
  return toastQueue.show(errorToast(error, options))
}
