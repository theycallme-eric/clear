import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, renderHook } from '@testing-library/react'
import type { AnimationEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  advanceRouteTrail,
  ARRIVAL_CLASS,
  enterRoute,
  interruptMotion,
  isMidAnimation,
  prefersReducedMotion,
  resolveRouteDirection,
  ROUTE_ENTRY_CLASS,
  selectInterfaceLoop,
  startRouteTrail,
  useArrivalStagger,
  useInterfaceLoop,
  type RouteArrival,
  type RouteMotion,
} from './motion'

function stubMatchMedia(matches: boolean) {
  let reduced = matches
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    return {
      get matches() { return query === '(prefers-reduced-motion: reduce)' ? reduced : false },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => { listeners.add(listener) },
      removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener) },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  })
  return (next: boolean) => {
    reduced = next
    for (const listener of listeners) listener()
  }
}

describe('prefersReducedMotion (CORE-05)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports true when the platform asks for reduced motion', () => {
    stubMatchMedia(true)

    expect(prefersReducedMotion()).toBe(true)
  })

  it('reports false when motion is allowed', () => {
    stubMatchMedia(false)

    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('resolveRouteDirection (REQ-011)', () => {
  const home: RouteMotion = { depth: 3 }
  const history: RouteMotion = { depth: 4 }
  const workout: RouteMotion = { depth: 6, focus: true }
  const review: RouteMotion = { depth: 5, arrive: 'up' }
  const fallback: RouteMotion = { depth: 0, arrive: 'fade' }

  function direction(arrival: Partial<RouteArrival> & Pick<RouteArrival, 'from' | 'to'>) {
    return resolveRouteDirection({ moved: true, navigationType: 'PUSH', ...arrival })
  }

  it('enters forward going deeper and back coming out, whatever carried it', () => {
    expect(direction({ from: home, to: history })).toBe('forward')
    expect(direction({ from: history, to: home })).toBe('back')
    expect(direction({ from: history, to: home, navigationType: 'REPLACE' })).toBe('back')
  })

  it("follows the browser's own back and forward over the routes' depths", () => {
    const pop = { navigationType: 'POP' as const }
    expect(direction({ ...pop, from: history, to: home, historyDelta: -1 })).toBe('back')
    expect(direction({ ...pop, from: home, to: history, historyDelta: 1 })).toBe('forward')
    // Back to somewhere deeper is still back: history moved that way.
    expect(direction({ ...pop, from: home, to: history, historyDelta: -1 })).toBe('back')
    // An entry the trail has never seen falls back to depth.
    expect(direction({ ...pop, from: history, to: home })).toBe('back')
  })

  it('enters a focus mode upward and leaves it downward', () => {
    const back = { navigationType: 'POP' as const, historyDelta: -1 }
    expect(direction({ from: home, to: workout })).toBe('up')
    expect(direction({ from: workout, to: home })).toBe('down')
    expect(direction({ ...back, from: workout, to: home })).toBe('down')
  })

  it("uses a route's fixed entry on a forward arrival", () => {
    expect(direction({ from: history, to: review })).toBe('up')
    expect(direction({ from: home, to: fallback })).toBe('fade')
    expect(direction({ from: workout, to: fallback })).toBe('fade')
  })

  it('names a shipped class for every direction and nothing else', () => {
    expect(ROUTE_ENTRY_CLASS).toEqual({
      forward: 'route-enter-forward',
      back: 'route-enter-back',
      up: 'route-enter-up',
      down: 'route-enter-down',
      fade: 'route-enter-fade',
    })
  })

  it('does not replay an entrance for an inline update', () => {
    expect(direction({ moved: false, from: home, to: home })).toBeNull()
    expect(direction({ moved: false, from: review, to: review })).toBeNull()
  })
})

describe('route trail', () => {
  const at = (key: string, pathname: string, depth: number) => ({
    key,
    pathname,
    motion: { depth },
  })

  it('starts with nothing arriving: the first load is the browser’s', () => {
    expect(startRouteTrail(at('a', '/', 3))).toMatchObject({ direction: null, arrivalKey: 'a' })
  })

  it('tells back from forward across a push, two pops and a replace', () => {
    let trail = startRouteTrail(at('a', '/', 3))
    trail = advanceRouteTrail(trail, { ...at('b', '/history', 4), navigationType: 'PUSH' })
    expect(trail).toMatchObject({ direction: 'forward', arrivalKey: 'b', index: 1 })

    trail = advanceRouteTrail(trail, { ...at('a', '/', 3), navigationType: 'POP' })
    expect(trail).toMatchObject({ direction: 'back', arrivalKey: 'a', index: 0 })

    trail = advanceRouteTrail(trail, { ...at('b', '/history', 4), navigationType: 'POP' })
    expect(trail).toMatchObject({ direction: 'forward', arrivalKey: 'b', index: 1 })

    trail = advanceRouteTrail(trail, { ...at('c', '/settings', 4), navigationType: 'REPLACE' })
    expect(trail).toMatchObject({ direction: 'forward', keys: ['a', 'c'], index: 1 })
  })

  it('keeps the arrival it had when only the query or state changed', () => {
    let trail = startRouteTrail(at('a', '/history', 4))
    trail = advanceRouteTrail(trail, { ...at('b', '/', 3), navigationType: 'PUSH' })
    const inline = advanceRouteTrail(trail, { ...at('c', '/', 3), navigationType: 'REPLACE' })

    expect(inline.direction).toBeNull()
    expect(inline.arrivalKey).toBe('b')
  })

  it('drops the entries a new push leaves behind', () => {
    let trail = startRouteTrail(at('a', '/', 3))
    trail = advanceRouteTrail(trail, { ...at('b', '/history', 4), navigationType: 'PUSH' })
    trail = advanceRouteTrail(trail, { ...at('a', '/', 3), navigationType: 'POP' })
    trail = advanceRouteTrail(trail, { ...at('c', '/settings', 4), navigationType: 'PUSH' })

    expect(trail.keys).toEqual(['a', 'c'])
  })
})

/** A stand-in for the Web Animations a browser reports; jsdom has none. */
function fakeAnimation(iterations = 1) {
  return {
    playState: 'running',
    effect: { getComputedTiming: () => ({ iterations }) },
    cancel: vi.fn(),
  }
}

function withAnimations(element: HTMLElement, animations: ReturnType<typeof fakeAnimation>[]) {
  element.getAnimations = (() => animations) as unknown as HTMLElement['getAnimations']
}

describe('interruption: cut, then interlace', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gives an arriving screen the entry for its direction', () => {
    stubMatchMedia(false)
    const main = document.createElement('main')

    enterRoute(main, 'back')

    expect(main).toHaveClass('route-enter-back')
  })

  it('replaces a finished entry rather than stacking a second one', () => {
    stubMatchMedia(false)
    const main = document.createElement('main')
    main.className = 'clr-screen route-enter-forward'
    withAnimations(main, [])

    enterRoute(main, 'up')

    expect(main.className).toBe('clr-screen route-enter-up')
  })

  it('cuts an entry that is still playing and re-syncs instead of entering again', () => {
    stubMatchMedia(false)
    const main = document.createElement('main')
    main.className = 'clr-screen route-enter-forward'
    const entry = fakeAnimation()
    withAnimations(main, [entry])

    enterRoute(main, 'back')

    expect(entry.cancel).toHaveBeenCalledOnce()
    expect(main.className).toBe('clr-screen clr-interlace')
  })

  it('cuts the one-shots and leaves a loop that carries state running', () => {
    stubMatchMedia(false)
    const list = document.createElement('div')
    const reveal = fakeAnimation()
    const busy = fakeAnimation(Infinity)
    withAnimations(list, [reveal, busy])

    interruptMotion(list)

    expect(reveal.cancel).toHaveBeenCalledOnce()
    expect(busy.cancel).not.toHaveBeenCalled()
    expect(list).toHaveClass('clr-interlace')
  })

  it('does not count a loop as an entry in flight', () => {
    const frame = document.createElement('div')
    withAnimations(frame, [fakeAnimation(Infinity)])
    expect(isMidAnimation(frame)).toBe(false)

    withAnimations(frame, [fakeAnimation()])
    expect(isMidAnimation(frame)).toBe(true)
  })

  it('under reduced motion cuts to the final state and adds nothing', () => {
    stubMatchMedia(true)
    const main = document.createElement('main')
    main.className = 'clr-screen route-enter-forward'
    const entry = fakeAnimation()
    withAnimations(main, [entry])

    interruptMotion(main)
    expect(entry.cancel).toHaveBeenCalledOnce()
    expect(main.className).toBe('clr-screen')

    enterRoute(main, 'forward')
    expect(main.className).toBe('clr-screen')
  })
})

