/**
 * The app's side of the 0.14.3 motion lookup (`css/motion.css`).
 *
 * The package ships the effects; the moments it leaves to the builder are the
 * ones here: which way a screen arrives, a set arriving once, new state landing
 * mid-animation, and two loops wanting the same view. Everything below names a
 * shipped class — nothing in this module invents an effect, and a moment that
 * is not listed does not animate.
 */
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type AnimationEvent,
} from 'react'

/**
 * CORE-05: an app-composed JS animation (rAF loops, timed reveals) must render
 * its final state immediately under reduced motion. CSS animation gets the
 * same guarantee from the end-state block in src/styles/a11y.css; this is the
 * check for animation driven from script.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/* -----------------------------------------------------------------------------
   A screen arrives — `.route-enter-*`
   -------------------------------------------------------------------------- */

export type RouteDirection = 'forward' | 'back' | 'up' | 'down' | 'fade'

/** The shipped entry for each direction. */
export const ROUTE_ENTRY_CLASS: Record<RouteDirection, string> = {
  forward: 'route-enter-forward',
  back: 'route-enter-back',
  up: 'route-enter-up',
  down: 'route-enter-down',
  fade: 'route-enter-fade',
}

export const ROUTE_ENTRY_CLASSES: readonly string[] = Object.values(ROUTE_ENTRY_CLASS)

/**
 * What a route says about how it is arrived at. Declared on the route's
 * `handle` in `src/app/router.tsx`, so the motion map sits beside the guard map.
 */
export interface RouteMotion {
  /** Position in the flow: arriving somewhere shallower reads as going back. */
  depth: number
  /** A focus mode: entered upward, left downward, whatever the navigation was. */
  focus?: boolean
  /** A fixed entry that replaces the directional one on a forward arrival. */
  arrive?: 'up' | 'fade'
}

/** A route that declares nothing cuts in rather than claiming a direction. */
export const UNMAPPED_ROUTE_MOTION: RouteMotion = { depth: 0, arrive: 'fade' }

export interface RouteArrival {
  /** Whether the pathname changed. A query or state change is an inline update. */
  moved: boolean
  /** `POP` is the browser's own back or forward; anything else is a new entry. */
  navigationType: 'POP' | 'PUSH' | 'REPLACE'
  /** Entries moved through history on a `POP`, when the entry is a known one. */
  historyDelta?: number
  from: RouteMotion
  to: RouteMotion
}

/**
 * The direction a screen arrives from, or `null` when nothing arrived — an
 * inline update never replays a full-screen entrance.
 */
export function resolveRouteDirection(arrival: RouteArrival): RouteDirection | null {
  const { from, to } = arrival
  if (!arrival.moved) return null
  if (to.arrive === 'fade') return 'fade'
  if (to.focus === true && from.focus !== true) return 'up'
  if (from.focus === true && to.focus !== true) return 'down'
  if (arrival.navigationType === 'POP' && arrival.historyDelta !== undefined) {
    if (arrival.historyDelta < 0) return 'back'
    if (arrival.historyDelta > 0) return to.arrive ?? 'forward'
  }
  if (to.depth < from.depth) return 'back'
  return to.arrive ?? 'forward'
}

/** One location the router landed on. */
export interface RouteLanding {
  key: string
  pathname: string
  navigationType: RouteArrival['navigationType']
  motion: RouteMotion
}

/**
 * The entries this document has moved through, which is what tells the
 * browser's back from its forward: a `POP` says only that history moved.
 */
export interface RouteTrail extends RouteMotionState {
  keys: readonly string[]
  index: number
  pathname: string
  motion: RouteMotion
}

/** The first load. The browser owns it and nothing arrives. */
export function startRouteTrail(landing: Omit<RouteLanding, 'navigationType'>): RouteTrail {
  return {
    keys: [landing.key],
    index: 0,
    pathname: landing.pathname,
    motion: landing.motion,
    direction: null,
    arrivalKey: landing.key,
  }
}

