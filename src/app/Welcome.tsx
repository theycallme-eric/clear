/**
 * Welcome — `/welcome` (AUTH-02).
 *
 * IA.md §4: atmosphere `full`, public-only, in from a cold open or a sign-out,
 * out to `/login`. Composition is `AuthLayout › ClearLogo + Card + CTAButton`,
 * which in the real vocabulary is the shell (mounted once by `RootLayout`),
 * the shipped wordmark as the screen's own `<h1>`, and one card containing the
 * returning-user and first-run entries to the shared passwordless flow.
 *
 * States: populated only — there is nothing to fetch. The one wait it can have
 * is the session restore, and the route's `PublicOnly` guard owns that.
 *
 * Motion: the wordmark boots once; the subtitle and the action stagger in with
 * `.clr-boot`. Nothing manufactures a delay — the screen is interactive on its
 * first paint and the animation is decoration over the top of it.
 */
import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'

import { Button, ClearLogo } from '../design-system/index'
import { Card } from '../ui/card'
import { ActionRow } from '../ui/composition'
import { Screen } from './Screen'

export const LOGIN_ROUTE = '/login'
export const CREATE_ACCOUNT_ROUTE = '/login?mode=create'

export function Welcome() {
  const navigate = useNavigate()

  return (
    <Screen
      title="Welcome"
      heading={
        <span style={BRAND_HEADING_STYLE}>
          <ClearLogo size="xl" boot />
        </span>
      }
    >
      <div className="clr-stack clr-boot">
        <p className="label">Strength training, simplified.</p>
        <Card barWidth="lg">
          <ActionRow>
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                void navigate(LOGIN_ROUTE)
              }}
            >
              Sign in
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                void navigate(CREATE_ACCOUNT_ROUTE)
              }}
            >
              Create account
            </Button>
          </ActionRow>
        </Card>
      </div>
    </Screen>
  )
}

const BRAND_HEADING_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  width: '100%',
}
