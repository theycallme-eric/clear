/**
 * CrtField — the live CRT Glass field (effects TASK-006, REQ-006).
 *
 * Mounted once, by the root effects host, above every route. It is four
 * browser-native layers over the real, interactive page — nothing here
 * captures, reads back or re-encodes the page:
 *
 *   1. perimeter — four edge strips, each a `backdrop-filter` blur faded
 *      toward the centre, so the centre stays sharp and only the perimeter
 *      softens;
 *   2. lines     — one inline SVG path of curved horizontal scanlines, drifting
 *      one period at a time by a compositor transform;
 *   3. grain     — a seamless, feathered noise tile stepped to a new placement
 *      on its own clock, independent of the lines;
 *   4. vignette  — a static radial darkening at the corners.
 *
 * Composition ownership. The atmosphere (blobs, overlay) is the live ground
 * beneath the shell; the Phosphor Echo is painted by its rear sources inside
 * the shell, each once; glow and bleed stay with their components. The field
 * paints over all of them as one glass, filters no subtree, and is the only
 * decorative scanline signal — the old atmosphere, frame and dialog-backdrop
 * scans are retired in `src/styles/atmosphere.css`. The viewport field uses a
 * non-interactive manual popover to stay at the front of the browser top layer,
 * including above a native dialog. It never opens a second copy of the glass.
 *
 * Lifecycle. Visual effects off removes the field. Motion disallowed (reduced
 * motion, hidden tab, or effects off) pauses both clocks in place. The two
 * clocks are Web Animations on transforms — the package ships no keyframes for
 * them, and the app adds none to CSS. Every value that sets an appearance or a
 * cadence comes from `config.ts`.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

import { CRT_FIELD_CONFIG, crtFieldCustomProperties, crtFieldGrainTile, crtFieldLinePath } from './config'
import './crt-field.css'

export interface CrtFieldProps {
  /** Decorative motion may run (the resolved Visual effects policy). */
  motionAllowed: boolean
  /** Fill the nearest positioned ancestor rather than the viewport (the gallery's frame). */
  contained?: boolean
  /** Owned by the persistent host, so an effects-off unmount retains both phases. */
  clockState?: RefObject<CrtFieldClockState | null>
}

export interface CrtFieldClockState { lines: number; grain: number }

const FIELD_STYLE = crtFieldCustomProperties() as CSSProperties
const GRAIN_STYLE: CSSProperties = { backgroundImage: crtFieldGrainTile() }
const EDGES = ['top', 'bottom', 'left', 'right'] as const

/** Where the grain tile sits for each refresh, as fractions of the tile. */
const GRAIN_PLACEMENTS = [
  [0, 0], [0.37, 0.61], [0.73, 0.19], [0.11, 0.83], [0.59, 0.43], [0.29, 0.07], [0.89, 0.71], [0.47, 0.97],
] as const

/** Animation ids, so evidence can find the two clocks by name. */
export const CRT_FIELD_ANIMATIONS = Object.freeze({ lines: 'clr-crt-line-drift', grain: 'clr-crt-grain-refresh' })

const translate = (x: number, y: number) => ({ transform: `translate3d(${x}px, ${y}px, 0)` })

interface Size {
  width: number
  height: number
}

function viewportSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight }
}

/** The field's own box, re-read only when it changes size — never per frame. */
function useFieldSize(ref: RefObject<HTMLDivElement | null>): Size {
  const [size, setSize] = useState<Size>(viewportSize)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const read = () => {
      const width = element.clientWidth || window.innerWidth
      const height = element.clientHeight || window.innerHeight
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      )
    }
    read()
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', read)
      return () => window.removeEventListener('resize', read)
    }
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}

/** One glass in the top layer, without taking focus or making the page inert. */
function useFrontGlass(ref: RefObject<HTMLDivElement | null>, contained: boolean) {
  useLayoutEffect(() => {
    const field = ref.current
    if (!field || contained || typeof field.showPopover !== 'function') return

    field.setAttribute('popover', 'manual')
    let disposed = false
    let queued = false
    const bringForward = () => {
      if (disposed || !field.isConnected) return
      try {
        // A newly opened dialog/popover enters above older top-layer items.
        // Re-promote this same node; its two clocks and content stay intact.
        if (field.matches(':popover-open')) field.hidePopover()
        field.showPopover()
      } catch {
        // Preserve ordinary pointer-transparent composition if this browser
        // cannot promote the field. Never interfere with the native dialog.
        field.removeAttribute('popover')
      }
    }
    const queuePromotion = () => {
      if (queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        bringForward()
      })
    }
    const beforeToggle = (event: Event) => {
      if (event.target !== field && (event as ToggleEvent).newState === 'open') queuePromotion()
    }
    // Dialog toggle events are newer than popovers. Observe `open` too so a
    // browser with showModal() but no dialog toggle events gets the same order.
    const observer = new MutationObserver((records) => {
      if (records.some(({ target }) => target instanceof HTMLDialogElement && target.open)) queuePromotion()
    })
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] })
    document.addEventListener('beforetoggle', beforeToggle, true)
    bringForward()
    return () => {
      disposed = true
      observer.disconnect()
      document.removeEventListener('beforetoggle', beforeToggle, true)
      if (field.matches(':popover-open')) field.hidePopover()
      field.removeAttribute('popover')
    }
  }, [ref, contained])
}

