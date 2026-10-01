# E2E suite (ENV-07)

Playwright, mobile-first, against a running app — the dev server locally, the
pull request's Vercel preview deployment in CI.

```sh
npm run e2e            # phone, tablet and desktop; starts the dev server if no target is set
npm run e2e -- --project=mobile
npm run e2e:report     # open the HTML report from the last run
```

## The default is a phone

`mobile` is the **first** project in `playwright.config.ts`, so `npm run e2e`
with no arguments runs a 390×844 viewport with touch and a coarse pointer.
`tablet` and `desktop` are additional coverage, listed after it. ~80% of CLEAR is used on a
handset in a gym; a suite whose baseline is a 1280px window proves the minority
case and calls it done.

`e2e/viewport.spec.ts` asserts all three, in a browser, so the claim cannot quietly
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

Locally they go in `.env.local`. Agent Runner workspaces also read the ignored
`.env.runner.local` and `.env.audit.local` files copied by the external Runner
contract. Explicit process and CI variables take precedence over either local
file source; in CI they are repository secrets. The preview
job deliberately receives **none** of them because it executes pull-request
code. Accessibility, shell and viewport checks run against that preview while
the backend specs skip with the missing-credential reason printed.

Two other jobs are privileged, and they are privileged for different reasons:

| Job | When | Runs | Why it may hold the key |
|---|---|---|---|
| `rls-standing` | every pull request, branches of this repository only | `rls.spec.ts` | REQ-007 asks for the cross-user matrix *before* a merge, not after. It starts no browser against an untrusted origin and works in its own namespace |
| `backend-e2e` | push to `main` | OTP + RLS + D6 + Settings | reviewed and merged code, with no paid model call |
| `deployed-journeys` | successful Vercel **Production** deployment | History, locations, and appearance against that deployment's URL, from that deployment's commit | the job first verifies the deployed SHA is `main`'s exact head; every automatic journey is model-free |
| `live-model-canary` | explicit workflow dispatch for a release | `core-loop.spec.ts` with no retries | one declared Anthropic call, one canary at a time, against the supplied production URL and exact `main` SHA |

A pull request **from a fork** receives no secret from GitHub, so `rls-standing`
skips rather than failing confusingly. What still runs there is the half that
needs no database: the disposition audit below, in both this suite and `CI`.

`rls-standing` also waits on one repository variable, `E2E_LIVE_SCHEMA_READY`.
The reused Supabase project still holds the *previous* application's schema —
applying the rebuild's migrations is TASK-072, behind the off-machine-backup
gate in `docs/backend/live-inventory.md`. Until that lands, the fixtures cannot
be seeded into the live project and this job would report a schema gap as an
RLS failure on every pull request. Set the variable to `true` in the change
that pushes the migrations and the standing check begins gating merges; no edit
to the workflow is needed.

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
project-configured numeric code, verified through the public endpoint with the anon key, and
proved unusable a second time or once it has expired. It provisions and deletes its own
namespaced user, so it leaves nothing behind. Every other spec takes a minted session. When
AUTH-02 builds the send-and-verify screen, its browser half belongs in that file
and nowhere else.

### One session from the real screen, shared (REQ-019)

`e2e/support/authenticated-session.ts` is the one place a session comes from
the sign-in screen and is then handed on. Its worker fixture,
`authenticatedSession`, walks Welcome → `/login` → Home → Generate once per
worker as a namespaced, onboarded user it provisions and deletes, and counts
what the walk sent: one code request, one verification, no generation request.
`authenticatedPage` is the test's page with that session already in storage.

```ts
import { expect, test } from './support/authenticated-session'

test('…', async ({ authenticatedPage: page, visit }) => {
  await visit('/generate') // signed in; no code requested, issued or verified
})
```

The generation browser lanes take their session this way rather than
authenticating again. `e2e/session-continuity.spec.ts` holds the journey to
those counts and proves a second test consumes the fixture with no call to
`/auth/v1/otp` or `/auth/v1/verify`. Specs that are not about generation keep
using `mintSession`.

## Paid model boundary

The ordinary unit, integration, preview, trusted-backend, and automatic
Production-deployment suites make **zero Anthropic calls**. Model behavior is
covered there with deterministic response fixtures and request interception.
Even on a machine with all Supabase credentials, paid specs skip unless
`LIVE_MODEL_TESTS=1` is explicitly present. A broad `npm run e2e` therefore
cannot multiply paid calls across the phone, tablet, and desktop projects.

The sole recurring paid proof is the manually dispatched `live-model-canary`
job. It runs `e2e/core-loop.spec.ts` once, with Playwright retries disabled,
and declares an expected budget of exactly one workout generation before it
starts. The deployed function normally makes one provider attempt and may make
one corrected/transient retry, so the honest provider-call ceiling is two.
That walk covers the deployed function, Review, persistence, Workout, Summary,
and Home, so a second generation-only job would pay twice for overlapping
evidence.

`e2e/generation-persistence.spec.ts` remains a targeted operator diagnostic for
the backend boundary. It is not part of routine CI and must not be run in a
loop. Its invocation must include `LIVE_MODEL_TESTS=1`. One-off requirements
such as TASK-014 may still authorize a small, explicit number of paid journeys;
their issue must state that count.

## Seed and reset

```sh
npm run e2e:seed             # two confirmed users, each owning one row per user table
npm run e2e:reset            # both users and everything that hangs off them, gone
npm run e2e:reset -- --stale # the above, plus namespaces abandoned by dead runs
```

