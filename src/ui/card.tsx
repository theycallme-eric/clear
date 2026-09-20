/**
 * Card — the DS-04a React wrapper over the export's `.clr-card` CSS.
 *
 * The export ships the card as CSS only (ATOMIC.md §11): an accent bar plus a
 * chamfered body, composed. The bar owns the left edge — the body's chamfer is
 * `--open-left`, so it draws no left border of its own and the bar's bright
 * right edge reads as the divider (see foundation.css).
 *
 * Width comes from `--accent-bar-width` / `--accent-bar-width-lg` through the
 * bar classes; the component never sets one. The card imposes no heading level
 * on its content (CORE-05) — the screen that composes it decides.
 */
import type { HTMLAttributes } from 'react'

export type CardBarWidth = 'md' | 'lg'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Accent bar width. md → --accent-bar-width (8px) · lg → --accent-bar-width-lg (12px). Default "md". */
  barWidth?: CardBarWidth
}

export function Card({
  barWidth = 'md',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={['clr-card', className].filter(Boolean).join(' ')}
      {...props}
    >
      <div
        aria-hidden="true"
        className={
          barWidth === 'lg' ? 'clr-card__bar clr-card__bar--lg' : 'clr-card__bar'
        }
      />
      <div className="clr-card__body clr-chamfer clr-chamfer--open-left clr-chamfer--md">
        {children}
      </div>
    </div>
  )
}
