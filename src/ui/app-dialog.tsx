/**
 * AppDialog — the app's public Dialog adapter.
 *
 * 0.14.3 owns the whole surface: native opening, the phosphor arrival, the
 * 200ms four-step backdrop, the exit and reduced-motion closure, and the
 * `.clr-actions` row. The adapter adds no class and no motion of its own — an
 * app-owned backdrop rule would tie the package's closing rule on specificity
 * and replace its fade. Do not stage a second exit around it either.
 *
 * What the adapter does own is the callback contract. Report native user
 * closure once: a controlled close is silent, including when reopened during
 * an exit.
 *
 * Action order is the caller's half of the package rule. The safe action goes
 * first in DOM order, where `showModal()` lands focus, and exactly one action
 * is primary or critical: the package stacks that one on top on a phone and
 * sets it on the right of an equal-width row from 560px.
 */
import { useLayoutEffect, useRef } from 'react'

import { Dialog, type DialogProps } from '../design-system/index'

export type AppDialogProps = DialogProps

export function AppDialog({ open = false, onClose, ...props }: AppDialogProps) {
  const hostRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const dialog = hostRef.current?.querySelector('dialog')
    if (!dialog) return
    // Refresh before the vendor's passive close effect. Programmatic closure
    // is silent; a close after reopening remains a user dismissal even if the
    // vendor's internal suppression ref was left set by the interrupted exit.
    const reportClose = () => { if (open) onClose?.() }
    dialog.addEventListener('close', reportClose)
    return () => dialog.removeEventListener('close', reportClose)
  }, [open, onClose])

  return (
    <span ref={hostRef} style={{ display: 'contents' }}>
      <Dialog {...props} open={open} />
    </span>
  )
}
