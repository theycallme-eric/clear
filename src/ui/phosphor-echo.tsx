/**
 * Effects TASK-003 (REQ-003) — Phosphor Echo, the shared rear-image effect.
 *
 * A port of the preserved round-3 kernel (`round-3/phosphor-echo.mjs`). The
 * kernel is one SVG filter: blur the full filled silhouette, offset it left
 * and down, reduce its alpha, then composite it *out* of the unshifted
 * SourceAlpha footprint. It emits only the exposed rear copy; the sharp
 * foreground is the real component, rendered unchanged above it.
 *
 * The parts are kept apart so each can change alone:
 *
 *   - Preset: `phosphor-echo-preset.ts`, the only owner of the numbers.
 *   - Compositing: `PhosphorEchoDefinition`, installed once per document by
 *     the root effects host (`src/app/RootLayout.tsx`).
 *   - Silhouette geometry: `chamferSilhouette` and the measure functions,
 *     read from the real component's own frame.
 *   - Lifecycle: `useEchoGeometry`, which re-measures on resize, on a class
 *     or skin change and after a frame's colour transition settles.
 *   - Eligibility: a target opts in by being wrapped; which screens do is not
 *     decided here.
 *
 * Rear sources are filled `currentColor` silhouettes in their target's own
 * painted role colour, aria-hidden and inert to the pointer. With Visual
 * effects off (`src/state/visual-effects.ts`) no rear source is rendered at
 * all, so neither an echo nor a solid source shape is left in place.
 *
 * Units are CSS pixels: every filter is applied in a user space with no
 * viewBox scaling, so a 24-unit icon and a 360px card show the same softness
 * and displacement. A glyph's own viewBox is nested inside that space.
 */
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type RefObject,
} from 'react'

import { useVisualEffects } from '../state/visual-effects'
import { PHOSPHOR_ECHO_PRESET } from './phosphor-echo-preset'

import './phosphor-echo.css'

/** The one filter every rear source references (`.clr-echo__source`). */
export const PHOSPHOR_ECHO_FILTER_ID = 'clr-phosphor-echo'

// ---------------------------------------------------------------------------
// Compositing — the kernel, as round-3 `installEcho` writes it.
// ---------------------------------------------------------------------------

/** Mounted definitions, in mount order; the first is the document's one. */
const definitionClaims: symbol[] = []
const definitionListeners = new Set<() => void>()

function announceDefinitionClaims() {
  for (const listener of definitionListeners) listener()
}

/**
 * The filter definition. Rendered by the root effects host; if a second host
 * ever mounts in the same document, only the first installs the filter, so
 * there is exactly one `#clr-phosphor-echo` to reference.
 */
