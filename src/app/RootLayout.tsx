/**
 * RootLayout — the one place the atmosphere exists.
 *
 * The layer mounts **once**, here, above every route, so navigating never tears
 * it down and rebuilds it. CLEAR 0.14.3 ships one atmosphere with no intensity
 * modes, so nothing here reads the pathname and no route selects a level.
 *
 * `data-atmosphere` selects nothing in the shipped CSS any more. It still lands
 * on `<html>` and on the shell as an inert marker of the one atmosphere, which
 * keeps that contract readable from the rendered tree.
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
