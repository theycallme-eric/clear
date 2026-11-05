/** Accepted focused logging frame. Native modal focus/inertness; shared Echo kernel.
 * Only gallery mounts this owner until route integration is explicitly delivered. */
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { IconButton, X } from '../../design-system/index'
import { CardContainmentContext } from '../card-context'
import { EchoExcluded } from '../foreground-echo'
import { PhosphorEchoFrame } from '../phosphor-echo'
import { useOptionalVisualEffects } from '../../state/visual-effects'
import { Heading, HeadingLevelProvider } from '../Heading'
import './presentation.css'

export function LoggingOverlay({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const effects = useOptionalVisualEffects()
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLButtonElement>('button[aria-label="Close log"]')?.focus({ preventScroll: true })
    }
    if (!open && dialog.open) dialog.close()
  }, [open])
  const frame = <div className="clr-bleed clr-bleed--block clr-accepted-log__emission">
      <div className="clr-chamfer clr-chamfer--lg clr-accepted-log__frame">
        <EchoExcluded><CardContainmentContext value={false}><HeadingLevelProvider level={2}>
          {/* No tabindex on this structural scroller: opening focus belongs to X.
              One stationary frame clips the scroller at its inner lower border. */}
          <div className="clr-accepted-log__scroll">
            <header className="clr-accepted-log__head">
              <Heading id={titleId}>{title}</Heading>
              <IconButton variant="secondary" label="Close log" icon={<X />} onClick={onClose} />
            </header>
            <div className="clr-accepted-log__body">{children}</div>
          </div>
        </HeadingLevelProvider></CardContainmentContext></EchoExcluded>
      </div>
    </div>
  return <dialog ref={ref} className="clr-dialog clr-accepted-log" aria-labelledby={titleId}
    onClose={event => { if (event.target === event.currentTarget && open) onClose() }}
    onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); onClose() }}>
    {effects ? <PhosphorEchoFrame>{frame}</PhosphorEchoFrame> : frame}
  </dialog>
}
