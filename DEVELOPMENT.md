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
| `npm run lint` · `npm run lint:ds` | ESLint · the DS-08 adherence gate |
| `npm run build` | `tsc --noEmit` then the production build |

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

Automated checks (unit tests today, `axe-core` in the E2E suite once ENV-07
lands) catch roughly a third of real accessibility problems. They are the
floor. Reviewing any UI issue includes two manual passes:

### The keyboard-only pass

Put the mouse away and drive the whole change with the keyboard.

- **Tab** reaches every interactive element, in an order that matches the
  visual order. The first Tab on any screen lands on the skip link, and
  activating it jumps to the main content.
- Focus is **visible on every stop** — a chamfered control shows its doubled
  border, everything else its outline.
- After navigating, focus lands on the new screen's `<h1>`, never back at the
  browser chrome.
- Submitting an invalid form moves focus to the first invalid control.
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
