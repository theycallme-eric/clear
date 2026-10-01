/**
 * Card — the DS-04a React wrapper over the export's `.clr-card` CSS.
 *
 * The export ships the card as CSS only: a closed chamfered body with an
 * optional accent bar joined to its left edge. The body always keeps all four
 * edges; the bar is decoration, never the card's missing border.
 *
 * Width comes from `--accent-bar-width` / `--accent-bar-width-lg` through the
 * bar classes; the component never sets one. The card imposes no heading level
 * on its content (CORE-05) — the screen that composes it decides.
 */
import type { HTMLAttributes } from 'react'

import { ActionRow } from './composition'

export type CardBarWidth = 'md' | 'lg'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Add the optional accent bar. md → 8px · lg → 12px. Omit for a plain card. */
  barWidth?: CardBarWidth
}

export function Card({
  barWidth,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={['clr-card', className].filter(Boolean).join(' ')}
      {...props}
    >
      {barWidth ? (
        <div
          aria-hidden="true"
          className={
            barWidth === 'lg' ? 'clr-card__bar clr-card__bar--lg' : 'clr-card__bar'
          }
        />
      ) : null}
      <div className="clr-card__body clr-chamfer clr-chamfer--md">
        {children}
      </div>
    </div>
  )
}

/**
 * The action edge of a card. Keeping this composition inside the card makes
 * primary/secondary placement a rule instead of a screen-by-screen spacing
 * decision.
 */
export function CardActions({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <ActionRow
      className={className}
      style={style}
      {...props}
    />
  )
}
