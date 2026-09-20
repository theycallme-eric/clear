/**
 * The DS-05 blocking surfaces — every overlay in CLEAR is a `Dialog`.
 *
 * A sheet and a dialog are the same interaction differing only in geometry,
 * and CLEAR bans rounded corners, so a sheet lost its signature anyway
 * (decided 2026-08-25, `docs/specs/design/ATOMIC.md` §12). What a sheet was
 * really offering was arrival, and that comes from `AppDialog`'s motion
 * instead: the frame traces itself on, the contents materialize, the backdrop
 * hard-cuts, and dismissal decays through `.clr-phosphor-out`.
 *
 * `ConfirmDialog` is a decision the user must take before anything continues;
 * `ErrorDialog` is the blocking third of the `AppError` contract — the
 * interrupting third is a negative toast (`showErrorToast`), and a screen
 * that failed outright is `ErrorView`. One renderer per surface.
 */
import type { ReactNode } from 'react'

import { AlertTriangle, Button } from '../design-system/index'
import type { AppError } from '../state/errors'
import { AppDialog } from './app-dialog'

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Say what happens; when `critical`, say what is lost. */
  children: ReactNode
  /** Terse and imperative: "Discard", "Delete" — never "OK". */
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive or irreversible: critical frame, critical confirm button. */
  critical?: boolean
  onConfirm: () => void
  /** The safe exit — the cancel action and Esc both land here, once. */
  onCancel: () => void
}

/**
 * A blocking decision. The cancel action comes first in DOM order because
 * `showModal()` focuses the first focusable child: the safe choice is the one
 * a stray Enter takes. The backdrop is never a dismissal — the shipped
 * `Dialog` defaults `dismissOnBackdrop` false for exactly this case.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  critical = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AppDialog
      open={open}
      title={title}
      critical={critical}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={critical ? 'critical' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </AppDialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocking failure
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorDialogProps {
  open: boolean
  error: AppError
  /** Matches `ErrorView`, so a failure reads the same wherever it lands. */
  title?: string
  actionLabel?: string
  /** Supply to offer the one retry; omit when the failure has no retry. */
  onRetry?: () => void
  /** Close, Esc, and a completed retry all report the dismissal, once. */
  onDismiss: () => void
}

/**
 * A failure the user cannot work around — the whole flow stops until they
 * retry or leave. Carries the user-safe message, the requestId for support
 * correlation, and exactly one retry action; severity is a glyph and a
 * critical frame, never colour alone. Announcement is the platform's: the
 * modal takes focus, so no live region competes with it.
 */
export function ErrorDialog({
  open,
  error,
  title = 'Request failed',
  actionLabel = 'Retry',
  onRetry,
  onDismiss,
}: ErrorDialogProps) {
  return (
    <AppDialog
      open={open}
      title={title}
      critical
      onClose={onDismiss}
      actions={
        <>
          <Button variant="secondary" onClick={onDismiss}>
            Close
          </Button>
          {onRetry && (
            <Button
              variant="primary"
              onClick={() => {
                onRetry()
                onDismiss()
              }}
            >
              {actionLabel}
            </Button>
          )}
        </>
      }
    >
      <span style={{ display: 'flex', gap: 'var(--spacing-200)' }}>
        <span style={{ color: 'var(--icon-toast-negative)', display: 'flex' }}>
          <AlertTriangle />
        </span>
        <span>
          {error.message}
          {error.requestId && (
            <span
              style={{
                display: 'block',
                marginTop: 'var(--spacing-200)',
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--label-xs-size)',
                letterSpacing: 'var(--tracking-data)',
              }}
            >
              {error.requestId}
            </span>
          )}
        </span>
      </span>
    </AppDialog>
  )
}
