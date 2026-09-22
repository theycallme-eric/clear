/**
 * Welcome — `/welcome` (AUTH-02).
 *
 * IA.md §4: atmosphere `full`, public-only, in from a cold open or a sign-out,
 * out to `/login`. Composition is `AuthLayout › ClearLogo + CTAButton`, which
 * in the real vocabulary is the shell (mounted once by `RootLayout`), the
 * shipped wordmark as the screen's own `<h1>`, and one primary button.
 *
 * States: populated only — there is nothing to fetch. The one wait it can have
 * is the session restore, and `PublicOnly` owns that.
 *
 * Motion: the wordmark boots once; the subtitle and the action stagger in with
 * `.clr-boot`. Nothing manufactures a delay — the screen is interactive on its
 * first paint and the animation is decoration over the top of it.
 */
import { useNavigate } from 'react-router-dom'

import { Button, ClearLogo } from '../design-system/index'
import { PublicOnly } from './PublicOnly'
import { Screen } from './Screen'

export const LOGIN_ROUTE = '/login'

export function Welcome() {
  const navigate = useNavigate()

  return (
    <PublicOnly title="Welcome">
      <Screen title="Welcome" heading={<ClearLogo size="xl" boot />}>
        <div className="clr-stack clr-boot">
          <p className="label">Strength training, simplified.</p>
          <div className="clr-row">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                void navigate(LOGIN_ROUTE)
              }}
            >
              Sign in
            </Button>
          </div>
        </div>
      </Screen>
    </PublicOnly>
  )
}
