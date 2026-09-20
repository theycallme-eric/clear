/**
 * CollapsibleSection — the DS-04c disclosure for workout and review sections.
 *
 * Not in the export (ATOMIC.md §11): an app-owned composition of shipped
 * tokens and classes, no new visual idea. A native button carries
 * `aria-expanded`/`aria-controls`; the labelled region always renders its
 * children and collapse is CSS-only (grid rows, see collapsible-section.css),
 * so collapsed content keeps its place in the accessibility tree's document
 * order — find-in-page and a screen reader's linear read still work. That is
 * deliberate: collapse here is visual economy, not content removal.
 *
 * Nesting is safe by construction: each trigger's handler lives on its own
 * button, and an inner section sits in the outer *region*, never inside the
 * outer button, so a click on the inner trigger has no outer trigger among
 * its ancestors to bubble into.
 *
 * The component imposes no heading level (CORE-05) — the screen that
 * composes it owns the outline.
 */
import { useId, useState, type HTMLAttributes, type ReactNode } from 'react'

import { ChevronDown, ChevronRight } from '../design-system/index'

import './collapsible-section.css'

export interface CollapsibleSectionProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** The trigger's visible label; also names the region via aria-labelledby. */
  label: ReactNode
  /** Initial state when uncontrolled. Disclosures start collapsed. */
  defaultExpanded?: boolean
  /** Controlled state. When set, the owner must react to onExpandedChange. */
  expanded?: boolean
  /** Reports the state the user asked for, in both modes. */
  onExpandedChange?: (expanded: boolean) => void
  children?: ReactNode
}

export function CollapsibleSection({
  label,
  defaultExpanded = false,
  expanded: expandedProp,
  onExpandedChange,
  className,
  children,
  ...props
}: CollapsibleSectionProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] =
    useState(defaultExpanded)
  const expanded = expandedProp ?? uncontrolledExpanded
  const triggerId = useId()
  const regionId = useId()

  function toggle() {
    if (expandedProp === undefined) {
      setUncontrolledExpanded(!expanded)
    }
    onExpandedChange?.(!expanded)
  }

  return (
    <div
      className={['clr-collapsible', className].filter(Boolean).join(' ')}
      {...props}
    >
      <button
        type="button"
        id={triggerId}
        className="clr-collapsible__trigger clr-hit"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={toggle}
      >
        {/* Icons ship aria-hidden; the shape change is the visual state cue. */}
        <span className="clr-collapsible__glyph">
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </span>
        {label}
      </button>
      <div
        id={regionId}
        role="region"
        aria-labelledby={triggerId}
        data-expanded={expanded}
        className="clr-collapsible__region"
      >
        <div className="clr-collapsible__content">{children}</div>
      </div>
    </div>
  )
}
