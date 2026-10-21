/**
 * Welcome — `/welcome` (AUTH-02).
 *
 * IA.md §4: atmosphere `full`, public-only, in from a cold open or a sign-out,
 * out to `/login`. Composition follows the 0.14.3 Boot Sequence template's
 * settled state: the shell (mounted once by `RootLayout`), the shipped
 * wordmark as the screen's own `<h1>`, and one card below it holding the one
 * line that says what this is (U08) and the single Get started entry (U13,
 * U14). Only the
 * title sits on the atmosphere, and the wordmark and card are centred as one
 * group in the visible height (`Screen centered`); at a short height or with
 * enlarged text the group starts at the top and scrolls instead of clipping.
 *
 * One entry serves new and returning accounts: the passwordless code flow
 * signs a returning athlete in and creates the account for a new one, so there
 * is no choice to make before it.
 *
 * States: populated only — there is nothing to fetch. The one wait it can have
 * is the session restore, and the route's `PublicOnly` guard owns that.
 *
 * Motion: the wordmark boots once and the decorative line uses `.clr-boot`.
 * The card and its entry stay outside that transform so hit geometry is stable
 * on arrival and after the animation's retained final frame.
 * Nothing manufactures a delay — the screen is interactive on its first paint
 * and the animation is decoration over the top of it.
 */
import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'

import { Button, ClearLogo } from '../design-system/index'
import { Card } from '../ui/card'
import { ActionGroup } from '../ui/composition'
import { Screen } from './Screen'

const GET_STARTED_ROUTE = '/login'

export function Welcome() {
  const navigate = useNavigate()

  return (
    <Screen
      title="Welcome"
      centered
      heading={
        <span role="img" aria-label="CLEAR" style={BRAND_HEADING_STYLE}>
          <ClearLogo size="xl" boot />
        </span>
      }
    >
      <Card>
        <div className="clr-stack">
          <div className="clr-boot">
            <p className="label">Strength training, simplified.</p>
          </div>
          <ActionGroup>
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                void navigate(GET_STARTED_ROUTE)
              }}
            >
              Get started
            </Button>
          </ActionGroup>
        </div>
      </Card>
    </Screen>
  )
}

const BRAND_HEADING_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  width: '100%',
}
