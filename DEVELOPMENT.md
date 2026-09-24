# Development

## Getting the app running

Three commands from a fresh clone. There is no local database to install, start
or reset: development runs against the **hosted Supabase project**, the same one
the deployed app uses.

```sh
git clone git@github.com:theycallme-eric/clear.git && cd clear
npm install
cp .env.example .env     # then fill in the two values — see below
npm run dev
```

### Filling in `.env`

`.env.example` is the environment contract: names and placeholders only, safe to
commit, and the list `npm run dev` checks against. Copying it gives you two
variables to fill in, both from **Supabase dashboard → your project → Project
Settings → API**:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | the `anon` / `public` key — **never** the `service_role` key |

Both are browser-safe by design: row-level security, not secrecy, is the
boundary. `.gitignore` excludes every `.env*` file except the example, so a
filled-in `.env` cannot be committed by accident. Vite also reads `.env.local`,
`.env.development` and `.env.development.local` if you prefer to split them; the
preflight reads the same set, in the same order.

### What `npm run dev` does before Vite starts

`npm run dev` is `scripts/dev-preflight/preflight.mjs` followed by `vite`, and
the second half only runs if the first succeeds. The preflight exists to kill
D4 — "sitting down to work meant debugging infrastructure" — by answering the
two questions that actually go wrong, in English, before the dev server prints a
URL that was never going to work:

1. **Is every documented variable set to a real value?** A variable that is
   missing, empty, or still holding its `.env.example` placeholder is named on
   its own line, with what it is and where to get it. Nothing connects.
2. **Is the project awake and does it know this key?** One authenticated request
   to the project's PostgREST root — a pulse, not a query, so it works before
   any schema exists. It times out after 8 seconds rather than hanging.

Each failure prints a short explanation and exits non-zero. None of them prints
a stack trace: a stack is where a morning disappears, the link is where it gets
fixed.

### When the project is paused

Supabase pauses a free-tier project after about a week of inactivity. That is
the common failure, and it looks like this:

```
CLEAR dev preflight — not starting

  Supabase: project paused or unreachable — resume at https://supabase.com/dashboard/project/<ref>
      Tried: https://<ref>.supabase.co · getaddrinfo ENOTFOUND <ref>.supabase.co
```

**Recovery:** open the link — it points at that project, not at the project
list — and press **Restore**. Restoring takes about a minute; the dashboard says
when it is done. Then run `npm run dev` again.

If the project is *not* paused, the same message means the URL is not answering,
so check `VITE_SUPABASE_URL` in `.env` against the dashboard.

A project that answers but rejects the key gets a different message, because it
is a different problem — usually the `service_role` key pasted where the `anon`
key belongs, or a key rotated since you last copied it.

`ENV-05` keeps the project awake with a scheduled ping, so this should be rare;
the recovery is documented because "rare" is not "never".

### Everyday commands

| Command | Does |
|---|---|
| `npm run dev` | preflight, then Vite with hot reload |
| `npm test` / `npm run test:watch` | the Vitest suite, once / on save |
| `npm run e2e` | the Playwright suite — phone viewport first (see `e2e/README.md`) |
| `npm run e2e:seed` · `npm run e2e:reset` | the E2E test-data lifecycle, one command each |
| `npm run lint` · `npm run lint:ds` | ESLint · the DS-08 adherence gate |
| `npm run gen:types` | regenerate `src/data/database.types.ts` from the migrations |
| `npm run build` | `tsc --noEmit` then the production build |

## The database, in TypeScript

Everything in `src/` that reads or writes the database goes through the typed
client in `src/data/supabase.ts`, and every type it uses comes from
`src/data/database.types.ts`, which is **generated and must not be edited**.

```sh
npm run gen:types              # rewrite src/data/database.types.ts
npm run gen:types -- --check   # prove it is current, writing nothing
```

