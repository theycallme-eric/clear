/**
 * B05 REQ-003: a capped area that is as tall as its content until its parent
 * runs out of room, and then scrolls through the public `ScrollRegion` — the
 * one vertical scrolling contract (ATOMIC §3.3) — rather than a local
 * overflow box.
 *
 * The public region fills a parent of definite height and has no intrinsic
 * height of its own. This host takes the content's measured height, lets its
 * flex parent shrink it, and pins the region to whatever height results, so
 * content that fits shows no cue and content that does not keeps the
 * region's hard clip, drawn scrollbar and edge streaks.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { ScrollRegion } from '../design-system/index'
import './fitted-scroll-region.css'

export interface FittedScrollRegionProps {
  className?: string
  children?: ReactNode
  /** Fill an already measured/capped parent instead of sizing this host. */
  fit?: boolean
}

export function FittedScrollRegion({ className, children, fit = true }: FittedScrollRegionProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>(undefined)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const host = hostRef.current
    const content = contentRef.current
    if (host === null || content === null) return
    const measure = () => {
      const contentHeight = content.getBoundingClientRect().height
      setHeight(contentHeight)
      // Compare with the whole allowance, before the region reserves its
      // measured edge layers. Otherwise those rules can create two pixels of
      // overflow themselves and stay lit after the content fits again.
      setOverflowing(contentHeight > host.clientHeight + 1)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const edge = overflowing ? <div aria-hidden="true" data-fitted-scroll-edge="" /> : undefined

  return (
    <div
      ref={hostRef}
      className={['clr-fitted-scroll', className].filter(Boolean).join(' ')}
      style={{ height: fit ? height : '100%' }}
      data-fitted-scroll=""
    >
      <ScrollRegion head={edge} foot={edge}>
        <div ref={contentRef}>{children}</div>
      </ScrollRegion>
    </div>
  )
}