/** The two independent clocks, created once and paused or played by the policy. */
function useFieldClocks(
  lines: RefObject<SVGSVGElement | null>,
  grain: RefObject<HTMLDivElement | null>,
  motionAllowed: boolean,
  clockState?: RefObject<CrtFieldClockState | null>,
) {
  const clocks = useRef<Animation[]>([])

  useEffect(() => {
    const linesElement = lines.current
    const grainElement = grain.current
    if (!linesElement || !grainElement || typeof linesElement.animate !== 'function') return
    const { periodPx, driftSecondsPerPeriod } = CRT_FIELD_CONFIG.lines
    const { tilePx, frames, refreshHz } = CRT_FIELD_CONFIG.grain
    const drift = linesElement.animate([translate(0, 0), translate(0, periodPx)], {
      duration: driftSecondsPerPeriod * 1000,
      iterations: Infinity,
      easing: 'linear',
    })
    drift.id = CRT_FIELD_ANIMATIONS.lines
    const placements = GRAIN_PLACEMENTS.slice(0, frames)
    const refresh = grainElement.animate(
      [
        ...placements.map(([x, y], index) => ({
          ...translate(x * tilePx, y * tilePx),
          offset: index / placements.length,
          easing: 'step-end',
        })),
        { ...translate(placements.at(-1)![0] * tilePx, placements.at(-1)![1] * tilePx), offset: 1 },
      ],
      { duration: (placements.length / refreshHz) * 1000, iterations: Infinity },
    )
    refresh.id = CRT_FIELD_ANIMATIONS.grain
    if (clockState?.current) {
      drift.currentTime = clockState.current.lines
      refresh.currentTime = clockState.current.grain
    }
    clocks.current = [drift, refresh]
    return () => {
      if (clockState) {
        clockState.current = {
          lines: typeof drift.currentTime === 'number' ? drift.currentTime : 0,
          grain: typeof refresh.currentTime === 'number' ? refresh.currentTime : 0,
        }
      }
      for (const clock of clocks.current) clock.cancel()
      clocks.current = []
    }
  }, [lines, grain, clockState])

  useEffect(() => {
    for (const clock of clocks.current) {
      if (motionAllowed) clock.play()
      else clock.pause()
    }
  }, [motionAllowed])
}

export function CrtField({ motionAllowed, contained = false, clockState }: CrtFieldProps) {
  const ref = useRef<HTMLDivElement>(null)
  const linesRef = useRef<SVGSVGElement>(null)
  const grainRef = useRef<HTMLDivElement>(null)
  const { width, height } = useFieldSize(ref)
  useFrontGlass(ref, contained)
  useFieldClocks(linesRef, grainRef, motionAllowed, clockState)
  const { periodPx, thicknessPx } = CRT_FIELD_CONFIG.lines
  const linesHeight = height + periodPx * 2

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={contained ? 'clr-crt-field clr-crt-field--contained' : 'clr-crt-field'}
      data-crt-config={CRT_FIELD_CONFIG.id}
      data-motion={motionAllowed ? 'running' : 'paused'}
      style={FIELD_STYLE}
    >
      <div className="clr-crt-field__perimeter">
        {EDGES.map((edge) => (
          <span key={edge} className={`clr-crt-field__edge clr-crt-field__edge--${edge}`} />
        ))}
      </div>
      <svg
        ref={linesRef}
        className="clr-crt-field__lines"
        width={width}
        height={linesHeight}
        viewBox={`0 ${-periodPx} ${width} ${linesHeight}`}
        focusable="false"
      >
        <path d={crtFieldLinePath(width, height)} strokeWidth={thicknessPx} />
      </svg>
      <div ref={grainRef} className="clr-crt-field__grain" style={GRAIN_STYLE} />
      <div className="clr-crt-field__vignette" />
    </div>
  )
}
