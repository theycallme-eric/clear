/** One proposed logging surface; native modal behavior in both visual treatments. */
import { useRef, type ReactNode } from 'react'
import { Button, X } from '../design-system/index'
import { AppDialog } from './app-dialog'
import { CardContainmentContext } from './card-context'
import { Heading, HeadingLevelProvider } from './Heading'
import { useWorkoutExperiencePresentation } from './workout-experience-presentation'
import '../styles/logging-overlay.css'

export function LoggingOverlay({ open, title, onClose, children, variant, closeDisabled = false }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode
  variant?: 'dialog' | 'sheet'; closeDisabled?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const presentation = useWorkoutExperiencePresentation()
  const appearance = variant ?? presentation?.loggingOverlay ?? 'dialog'
  return <div ref={host} style={{ display: 'contents' }}>
    <AppDialog open={open} onClose={onClose} aria-label={title}
      className="clr-logging-overlay" data-overlay={appearance}
      onKeyDown={event => { if (closeDisabled && event.key === 'Escape') { event.preventDefault(); event.stopPropagation() } }}>
      <CardContainmentContext value={false}>
        <HeadingLevelProvider level={2}>
          <div className="clr-logging-overlay__head">
            <Heading className="clr-logging-overlay__title">{title}</Heading>
            <Button variant="secondary" size="sm" icon={<X />} aria-label="Close log" disabled={closeDisabled}
              onClick={() => host.current?.querySelector('dialog')?.requestClose()}>Close</Button>
          </div>
          <div className="clr-logging-overlay__body">{children}</div>
        </HeadingLevelProvider>
      </CardContainmentContext>
    </AppDialog>
  </div>
}
