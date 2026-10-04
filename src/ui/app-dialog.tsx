/**
 * AppDialog — the app's public Dialog adapter.
 *
 * 0.14.3 owns native opening, its 200ms exit and reduced-motion closure. Do
 * not stage a second exit around it. Report native user closure once:
 * a controlled close is silent, including when reopened during an exit.
 */
import { useLayoutEffect, useRef } from 'react'

import { Dialog, type DialogProps } from '../design-system/index'

export type AppDialogProps = DialogProps

export function AppDialog({
  open = false,
  onClose,
  className,
  ...props
}: AppDialogProps) {
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
    <Dialog
      {...props}
      open={open}
      // Keep this prop stable: replacing className mid-exit erases the native
      // closing marker before the vendor effect can cancel its pending timer.
      className={['clr-app-dialog-enter', className].filter(Boolean).join(' ')}
    />
    </span>
  )
}