export function PhosphorEchoDefinition() {
  const [token] = useState(() => Symbol('phosphor-echo'))
  const subscribe = useCallback(
    (onChange: () => void) => {
      definitionClaims.push(token)
      definitionListeners.add(onChange)
      announceDefinitionClaims()
      return () => {
        definitionClaims.splice(definitionClaims.indexOf(token), 1)
        definitionListeners.delete(onChange)
        announceDefinitionClaims()
      }
    },
    [token],
  )
  const owns = useSyncExternalStore(
    subscribe,
    () => definitionClaims[0] === token,
    () => false,
  )

  if (!owns) return null

  const { opacity, blur, x, y } = PHOSPHOR_ECHO_PRESET
  return (
    <svg className="clr-echo-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter
          id={PHOSPHOR_ECHO_FILTER_ID}
          x="-80%"
          y="-80%"
          width="260%"
          height="260%"
          primitiveUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="soft-copy" />
          <feOffset in="soft-copy" dx={x} dy={y} result="offset-copy" />
          <feComponentTransfer in="offset-copy" result="translucent-copy">
            <feFuncA type="linear" slope={opacity} />
          </feComponentTransfer>
          <feComposite
            in="translucent-copy"
            in2="SourceAlpha"
            operator="out"
            result="exposed-copy"
          />
        </filter>
      </defs>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Silhouette geometry.
// ---------------------------------------------------------------------------

/** The public chamfer sizes; each reads its `--chamfer-*` token. */
const CHAMFER_SIZES = ['sm', 'md', 'lg'] as const

/**
 * The complete filled chamfer footprint in CSS px — the same outline round 3
 * paints as its rear source: a box with the bottom-right corner cut.
 */
export function chamferSilhouette(width: number, height: number, cut: number): string {
  return `M0 0H${width}V${height - cut}L${width - cut} ${height}H0Z`
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

interface FrameGeometry extends Box {
  cut: number
  /** The frame's painted border colour, from the active skin. */
  ink: string
}

function boxWithin(wrapper: HTMLElement, element: Element): Box | null {
  const box = element.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return null
  const origin = wrapper.getBoundingClientRect()
  return {
    left: box.left - origin.left,
    top: box.top - origin.top,
    width: box.width,
    height: box.height,
  }
}

/**
 * A framed target's outline: its chamfered frame, or the whole card — accent
 * bar included — when the frame is a card body. Its cut is the frame's own
 * size token and its ink the colour its border is painted in.
 */
function measureFrame(wrapper: HTMLElement): FrameGeometry | null {
  const frame = wrapper.querySelector<HTMLElement>('.clr-chamfer')
  if (!frame) return null
  const card = frame.closest('.clr-card')
  const outline = card && wrapper.contains(card) ? card : frame
  const box = boxWithin(wrapper, outline)
  if (!box) return null

  const style = getComputedStyle(frame)
  const size = CHAMFER_SIZES.find((name) => frame.classList.contains(`clr-chamfer--${name}`))
  const cut = Number.parseFloat(style.getPropertyValue(size ? `--chamfer-${size}` : '--c')) || 0
  const painted =
    getComputedStyle(frame, '::after').backgroundColor ||
    style.getPropertyValue('--brd').trim() ||
    'currentColor'
  // The silhouette must be opaque, as round 3's were: the kernel subtracts
  // SourceAlpha, so a translucent source would leave (1 − alpha) of its rear
  // copy inside the footprint. Same role hue, full alpha.
  const ink = `rgb(from ${painted} r g b / 1)`

  return { ...box, cut, ink }
}

/** A glyph target's box: the real icon, the wrapper's last element. */
function measureGlyph(wrapper: HTMLElement): Box | null {
  const glyph = wrapper.lastElementChild
  return glyph ? boxWithin(wrapper, glyph) : null
}

// ---------------------------------------------------------------------------
// Lifecycle.
// ---------------------------------------------------------------------------

function sameGeometry<T extends object>(a: T | null, b: T | null): boolean {
  if (a === null || b === null) return a === b
  return (Object.keys(a) as (keyof T)[]).every((key) => a[key] === b[key])
}

/** How long a frame keeps re-measuring after a state change: past any state transition. */
const SETTLE_MS = 1000

/** The attributes a frame's painted colour or corner follows. */
const STATE_ATTRIBUTES = ['class', 'disabled', 'aria-busy', 'aria-pressed', 'aria-checked', 'aria-invalid']

/**
 * Measures while the effect is on. A frame's corner can change after its own
 * resize observer runs and its colour follows the skin and its state, so a
 * class or state change, a skin change, focus and a finished colour transition
 * re-measure as well as a resize.
 */
function useEchoGeometry<T extends object>(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  measure: (wrapper: HTMLElement) => T | null,
): T | null {
  const [geometry, setGeometry] = useState<T | null>(null)

  useLayoutEffect(() => {
    const wrapper = ref.current
    if (!active || !wrapper) return

    const update = () => {
      const next = measure(wrapper)
      setGeometry((current) => (sameGeometry(current, next) ? current : next))
    }
    update()

    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    resize?.observe(wrapper)
    for (const child of wrapper.querySelectorAll('.clr-chamfer, .clr-card')) resize?.observe(child)
    if (wrapper.lastElementChild) resize?.observe(wrapper.lastElementChild)

    // A state change starts the frame's colour transition, and the rear must
    // land on where it ends, whatever its duration or whether it fires an
    // event: measure now and on every frame for a settling window. Focus
    // changes no attribute, so it does the same.
    let disposed = false
    let frame = 0
    const updateSettled = () => {
      update()
      const until = performance.now() + SETTLE_MS
      cancelAnimationFrame(frame)
      const step = () => {
        if (disposed) return
        update()
        if (performance.now() < until) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }

    const mutation = typeof MutationObserver === 'undefined' ? null : new MutationObserver(updateSettled)
    mutation?.observe(wrapper, { subtree: true, attributes: true, attributeFilter: STATE_ATTRIBUTES })
    mutation?.observe(document.documentElement, { attributes: true })

    const events = ['transitionend', 'focusin', 'focusout'] as const
    for (const event of events) wrapper.addEventListener(event, updateSettled)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resize?.disconnect()
      mutation?.disconnect()
      for (const event of events) wrapper.removeEventListener(event, updateSettled)
    }
  }, [ref, active, measure])

  return active ? geometry : null
}

// ---------------------------------------------------------------------------
// Targets.
// ---------------------------------------------------------------------------

/**
 * A framed component — a Card, a framed back action, a CTA — with its rear
 * image. The child is the real component; it keeps its semantics, focus, hit
 * area, ground and icon untouched. Only the outer frame emits: nothing inside
 * it receives an echo of its own.
 */
export function PhosphorEchoFrame({ children }: { children: ReactElement }) {
  const { effectsEnabled } = useVisualEffects()
  const ref = useRef<HTMLDivElement>(null)
  const geometry = useEchoGeometry(ref, effectsEnabled, measureFrame)

  return (
    <div ref={ref} className="clr-echo" data-echo="frame">
      {geometry && (
        <svg
          className="clr-echo__rear"
          aria-hidden="true"
          focusable="false"
          style={{
            left: geometry.left,
            top: geometry.top,
            width: geometry.width,
            height: geometry.height,
            color: geometry.ink,
          }}
        >
          <path
            className="clr-echo__source"
            d={chamferSilhouette(geometry.width, geometry.height, geometry.cut)}
            fill="currentColor"
          />
        </svg>
      )}
      {children}
    </div>
  )
}

export interface PhosphorEchoGlyphProps {
  /** The glyph's own coordinate system; the filter never scales with it. */
  viewBox: string
  /** The glyph's filled silhouette, holes kept, in `viewBox` units. */
  d: string
  /** The real icon, drawn in `currentColor`. */
  children: ReactElement
}

/** A standalone glyph whose silhouette is a path in its own viewBox. */
export function PhosphorEchoGlyph({ viewBox, d, children }: PhosphorEchoGlyphProps) {
  const { effectsEnabled } = useVisualEffects()
  const ref = useRef<HTMLSpanElement>(null)
  const geometry = useEchoGeometry(ref, effectsEnabled, measureGlyph)

  return (
    <span ref={ref} className="clr-echo clr-echo--glyph" data-echo="glyph">
      {geometry && (
        <svg
          className="clr-echo__rear"
          aria-hidden="true"
          focusable="false"
          style={{
            left: geometry.left,
            top: geometry.top,
            width: geometry.width,
            height: geometry.height,
          }}
        >
          {/* Filtered in CSS px; the glyph's viewBox is nested beneath it. */}
          <g className="clr-echo__source">
            <svg viewBox={viewBox} width={geometry.width} height={geometry.height}>
              <path d={d} fill="currentColor" fillRule="evenodd" />
            </svg>
          </g>
        </svg>
      )}
      {children}
    </span>
  )
}

/**
 * Standalone text — a screen heading — with its rear image: a duplicate of
 * the text silhouette, hidden from assistive technology, behind the original.
 * Place it inside the real heading so the heading keeps its level and name.
 * The duplicate is generated content (`data-echo-text`), so the heading's own
 * text — what `textContent` and `innerText` read — is still said once.
 */
export function PhosphorEchoText({ children }: { children: string }) {
  const { effectsEnabled } = useVisualEffects()

  return (
    <span className="clr-echo-text" data-echo="text">
      {effectsEnabled && (
        <span
          className="clr-echo__source clr-echo-text__rear"
          aria-hidden="true"
          data-echo-text={children}
        />
      )}
      <span className="clr-echo-text__foreground">{children}</span>
    </span>
  )
}