describe('useArrivalStagger', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  function end(animationName: string, target: Element | null, currentTarget: Element) {
    return { animationName, target, currentTarget } as unknown as AnimationEvent<HTMLElement>
  }

  function list() {
    const container = document.createElement('ul')
    container.append(document.createElement('li'), document.createElement('li'))
    return container
  }

  it('staggers a set once, then lets later rows simply appear', () => {
    const preference = stubMatchMedia(false)
    const { result } = renderHook(() => useArrivalStagger())
    const rows = list()
    expect(result.current.className).toBe('clr-boot')

    act(() => result.current.onAnimationEnd(end('clr-boot-in', rows.firstElementChild, rows)))
    expect(result.current.className).toBe('clr-boot')

    act(() => result.current.onAnimationEnd(end('clr-boot-in', rows.lastElementChild, rows)))
    expect(result.current.className).toBe('')

    const reduced = renderHook(() => useArrivalStagger())
    act(() => preference(true))
    expect(reduced.result.current.className).toBe('')
    act(() => preference(false))
    reduced.rerender()
    expect(reduced.result.current.className).toBe('')
    reduced.unmount()

    stubMatchMedia(true)
    const initialReduced = renderHook(() => useArrivalStagger())
    expect(initialReduced.result.current.className).toBe('')
    stubMatchMedia(false)
    initialReduced.rerender()
    expect(initialReduced.result.current.className).toBe('')
    initialReduced.unmount()
  })

  it('ignores unrelated effects but retires a cancelled or interrupted arrival', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useArrivalStagger())
    const rows = list()

    act(() => result.current.onAnimationEnd(end('clr-interlace', rows.lastElementChild, rows)))

    expect(result.current.className).toBe('clr-boot')

    rows.className = result.current.className
    const cleanup = result.current.ref(rows)
    const cancel = new Event('animationcancel', { bubbles: true })
    Object.defineProperty(cancel, 'animationName', { value: 'clr-boot-in' })
    act(() => rows.firstElementChild?.dispatchEvent(cancel))
    expect(result.current.className).toBe('')
    expect(rows.classList.contains(ARRIVAL_CLASS)).toBe(false)
    if (typeof cleanup === 'function') cleanup()

    const interrupted = renderHook(() => useArrivalStagger())
    const otherRows = list()
    otherRows.className = interrupted.result.current.className
    const cutCleanup = interrupted.result.current.ref(otherRows)
    act(() => interruptMotion(otherRows))
    expect(otherRows.classList.contains(ARRIVAL_CLASS)).toBe(false)
    expect(interrupted.result.current.className).toBe('')
    interrupted.rerender()
    expect(interrupted.result.current.className).toBe('')
    if (typeof cutCleanup === 'function') cutCleanup()
    interrupted.unmount()
  })

  it('spaces the set by the shipped 40ms unit, not a number of its own', () => {
    const shipped = readFileSync(
      resolve(import.meta.dirname, '../design-system/css/motion.css'),
      'utf-8',
    )
    expect(shipped).toMatch(/--stagger:\s*40ms/)
    expect(shipped).toContain(
      '.clr-boot > :nth-child(2) { animation-delay: calc(var(--stagger) * 1); }',
    )
    expect(ARRIVAL_CLASS).toBe('clr-boot')
  })
})