export function advanceRouteTrail(trail: RouteTrail, landing: RouteLanding): RouteTrail {
  let keys = trail.keys
  let index = trail.index
  let historyDelta: number | undefined

  if (landing.navigationType === 'PUSH') {
    keys = [...keys.slice(0, index + 1), landing.key]
    index += 1
  } else if (landing.navigationType === 'REPLACE') {
    keys = keys.map((key, at) => (at === index ? landing.key : key))
  } else {
    const found = keys.indexOf(landing.key)
    if (found === -1) {
      // An entry from before this document loaded: its place is unknown, so
      // the trail restarts there and the routes' depths decide the direction.
      keys = [landing.key]
      index = 0
    } else {
      historyDelta = found - index
      index = found
    }
  }

  const direction = resolveRouteDirection({
    moved: landing.pathname !== trail.pathname,
    navigationType: landing.navigationType,
    historyDelta,
    from: trail.motion,
    to: landing.motion,
  })

  return {
    keys,
    index,
    pathname: landing.pathname,
    motion: landing.motion,
    direction,
    arrivalKey: direction === null ? trail.arrivalKey : landing.key,
  }
}

/** What the chrome knows about the arrival the current screen is part of. */
export interface RouteMotionState {
  /** `null` on first load and after an inline update: nothing arrived. */
  direction: RouteDirection | null
  /** Changes once per arrival, and only then. */
  arrivalKey: string
}

export const RouteMotionContext = createContext<RouteMotionState | null>(null)

/** The arrival this screen belongs to; `null` outside the app chrome. */
export function useRouteMotion(): RouteMotionState | null {
  return useContext(RouteMotionContext)
}

/* -----------------------------------------------------------------------------
   New state arrives mid-animation — cut, then `.clr-interlace`
   -------------------------------------------------------------------------- */

export const INTERLACE_CLASS = 'clr-interlace'

/** A loop is not on its way anywhere: only an animation that ends can be cut. */
function isOneShot(animation: Animation): boolean {
  return animation.effect?.getComputedTiming().iterations !== Infinity
}

/** Whether the element itself is still on its way in. */
export function isMidAnimation(element: Element): boolean {
  if (typeof element.getAnimations !== 'function') return false
  return element
    .getAnimations()
    .some((animation) => animation.playState === 'running' && isOneShot(animation))
}

/**
 * Drop whatever is playing and bring the new state in with the 100ms re-sync.
 * The old animation never finishes and never reverses; cancelling returns every
 * element to its own styles, which is the end state its entrance was heading
 * for. A loop beneath it carries state of its own and keeps running. Under
 * reduced motion the cut is the whole of it.
 */
export function interruptMotion(element: HTMLElement): void {
  if (typeof element.getAnimations === 'function') {
    for (const animation of element.getAnimations({ subtree: true })) {
      if (isOneShot(animation)) animation.cancel()
    }
  }
  element.classList.remove(INTERLACE_CLASS, ...ROUTE_ENTRY_CLASSES)
  if (prefersReducedMotion()) return
  // A class that is already there does not restart: read layout between the
  // removal and the add so the interlace plays from its first frame.
  void element.offsetWidth
  element.classList.add(INTERLACE_CLASS)
}

/**
 * Give a screen its entry. A navigation that lands while the same element is
 * still entering is new state mid-animation, so it cuts and interlaces instead
 * of starting a second entrance on top of the first.
 */
export function enterRoute(element: HTMLElement, direction: RouteDirection): void {
  if (
    ROUTE_ENTRY_CLASSES.some((name) => element.classList.contains(name)) &&
    isMidAnimation(element)
  ) {
    interruptMotion(element)
    return
  }
  element.classList.remove(INTERLACE_CLASS, ...ROUTE_ENTRY_CLASSES)
  if (prefersReducedMotion()) return
  void element.offsetWidth
  element.classList.add(ROUTE_ENTRY_CLASS[direction])
}

