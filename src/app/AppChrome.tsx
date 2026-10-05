/**
 * Root layout route (CORE-05). Everything that spans screens lives here:
 * the skip link (first in tab order), route-change focus, the polite live
 * region that announces the screen a navigation landed on, and the system
 * entry a screen arrives with.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useMatches, useNavigationType } from 'react-router-dom'

import {
  advanceRouteTrail,
  enterRoute,
  RouteMotionContext,
  startRouteTrail,
  UNMAPPED_ROUTE_MOTION,
  type RouteMotion,
  type RouteMotionState,
} from '../ui/motion'
import { SkipLink } from '../ui/SkipLink'
import { ActiveSessionPrompt } from './ActiveSessionPrompt'
import { ScreenRegistryContext, type ScreenRegistry } from './screen-registry'

interface Announcement {
  key: string
  text: string
}

/** The matched route's own account of how it is arrived at (router.tsx). */
function useMatchedRouteMotion(): RouteMotion {
  const handle = useMatches().at(-1)?.handle
  if (typeof handle === 'object' && handle !== null && 'motion' in handle) {
    return handle.motion as RouteMotion
  }
  return UNMAPPED_ROUTE_MOTION
}

export function AppChrome() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const routeMotion = useMatchedRouteMotion()
  const initialKey = useRef(location.key)
  const screenTitle = useRef<string | null>(null)
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [trail, setTrail] = useState(() =>
    startRouteTrail({
      key: location.key,
      pathname: location.pathname,
      motion: routeMotion,
    }),
  )

  // Derived while rendering rather than in an effect, so the screen that
  // arrives reads its own direction on its first render, not its second.
  let current = trail
  if (trail.keys[trail.index] !== location.key) {
    current = advanceRouteTrail(trail, {
      key: location.key,
      pathname: location.pathname,
      navigationType,
      motion: routeMotion,
    })
    setTrail(current)
  }
  const { direction, arrivalKey } = current

  const register = useCallback((title: string) => {
    screenTitle.current = title
  }, [])
  const registry = useMemo<ScreenRegistry>(() => ({ register }), [register])
  const motion = useMemo<RouteMotionState>(
    () => ({ direction, arrivalKey }),
    [direction, arrivalKey],
  )

  // Before paint, so the screen's first frame is the first frame of its entry
  // rather than a flash of the finished screen. Keyed on the arrival, not on
  // the location: a query or state change under the same screen is an inline
  // update and replays nothing. The entry is `backwards`-filled and delays
  // nothing — the screen takes focus and input from the same commit.
  useLayoutEffect(() => {
    if (direction === null) return
    const main = document.querySelector('main')
    if (main instanceof HTMLElement) enterRoute(main, direction)
  }, [direction, arrivalKey])

  // Child (Screen) effects run before this parent effect, so by the time a
  // navigation lands here the new screen has registered its title and set
  // document.title. On the initial load the browser owns focus and the page
  // announces itself — do nothing.
  useEffect(() => {
    if (location.key === initialKey.current) return
    const scroller = document.querySelector('.clr-scroll-region__scroller')
    scroller?.scrollTo({ top: 0, left: 0 })
    const main = document.querySelector('main')
    const target = main?.querySelector('h1') ?? main
    if (target instanceof HTMLElement) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus()
    }
    setAnnouncement({
      key: location.key,
      text: screenTitle.current ?? document.title,
    })
  }, [location.key])

  return (
    <ScreenRegistryContext.Provider value={registry}>
      <SkipLink />
      <RouteMotionContext.Provider value={motion}>
        <Outlet />
      </RouteMotionContext.Provider>
      {/* EXE-01: a session running while the user is somewhere else is a
          question, asked above every route because a deep link never reaches
          the workout shell. */}
      <ActiveSessionPrompt />
      {/* Keyed by navigation so landing twice on same-named screens still
          mutates the region — one announcement per route change, exactly. */}
      <div role="status" aria-live="polite" className="a11y-hidden">
        {announcement === null ? null : (
          <span key={announcement.key}>{announcement.text}</span>
        )}
      </div>
    </ScreenRegistryContext.Provider>
  )
}