describe('one interface loop in view', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the loop carrying the most state, and the first among equals', () => {
    expect(selectInterfaceLoop([])).toBeNull()
    expect(
      selectInterfaceLoop([
        { id: 'scan', kind: 'ambient' },
        { id: 'read', kind: 'busy' },
        { id: 'save', kind: 'busy' },
      ]),
    ).toBe('read')
    expect(
      selectInterfaceLoop([
        { id: 'read', kind: 'busy' },
        { id: 'timer', kind: 'urgent' },
      ]),
    ).toBe('timer')
  })

  it('runs one loop and stills the other without unmounting either', () => {
    stubMatchMedia(false)
    const first = renderHook(() => useInterfaceLoop('busy'))
    const second = renderHook(() => useInterfaceLoop('busy'))

    expect(first.result.current).toEqual({ 'data-loop': 'run' })
    expect(second.result.current).toEqual({ 'data-loop': 'still' })

    first.unmount()
    expect(second.result.current).toEqual({ 'data-loop': 'run' })
    second.unmount()
  })

  it('hands the view to an urgent loop and back when it ends', () => {
    stubMatchMedia(false)
    const read = renderHook(() => useInterfaceLoop('busy'))
    const timer = renderHook(({ low }: { low: boolean }) => useInterfaceLoop('urgent', low), {
      initialProps: { low: false },
    })
    expect(read.result.current['data-loop']).toBe('run')
    expect(timer.result.current['data-loop']).toBe('still')

    timer.rerender({ low: true })
    expect(timer.result.current['data-loop']).toBe('run')
    expect(read.result.current['data-loop']).toBe('still')

    timer.rerender({ low: false })
    expect(read.result.current['data-loop']).toBe('run')
    read.unmount()
    timer.unmount()
  })

  it('stills every loop from the first render under reduced motion', () => {
    stubMatchMedia(true)
    const only = renderHook(() => useInterfaceLoop('busy'))

    expect(only.result.current).toEqual({ 'data-loop': 'still' })
    only.unmount()
  })

  it('stills a loop by removing its animation, never the element or its busy state', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../styles/app-motion.css'), 'utf-8')
    const rule = /\n(\[data-loop='still'\][^{]*)\{([^}]*)\}/.exec(css)

    expect(rule?.[2].trim()).toBe('animation: none !important;')
    for (const loop of [
      '.clr-scan-band',
      '.clr-pulse-micro',
      '.clr-glitch--loop',
      '.clr-progress-indet',
      '.clr-cursor::after',
      ".clr-chamfer[aria-busy='true']::before",
    ]) {
      expect(rule?.[1]).toContain(loop)
    }
    expect(css.match(/\[data-loop/g)).toHaveLength(rule?.[1].match(/\[data-loop/g)?.length ?? 0)
  })
})
