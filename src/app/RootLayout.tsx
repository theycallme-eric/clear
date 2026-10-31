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
 *
 * B05 REQ-001/REQ-002: `ContainedShell` is the shell markup itself. Routes,
 * the boot sequence (rendered before the router) and the crash fallback
 * (rendered above both) all use it, so the safe-area, header-clearance and
 * bottom-edge geometry in src/styles/shell.css reaches every one of them
 * instead of each keeping its own copy — or, for the fallback, none.
 *
 * Effects TASK-001: the shell is also where the Visual effects policy is
 * resolved (`src/state/visual-effects.ts`) and where the single decorative
 * host for optional effects sits, so every surface inside reads one answer.
 */
import { useEffect, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'

import { FocusBrackets } from '../design-system/index'
import { useVisualEffects, VisualEffectsProvider } from '../state/visual-effects'
import { AtmosphereLayer } from '../ui/atmosphere'
import { DEFAULT_ATMOSPHERE } from './atmosphere'

export interface ContainedShellProps {
  /** Defaults to the live layer; the crash fallback passes a still one. */
  atmosphere?: ReactNode
  children: ReactNode
}

export function ContainedShell({ atmosphere, children }: ContainedShellProps) {
  return (
    <VisualEffectsProvider>
      {atmosphere ?? <AtmosphereLayer />}
      <EffectsHost />
      <div
        className="clr-shell clr-shell--fixed clr-shell--contained"
        data-atmosphere={DEFAULT_ATMOSPHERE}
      >
        <div className="clr-shell__content">{children}</div>
      </div>
    </VisualEffectsProvider>
  )
}

/**
 * The one decorative host optional effects render into. Hidden from assistive
 * tech and inert to the pointer; it carries the resolved policy so an effect's
 * CSS and its markup read the same answer.
 */
function EffectsHost() {
  const { effectsEnabled, motionAllowed } = useVisualEffects()

  return (
    <div
      aria-hidden="true"
      className="clr-effects-host"
      data-effects={effectsEnabled ? 'on' : 'off'}
      data-motion={motionAllowed ? 'allowed' : 'still'}
    />
  )
}

export function RootLayout() {
  useEffect(() => {
    document.documentElement.dataset.atmosphere = DEFAULT_ATMOSPHERE
  }, [])

  return (
    <>
      <FocusBrackets />
      <ContainedShell>
        <Outlet />
      </ContainedShell>
    </>
  )
}
