/**
 * Root layout route (CORE-05). Everything that spans screens lives here:
 * the skip link (first in tab order), route-change focus, and the polite
 * live region that announces the screen a navigation landed on.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { SkipLink } from '../ui/SkipLink'
import { ScreenRegistryContext, type ScreenRegistry } from './screen-registry'

interface Announcement {
  key: string
  text: string
}

export function AppChrome() {
  const location = useLocation()
  const initialKey = useRef(location.key)
  const screenTitle = useRef<string | null>(null)
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)

  const register = useCallback((title: string) => {
    screenTitle.current = title
  }, [])
  const registry = useMemo<ScreenRegistry>(() => ({ register }), [register])

  // Child (Screen) effects run before this parent effect, so by the time a
  // navigation lands here the new screen has registered its title and set
  // document.title. On the initial load the browser owns focus and the page
  // announces itself — do nothing.
  useEffect(() => {
    if (location.key === initialKey.current) return
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
      <Outlet />
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
