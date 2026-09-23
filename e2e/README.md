# E2E suite (ENV-07)

Playwright, mobile-first, against a running app — the dev server locally, the
pull request's Vercel preview deployment in CI.

```sh
npm run e2e            # both projects; starts the dev server if no target is set
npm run e2e -- --project=mobile
npm run e2e:report     # open the HTML report from the last run
```

## The default is a phone

`mobile` is the **first** project in `playwright.config.ts`, so `npm run e2e`
with no arguments runs a 390×844 viewport with touch and a coarse pointer.
`desktop` is additional coverage, listed second. ~80% of CLEAR is used on a
handset in a gym; a suite whose baseline is a 1280px window proves the minority
case and calls it done.

`e2e/viewport.spec.ts` asserts both, in a browser, so the claim cannot quietly
stop being true.

## Where it runs

One variable decides:

| `E2E_BASE_URL` | Target | Who does this |
|---|---|---|
| unset | `http://localhost:5173`, started by the suite (`npm run e2e:server`) | a laptop |
| set | that origin, and the suite starts nothing | CI, pointed at the preview deployment |

`npm run e2e:server` is Vite — the same dev server `npm run dev` starts, without
ENV-04's preflight. The preflight exists to explain a missing `.env` to a human
about to lose a morning; the harness answers the same question itself and skips
what it cannot run, which is why the suite still does something useful on a
machine with no credentials.

## Credentials

Three variables, none of them ever in `.env.example` and none of them ever under
a `VITE_` prefix:

| Variable | What | Where |
|---|---|---|
| `SUPABASE_URL` | project URL (`VITE_SUPABASE_URL` is accepted) | Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | anon/public key (`VITE_SUPABASE_ANON_KEY` is accepted) | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret.** Creates and deletes users | same page, `service_role` |

Locally they go in `.env.local`; in CI they are repository secrets. The preview
job deliberately receives **none** of them because it executes pull-request
code. Accessibility, shell and viewport checks run against that preview while
the backend specs skip with the missing-credential reason printed.

The privileged OTP/RLS job runs separately on a push to `main`, after the code
has passed review and merge protection. That trusted job receives the three
repository secrets, resets the two-user namespace before it starts, runs only
`auth-otp.spec.ts` and `rls.spec.ts`, and resets again even when a test fails.
This keeps the service-role credential out of unmerged code without giving up
the standing live policy check.

### Protected Vercel previews

Vercel Authentication protects preview deployments before Clear itself loads.
The preview job receives one separate repository secret,
`VERCEL_AUTOMATION_BYPASS_SECRET`, and Playwright sends it as Vercel's
documented `x-vercel-protection-bypass` header plus the bypass-cookie request.
It grants automated HTTP access to this project's protected previews only: it
is not a Vercel account token and it grants no Supabase access. The value is
dedicated and revocable. If it is missing in preview CI, the harness fails
before opening a browser instead of testing Vercel's login page by mistake.

## Test users, without an inbox

CLEAR signs in with a one-time code sent by email, which no test can read. The
harness does not try to: `scripts/e2e/client.mjs` asks GoTrue's **admin** API to
create an already-confirmed user, then mints a session directly through
`generate_link` + `verify`.

The OTP path itself is exercised **once**, in `e2e/auth-otp.spec.ts` — a real
six-digit code, verified through the public endpoint with the anon key, and
proved unusable a second time. Every other spec takes a minted session. When
AUTH-02 builds the send-and-verify screen, its browser half belongs in that file
and nowhere else.

## Seed and reset

```sh
npm run e2e:seed     # two confirmed users, each owning one row per user table
npm run e2e:reset    # both users and everything that hangs off them, gone
```

Both are idempotent and both are safe to interrupt:

- every key is a **literal** (`scripts/e2e/namespace.mjs`), so a second run
  writes the same rows rather than more rows;
- **seed resets first**, so it jumps to a known state instead of editing an
  unknown one — a run killed halfway cannot poison the next;
- **reset is one delete per user.** `auth.users` cascades all the way down, so
  there is no teardown order to get wrong and no partial teardown to leave.

`src/test/e2e-lifecycle.test.ts` proves all three against a double, on every
pull request, with no database.

## RLS is a standing check

`e2e/rls.spec.ts` re-proves the policies on every run rather than trusting the
one-time reading DATA-01 did: user A holds a real token, user B owns real rows,
and for every owner-scoped table A must read none of them, update none of them,
and be refused when forging one. Both users are seeded, so "A sees zero" sits
next to "B sees one" — a policy that denied everybody would otherwise pass.

## Accessibility

There is no `page.goto` in any spec. The `visit` fixture navigates **and** runs
`axe-core`, so a screen cannot be reached without being scanned, and
`src/test/e2e-harness.test.ts` fails if a spec reaches for the bare navigation.
A violation fails the run; the offending rules and nodes are attached to the
report as JSON so the failure says *which*, not "expected 0, got 3".

**Which screens get scanned is `screens.ts`.** It is the one list, walked by
`app-shell.spec.ts` and `reduced-motion.spec.ts`, and the unit suite compares it
against the route table in `src/app/router.tsx` — so a screen added to the app
and not to that list fails CI before anyone has to remember it. Adding a screen
is adding a line there.

`reduced-motion.spec.ts` runs the same list with `prefers-reduced-motion: reduce`
emulated and asserts the screen arrives already finished: nothing still
animating, nothing blanked by a silenced entrance, nothing to wait out before
the screen can be used (CORE-05).

## When something fails

The run keeps a **trace** and a **screenshot**, not a stack: `npm run e2e:report`
locally, or the `playwright-report` artefact on the failed CI run. Both
directories are git-ignored — a trace can contain a session token.