/* -----------------------------------------------------------------------------
   Cards or rows arrive on a screen — `.clr-boot`, 40ms apart, once
   -------------------------------------------------------------------------- */

export const ARRIVAL_CLASS = 'clr-boot'
const ARRIVAL_KEYFRAMES = 'clr-boot-in'

export interface ArrivalStagger {
  className: string
  onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void
}

/**
 * The stagger for a set's container, held for exactly one arrival.
 *
 * `.clr-boot > *` animates any child, including one inserted long after the
 * set arrived — which is how an inline update ends up replaying an entrance.
 * The class is dropped when the last child has landed, so later rows simply
 * appear. Spread the result onto the container and keep it mounted.
 */
export function useArrivalStagger(): ArrivalStagger {
  const [arrived, setArrived] = useState(false)

  return {
    className: arrived ? '' : ARRIVAL_CLASS,
    onAnimationEnd: (event) => {
      if (
        event.animationName === ARRIVAL_KEYFRAMES &&
        event.target === event.currentTarget.lastElementChild
      ) {
        setArrived(true)
      }
    },
  }
}

/* -----------------------------------------------------------------------------
   One interface loop in view at a time
   -------------------------------------------------------------------------- */

/**
 * What a loop is for, most state-bearing first. `urgent` is the low-timer
 * pulse, `busy` a real wait (scan, cursor, loading button), `ambient` a loop
 * that carries nothing. Atmosphere is exempt and never registers.
 */
export type InterfaceLoopKind = 'urgent' | 'busy' | 'ambient'

const LOOP_RANK: Record<InterfaceLoopKind, number> = { urgent: 0, busy: 1, ambient: 2 }

export interface InterfaceLoopClaim {
  id: string
  kind: InterfaceLoopKind
}

/**
 * Of the loops that would run, the one that does: the one carrying the most
 * state, and the earliest claim among equals so a second wait never takes the
 * animation from the first.
 */
export function selectInterfaceLoop(claims: readonly InterfaceLoopClaim[]): string | null {
  let winner: InterfaceLoopClaim | null = null
  for (const claim of claims) {
    if (winner === null || LOOP_RANK[claim.kind] < LOOP_RANK[winner.kind]) winner = claim
  }
  return winner?.id ?? null
}

let loopClaims: readonly InterfaceLoopClaim[] = []
let loopWinner: string | null = null
const loopListeners = new Set<() => void>()

function setLoopClaims(next: readonly InterfaceLoopClaim[]) {
  loopClaims = next
  const winner = selectInterfaceLoop(next)
  if (winner === loopWinner) return
  loopWinner = winner
  for (const listener of loopListeners) listener()
}

function subscribeToLoops(listener: () => void) {
  loopListeners.add(listener)
  return () => {
    loopListeners.delete(listener)
  }
}

export type InterfaceLoopState = 'run' | 'still'

export interface InterfaceLoop {
  /** Spread onto the element that owns the loop; `src/styles/app-motion.css` reads it. */
  'data-loop': InterfaceLoopState
}

/**
 * Claim the view's one loop while `active`. The loser is stilled, not removed:
 * it stays on screen with its `aria-busy`, its label and its glyph, so a real
 * wait still reads as a wait. Under reduced motion every loop is still from the
 * first render.
 */
export function useInterfaceLoop(kind: InterfaceLoopKind, active = true): InterfaceLoop {
  const id = useId()

  useEffect(() => {
    if (!active) return
    setLoopClaims([...loopClaims, { id, kind }])
    return () => {
      setLoopClaims(loopClaims.filter((claim) => claim.id !== id))
    }
  }, [id, kind, active])

  const winner = useSyncExternalStore(subscribeToLoops, () => loopWinner)
  const runs = active && winner === id && !prefersReducedMotion()

  return { 'data-loop': runs ? 'run' : 'still' }
}
