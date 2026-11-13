/** One proposed logging surface; native modal behavior in both visual treatments. */
import { useRef, type ReactNode } from 'react'
import { IconButton, X } from '../design-system/index'
import { AppDialog } from './app-dialog'
import { LoggingSurfaceContext } from './logging-surface-context'
import { CardContainmentContext } from './card-context'
import { Heading, HeadingLevelProvider } from './Heading'
import { useWorkoutExperiencePresentation } from './workout-experience-presentation'
import '../styles/logging-overlay.css'

export function LoggingOverlay({ open, title, onClose, children, variant, backdrop, closeDisabled = false }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode
  variant?: 'dialog' | 'sheet'; backdrop?: 'balanced' | 'dark' | 'soft'; closeDisabled?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const presentation = useWorkoutExperiencePresentation()
  const appearance = variant ?? presentation?.loggingOverlay ?? 'dialog'
  return <div ref={host} style={{ display: 'contents' }}>
    <AppDialog open={open} onClose={onClose} aria-label={title}
      className="clr-logging-overlay" data-overlay={appearance} data-backdrop={backdrop ?? presentation?.dialogBackdrop ?? 'balanced'}
      onKeyDown={event => { if (closeDisabled && event.key === 'Escape') { event.preventDefault(); event.stopPropagation() } }}>
      <LoggingSurfaceContext value><CardContainmentContext value={false}>
        <HeadingLevelProvider level={2}>
          <div className="clr-logging-overlay__scroll">
            <div className="clr-logging-overlay__head">
              <Heading className="clr-logging-overlay__title">{title}</Heading>
              <IconButton variant="secondary" label="Close log" icon={<X />} disabled={closeDisabled}
                onClick={() => host.current?.querySelector('dialog')?.requestClose()} />
            </div>
            <div className="clr-logging-overlay__body">{children}</div>
          </div>
        </HeadingLevelProvider>
      </CardContainmentContext></LoggingSurfaceContext>
    </AppDialog>
  </div>
}
