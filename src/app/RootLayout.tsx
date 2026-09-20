/**
 * RootLayout — the one place the atmosphere exists.
 *
 * DS-06 has two halves. The layer mounts **once**, here, above every route, so
 * navigating never tears it down and rebuilds it. The *level* is per screen:
 * `resolveAtmosphere` reads it from the pathname, and changing it is a change
 * of one attribute on an already-mounted layer, not a remount.
 *
 * The attribute lands in both places the specs name it. ATOMIC.md §7.2 puts the
 * two global attributes on `<html>`, which is what the viewport-fixed layer and
 * anything rendered outside the shell (native dialogs, toasts) inherit from;
 * IA.md §3 layer 2 states the shell itself carries it, which is what makes a
 * screen's own level readable from the rendered tree.
 */
import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { AtmosphereLayer } from '../ui/atmosphere'
import { resolveAtmosphere } from './atmosphere'

export function RootLayout() {
  const { pathname } = useLocation()
  const atmosphere = resolveAtmosphere(pathname)

  useEffect(() => {
    document.documentElement.dataset.atmosphere = atmosphere
  }, [atmosphere])

  return (
    <>
      <AtmosphereLayer />
      <div className="clr-shell" data-atmosphere={atmosphere}>
        <div className="clr-shell__content">
          <Outlet />
        </div>
      </div>
    </>
  )
}