Both are idempotent and both are safe to interrupt:

- every key is **derived from the namespace and nothing else**
  (`scripts/e2e/namespace.mjs`), so a second run writes the same rows rather
  than more rows;
- **seed resets first**, so it jumps to a known state instead of editing an
  unknown one — a run killed halfway cannot poison the next;
- **reset is one delete per user.** `auth.users` cascades all the way down, so
  there is no teardown order to get wrong and no partial teardown to leave.

`src/test/e2e-lifecycle.test.ts` proves all three against a double, on every
pull request, with no database.

### One namespace per run

`E2E_NAMESPACE` decides which users and which primary keys a run owns — `local`
by default, `pr-<number>` in CI. It exists because the standing check now runs
on **every** pull request against one shared Supabase project: without it, two
pull requests testing at the same moment would seed over each other, and since
seeding resets first, the second one would delete the first one's users
mid-run. That reports as an RLS failure and is not one.

The cost of per-run namespaces is orphans — a cancelled job's pull request
number never comes round again, so no later `reset` knows those addresses.
`--stale` sweeps them by prefix: `clear-e2e-…@example.com`, older than two
hours, which is longer than any job here is allowed to take. A run still in
flight is never touched, and neither is an address this harness did not create.

## RLS is a standing check

`e2e/rls.spec.ts` re-proves the policies on every run rather than trusting the
one-time reading DATA-01 did. User A holds a real token, user B owns real rows,
and for every user-owned table A must read none of them, update none of them,
delete none of them, and be refused when forging one. Three things make the
green mean something:

- **the seed is symmetric.** B reads their own row and writes to it, so "A sees
  zero" sits next to "B sees one" — a policy that denied everybody would
  otherwise pass every assertion in the file;
- **each refusal is checked at the row.** After every denied write the row is
  read back with the service role and compared: a 403 over a mutation that
  happened anyway would not survive it;
- **the run cleans up after itself,** then asserts that it did — users gone,
  fixture rows gone, checked past the policies rather than through them.

### Adding a table means answering for it

The matrix is not a list anybody maintains. It is every `cross-user` entry in
`scripts/e2e/dispositions.mjs`, and that register is compared against
`supabase/migrations/` — by the first test in `rls.spec.ts` and again in
`src/test/rls-standing-matrix.test.ts`, which needs no credentials.

A new table therefore has exactly two ways to pass, and both are a decision
written down:

| Disposition | Means | Consequence |
|---|---|---|
| `cross-user` | a person owns these rows | joins the matrix; every run proves another user is denied read and write |
| `shared-reference` | catalog data, owned by nobody | excluded, with the sentence saying why |

Saying nothing is not one of them: an undisposed table fails the build, as does
a disposition whose table is gone, and as does a table called user-owned whose
migration never enabled row-level security.

## Accessibility

There is no `page.goto` in any spec. The `visit` fixture navigates **and** runs
`axe-core`, so a screen cannot be reached without being scanned, and
`src/test/e2e-harness.test.ts` fails if a spec reaches for the bare navigation.
A violation fails the run; the offending rules and nodes are attached to the
report as JSON so the failure says *which*, not "expected 0, got 3".

**Which screens get scanned is `screens.ts`, derived from `required-routes.ts`
(REQ-010).** The inventory transcribes every screen IA.md §4 heads — the
transient Loading screen included — and the journeys each belongs to, without
importing the router. `screens.ts` is derived from it and walked by
`app-shell.spec.ts` and `reduced-motion.spec.ts`. The unit suite then holds the
router to the inventory (`src/test/required-routes.test.ts`): a required route
the router does not serve fails CI, so a screen cannot vanish from the product
and the suite together. The reverse still holds too — a route the router gains
and the inventory does not name fails. A required route not mounted yet is
recorded with `pendingOwner`, the recovery node that owns it; the suite fails
as soon as the router serves it, so the marker cannot outlive the gap. Adding a
screen is adding an entry to `required-routes.ts`.

`reduced-motion.spec.ts` runs the same list with `prefers-reduced-motion: reduce`
emulated and asserts the screen arrives already finished: nothing still
animating, nothing blanked by a silenced entrance, nothing to wait out before
the screen can be used (CORE-05).

## Focus ownership

`focus-ownership.spec.ts` (REQ-010, REQ-011) walks the sign-in form — email
step and one-time code step — and Settings with the Tab key, in every skin in
`SKINS` and again under emulated forced colours. At each stop it reads the
*computed* style of the rendered page against a capture taken with nothing
focused: the focused control (or the box that visibly is a checkbox) must
change its outline geometry, and every chamfered ancestor — the Card body —
must paint exactly as it did at rest. Under forced colours the control's
indicator must be `Highlight`, as the browser resolves it, and the card's must
not.

It needs no credentials. Supabase is stubbed at the browser's edge with
`page.route` — `/otp` answers 200, a seeded session stands in for the verify
step, PostgREST answers one onboarded profile — so no email is sent and the
same file runs against a laptop or the deployed exact head. A build with no
`VITE_SUPABASE_URL` makes no request to stub, so its code-step and Settings
tests skip by name; the email-step tests still run.

## When something fails

The run keeps a **trace** and a **screenshot**, not a stack: `npm run e2e:report`
locally, or the `playwright-report` artefact on the failed CI run. Both
directories are git-ignored — a trace can contain a session token.
