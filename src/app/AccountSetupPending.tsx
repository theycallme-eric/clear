/**
 * AUTH-03 — what an authenticated user without a completed profile sees, until
 * ONB-01 lands in M2.
 *
 * The requirement is specific about why this file exists: the alternative is
 * redirecting to `/onboarding`, and `/onboarding` has no route, so the user
 * would land on `Not Found` having done nothing wrong. A screen that says what
 * is true — the account exists, the setup step is not built — is the honest
 * version of the same fact, and it carries the one action that is actually
 * available to them.
 *
 * **This whole file is deleted by ONB-01**, along with the `setup-pending`
 * branch in `guards.tsx`, which is why nothing else imports it.
 */
import { EmptyState } from '../design-system/index'
import { useAuth } from '../state/auth-context'
import { Screen } from './Screen'

export const ACCOUNT_SETUP_TITLE = 'Account setup'

/** Factual and specific: whose fault it is not, and what there is to do. */
export const ACCOUNT_SETUP_MESSAGE =
  'You’re signed in, but the first-run setup this app needs before it can generate ' +
  'anything is still being built. Nothing is wrong with your account — there is just ' +
  'nowhere to go yet.'

export function AccountSetupPending() {
  const { signOut } = useAuth()

  return (
    <Screen title={ACCOUNT_SETUP_TITLE}>
      <EmptyState
        title="Account setup isn’t built yet"
        message={ACCOUNT_SETUP_MESSAGE}
        actionLabel="Sign out"
        onAction={() => {
          // No navigation to follow it: the session goes anonymous, the guard
          // above this screen re-resolves, and the redirect to `/welcome` is
          // the guard's — one place decides where a signed-out visitor goes.
          void signOut()
        }}
      />
    </Screen>
  )
}