Change a migration, run `npm run gen:types`, and commit the two together. The
enums the rebuild introduced — `session_focus`, `movement_pattern`,
`target_kind`, `revision_status`, `execution_status`, `distance_unit` — arrive
this way and nowhere else; a hand-maintained copy of a vocabulary is the drift
this command exists to prevent.

### Drift fails CI

`npm run gen:types -- --check` runs in the **Lint** job on every pull request,
and `src/test/generated-types.test.ts` asks the same question in the **Test**
job. Either one fails if the committed types are not byte-identical to what the
migrations produce, with the same fix in both cases:

```
FAILED — src/data/database.types.ts is not what the migrations produce.

The committed types and supabase/migrations/ have drifted apart.
Run `npm run gen:types` and commit the result.
```

### Why it reads SQL rather than asking the project

`supabase gen types` asks a running database what it holds. The reused project
still holds the *previous* schema: `docs/backend/live-inventory.md` holds every
push behind the off-machine-backup gate until `TASK-072`, so asking it today
would generate types for the schema this rebuild replaces. The generator
therefore reads the same migration SQL the CLI would apply — offline, opening no
connection and reading no credential. `supabase/migrations/` is the source of
truth for what the schema *is*; the live project is the source of truth for what
has been *applied*, and those stay different questions until the gate clears.

Two things it deliberately does not type: table relationships, because a join is
spelled in the select string rather than inferred, and views, whose column types
come from the planner rather than from their SQL text. Views are named in
`ViewName` so that one added later fails the check instead of arriving
unnoticed; the issue that first reads a view declares its row.

## Deployment

Vercel's Git integration owns when a deploy happens; `vercel.json` owns what it
builds and how it serves. Nothing here is triggered by hand:

- **Every pull request** gets its own preview URL, posted back on the PR.
- **Every push to `main`** promotes to the production URL. There is no manual
  promote step and no separate deploy workflow — adding one would mean two
  things deciding what production is.

`vercel.json` pins the build to `npm ci` + `npm run build` (the same command CI
and the release check run, so a preview cannot resolve a dependency the PR did
not pin) and publishes `dist/`.

### Why the rewrite exists

```json
{ "source": "/(.*)", "destination": "/index.html" }
```

CLEAR is a single-page app: only `/` exists as a file, and every other route is
resolved by React Router in the browser. Without the rewrite, loading or
refreshing `/history` asks the CDN for a file that was never built and gets a
hard 404 before any JavaScript runs — the route never reaches the router, so
the app's own 404 screen never gets the chance to render either. The catch-all
sends every path to `index.html` instead; static assets are unaffected because
Vercel serves a real file from `dist/` before it consults a rewrite.

`src/test/deploy-config.test.ts` compiles that `source` pattern and asserts it
matches representative deep links, so the guarantee is checked in CI rather
than remembered.

### Environment variables

`.env.example` is the list. It holds names and placeholders only; `.gitignore`
excludes every other `.env*` file so that one stays safe to commit. Locally you
copy it to `.env` — see *Getting the app running* above.

In Vercel the same names go under **Project Settings → Environment Variables**,
and they must be set for **Preview** as well as **Production** — a variable
added to Production alone leaves every PR preview running without it.

Only `VITE_`-prefixed names are inlined into the browser bundle, so only
browser-safe values may carry that prefix. The Supabase service-role key and
`ANTHROPIC_API_KEY` are not among them: they belong to CI/hosting secret
storage and Supabase Edge Function secrets respectively, and never become a
Vercel browser variable. `src/test/deploy-config.test.ts` fails if `.env.example`
ever grows a real-looking value or a `VITE_`-prefixed server secret.

## Reviewing a UI issue

Automated checks — the unit suite, and `axe-core` against every screen the E2E
suite visits — catch roughly a third of real accessibility problems. They are
the floor, and they are not the review.

**A UI issue is not reviewed until both passes below have been done and what
they found is written in the pull request.** Green checks with neither pass
recorded is an unreviewed change. Both are quick: a screen is a few minutes.

