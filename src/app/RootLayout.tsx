/**
 * RootLayout — the one place the atmosphere exists.
 *
 * The layer mounts **once**, here, above every route, so navigating never tears
 * it down and rebuilds it. CLEAR 0.9.7 uses the Full atmosphere on every
 * production screen; route-level intensity selection is no longer part of the
 * application contract.
 *
 * The attribute lands in both places the specs name it. ATOMIC.md §7.2 puts the
 * two global attributes on `<html>`, which is what the viewport-fixed layer and
 * anything rendered outside the shell (native dialogs, toasts) inherit from;
 * IA.md §3 layer 2 states the shell itself carries it, which is what makes a
 * same contract readable from the rendered tree.
 */
import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'

import { FocusBrackets } from '../design-system/index'
import { AtmosphereLayer } from '../ui/atmosphere'
import { DEFAULT_ATMOSPHERE } from './atmosphere'

export function RootLayout() {
  useEffect(() => {
    document.documentElement.dataset.atmosphere = DEFAULT_ATMOSPHERE
  }, [])

  return (
    <>
      <FocusBrackets />
      <AtmosphereLayer />
      <div
        className="clr-shell clr-shell--fixed clr-shell--contained"
        data-atmosphere={DEFAULT_ATMOSPHERE}
      >
        <div className="clr-shell__content">
          <Outlet />
        </div>
      </div>
    </>
  )
}
