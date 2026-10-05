/**
 * REQ-057 — the boot and re-entry sequence, and the gate that is not one.
 *
 * Composition is the 0.14.3 Boot Sequence template's: the atmosphere, the
 * shell, `ClearLogo` booting once, and directly below it one card that holds
 * the status. While it checks, that card is `ScanLoader`, which is a card
 * itself and carries the system checks as they finish; when a check fails it
 * is a `Card` holding the failure, and the one recovery action is pinned in
 * the footer rather than floating under the card. What the template shows
 * with a `simulateWork` stand-in, `useAppBoot` supplies for real — and the
 * template's own instruction is the one this file follows: *replace it with
 * your own init, do not replace it with a timer.* Its sample check rows and
 * its consent action are illustration, not product: the rows here are the
 * app's own reads, and a ready app is never behind a keypress.
 *
 * Three states, which are the CORE-04 four minus the one that cannot happen:
 * loading is the sequence, error is the failed check, populated is the app.
 * There is no empty state — initialization that answers nothing has still
 * answered, and a user with no history, no equipment and no constraints boots
 * into an app that says so on its own screens.
 *
 * **`BootGate` renders `children` the instant boot is ready and shows nothing
 * of its own afterwards.** No action leaves the boot screen, nothing waits for
 * an animation to finish, and there is no minimum duration anywhere in the
 * path — so a returning user whose reads answer quickly barely sees it, and a
 * reduced-motion user is never held for the length of an effect they have
 * asked not to see.
 *
 * It mounts in `main.tsx`, above the router rather than inside it: boot is the
 * app becoming ready, not a screen the app navigates to, and a guard below it
 * (AUTH-03) still owns every question about who this is and where they may go.
 * Because it renders above the route tree it brings its own atmosphere layer,
 * exactly as the template does — the one `RootLayout` mounts for the app takes
 * over when boot hands off.
 */
import { useEffect, type CSSProperties, type ReactNode } from 'react'

import { Button, ClearLogo } from '../design-system/index'
import { useAppBoot } from '../state/boot-queries'
import {
  BOOT_FAILURE_TITLE,
  BOOT_LABEL,
  BOOT_RETRY_LABEL,
  type BootView,
} from '../state/boot'
import { AtmosphereLayer } from '../ui/atmosphere'
import { Card } from '../ui/card'
import { ActionRow, PhoneFooter } from '../ui/composition'
import { ErrorView, LoadingView } from '../ui/view-state'
import { DEFAULT_ATMOSPHERE } from './atmosphere'
import { Screen } from './Screen'

export interface BootSequenceProps {
  readonly view: Extract<BootView, { status: 'checking' | 'failed' }>
  /** Re-runs the check that failed. Absent from the checking state by design. */
  readonly onRetry: () => void
}

/**
 * The boot screen. Presentational: it is given a view and shows it, so every
 * question about *when* the sequence ends is answered in one place —
 * `boot.ts` — rather than here.
 */
export function BootSequence({ view, onRetry }: BootSequenceProps) {
  // IA.md §4 gives a brand moment `full`, and boot has no route for
  // `resolveAtmosphere` to read; `DEFAULT_ATMOSPHERE` is that same answer for a
  // surface rendered outside the route tree.
  useEffect(() => {
    document.documentElement.dataset.atmosphere = DEFAULT_ATMOSPHERE
  }, [])

  return (
    <>
      <AtmosphereLayer />
      <div
        className="clr-shell clr-shell--fixed clr-shell--contained"
        data-atmosphere={DEFAULT_ATMOSPHERE}
      >
        <div className="clr-shell__content">
          <Screen
            title="CLEAR"
            heading={
              <span style={BRAND_HEADING_STYLE}>
                <ClearLogo size="lg" boot />
              </span>
            }
            pinnedFoot={
              view.status === 'failed' ? (
                <PhoneFooter>
                  <ActionRow>
                    <Button variant="primary" size="lg" onClick={onRetry}>
                      {BOOT_RETRY_LABEL}
                    </Button>
                  </ActionRow>
                </PhoneFooter>
              ) : undefined
            }
          >
            {view.status === 'checking' ? (
              <LoadingView
                label={BOOT_LABEL}
                lines={[...view.lines]}
                value={view.value}
                max={view.max}
              />
            ) : (
              <Card>
                <ErrorView
                  // Fixed copy plus the failed read's own code and requestId —
                  // the raw message could name an internal cause, and the user
                  // needs the one fact that matters: nothing was lost.
                  error={{
                    code: view.failure.error.code,
                    message: view.failure.message,
                    requestId: view.failure.error.requestId,
                  }}
                  title={BOOT_FAILURE_TITLE}
                />
              </Card>
            )}
          </Screen>
        </div>
      </div>
    </>
  )
}

const BRAND_HEADING_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  width: '100%',
}

export interface BootGateProps {
  readonly children: ReactNode
}

/** The app, once initialization says it is ready — and the sequence until then. */
export function BootGate({ children }: BootGateProps) {
  const { view, retry } = useAppBoot()

  if (view.status === 'ready') {
    return <>{children}</>
  }

  return <BootSequence view={view} onRetry={retry} />
}