### The keyboard-only pass

Put the mouse away and drive the whole change with the keyboard.

- **Tab** reaches every interactive element, in an order that matches the
  visual order. The first Tab on any screen lands on the skip link, and
  activating it jumps to the main content.
- Focus is **visible on every stop** — a chamfered control shows its doubled
  border, everything else its outline.
- After navigating, focus lands on the new screen's `<h1>`, never back at the
  browser chrome.
- Submitting an invalid form moves focus to the first invalid control — from
  the shared helper (`useInvalidFocus` in `src/ui/formFocus.ts`), which is how
  every form in the app submits. A form that re-implements this fails the unit
  suite.
- **Esc** closes any dialog and never confirms. Nothing traps focus except an
  open dialog.

### The screen-reader pass

VoiceOver (macOS: ⌘F5) is the reference. Walk the change end to end.

- Navigating announces the screen's name once — no silence, no double
  announcement.
- The rotor's heading list reads as an outline: one h1, no skipped levels.
- Landmarks are one `main`, a `header`, and named `nav` regions — nothing
  important lives outside them.
- Every control announces a real name, a role, and its state (selected,
  invalid, expanded). Errors are read when they appear; only a destructive
  failure interrupts.
- Nothing meaningful is conveyed by colour or position alone.

### Reduced motion, while you are there

Turn the preference on (macOS: **System Settings → Accessibility → Display →
Reduce motion**; or in DevTools, *Rendering → Emulate CSS
prefers-reduced-motion*) and load the change again.

Everything must arrive **already finished**: no content missing because its
entrance was silenced, and nothing that has to be waited out before it can be
used. `e2e/reduced-motion.spec.ts` asserts this per screen and
`src/styles/reduced-motion.test.ts` holds the stylesheets to it, but only a
person notices the thing that is simply not there any more.

## Testing

The harness is Vitest + React Testing Library on jsdom, configured in
`vite.config.ts` with shared setup in `src/test/setup.ts`.

### The working loop

```sh
npm run test:watch
```

This is `vitest --watch`: keep it running while you work and it reruns the
affected tests on every save. `npm test` (`vitest run`) is the one-shot form —
the same command CI runs, so local and CI results are identical.

### Writing tests

- **Component tests** render through the helpers in `src/test/render.tsx`:
  `renderWithProviders(ui)` for a component in isolation,
  `renderApp(entries)` for the real route tree. Both mount the app's
  providers, so never wire providers inside a test.
- **Query by accessible role** and assert on user-visible output, not
  implementation details.
- **Domain fixtures come from `src/test/factories.ts`.** A test that
  hand-builds a domain object is a bug in the harness — extend the factory
  instead.
- **Interactions use `@testing-library/user-event`**; no synthetic
  `fireEvent` in new tests. Start each interaction test with
  `const user = userEvent.setup()` and use the returned user instance.

### Coverage

```sh
npm run test:coverage
```

Coverage is reported, never gated: no thresholds, just a visible number.
The text summary prints in the terminal and an HTML report lands in
`coverage/`.

### End to end

```sh
npm run e2e
```

Playwright, against a running app. With no `E2E_BASE_URL` it starts the dev
server itself, so this works from a clean checkout; CI sets that variable to the
pull request's Vercel preview deployment and the suite starts nothing.

**The default project is a phone** — 390×844, touch, coarse pointer. Desktop is
a second project, not the baseline. Everything else the suite does, and the two
lifecycle commands, is in **`e2e/README.md`**: read it before adding a spec.

Two things are worth knowing up front. There is no `page.goto` in a spec — the
`visit` fixture navigates *and* runs `axe-core`, so a screen cannot be reached
without being scanned. And the backend specs skip, with the reason printed, when
the three Supabase variables are not set: no credential is required to run the
suite, only to run all of it.
