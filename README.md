# CLEAR

AI-powered workout generator. The application shell is React 19, TypeScript strict, and Vite;
the approved requirements, specs, design export, and dependency graph live under `docs/`.

## Start in three commands

```sh
npm install
cp .env.example .env     # then fill in the two Supabase values
npm run dev
```

Development runs against the hosted Supabase project — there is no local database to install or
start. `.env.example` lists every variable a run or a deploy needs; both values come from the
Supabase dashboard under Project Settings → API.

`npm run dev` preflights before Vite starts: a variable that is missing or still holding its
placeholder is named on its own line, and a paused project prints the link that resumes it. No
stack traces. [DEVELOPMENT.md](DEVELOPMENT.md#getting-the-app-running) has the full flow and the
paused-project recovery.

The development server prints its local URL. The root route renders the app shell and unknown
routes render the 404 fallback.

## Deploys

Vercel deploys every pull request to its own preview URL and every push to `main` to production,
with no manual step. `vercel.json` holds the build contract and the SPA rewrite that lets a deep
link such as `/history` survive a refresh. See
[DEVELOPMENT.md](DEVELOPMENT.md#deployment) for the environment-variable contract and why the
rewrite exists.

## Keeping Supabase awake

The Supabase project is on the free plan, which pauses it after seven days without activity —
and a paused project greets the next person with connection errors rather than an app.
`.github/workflows/keep-alive.yml` prevents that: every Monday and Thursday it makes one
authenticated read against the project's REST API with the browser-safe anon key, discards the
response, and fails loudly if the project does not answer. It writes nothing, and the run
summary on a red run names the likely cause — paused project, rotated key, or unset secret.

It needs two repository secrets, `SUPABASE_URL` and `SUPABASE_ANON_KEY`, and it can be run on
demand from the Actions tab.

**Delete the workflow and both secrets the day the project moves to a paid plan.** Paid projects
do not pause, and a scheduled job with no remaining reason is one nobody later dares remove.

## Validate before pushing

```sh
npm run lint
npm run lint:ds
npx tsc --noEmit
npm test
npm run build
```

## The adherence gate (`npm run lint:ds`)

A hardcoded hex, a raw px value, or a font the design system does not ship is a
review-blocking defect — `lint:ds` makes it a failing build instead. It lints `src/`, and it
also catches an unknown prop, an out-of-range `variant`, and an import that reaches past the
public entry into a component's internals.

The rules are not written in this repo. They are read from the vendored export at
`src/design-system/_adherence.oxlintrc.json`, which ships every rule as `warn`; the gate
raises each one to `error` (see `scripts/adherence/ds-config.mjs`). Regenerate the design
system and the gate follows it. Three deliberate adjustments, each one documented at the
point it is made:

- `src/design-system/` is excluded — it declares the tokens, it does not consume them.
- Tests may write `'0px'` in an assertion: reading a rendered value back is not styling. Only
  the three raw-literal rules relax there; props, enums and imports stay enforced.
- Components whose props extend a React DOM attributes interface (`<Dialog onCancel>`) keep
  their enum rules but not the unknown-prop rule — the export's generated prop list carries
  only each component's own props, and `tsc --noEmit` is the exact check for the rest.

Inline `eslint-disable` comments do not apply to this config. `scripts/adherence/fixtures/`
holds one deliberately broken file per violation; `src/test/adherence-gate.test.ts` fails if
any of them stops being caught.

## Fonts

CLEAR's three families are Rajdhani (display), Oxanium (data) and Space Grotesk (body), and
they are meant to be served from this app's own origin — the export's CDN delivery is four
sequential, render-blocking round trips on every cold load. The app therefore loads the
app-owned `src/styles/skin-clear.css` and never the vendored `css/skin-clear.css` that carries
the Google Fonts `@import`. `src/styles/fonts.test.ts` fails if any stylesheet the entry point
imports, or `index.html`, ever reaches `fonts.googleapis.com` or `fonts.gstatic.com` — a
preconnect included.

**The self-hosted faces are not in the tree yet.** They come from three Fontsource packages,
and the workspace this was built in has no package registry. Until they are installed the
three roles render in their fallback stacks. The exact remaining step is written at the foot
of `src/styles/skin-clear.css`.

No CSS framework or component library is used. `DS-01` will vendor the approved public design
system into `src/design-system/`; until then the shell intentionally uses browser-default styling.

Read [PROJECT_MAP.md](PROJECT_MAP.md) before adding a file and
[docs/process/AGENT_PLAYBOOK.md](docs/process/AGENT_PLAYBOOK.md) before selecting work.

For the reconciled build sequence, current state, backend/key gates, and the distinction between an
installable shell and a useful PWA, read
[docs/process/IMPLEMENTATION_PLAN.md](docs/process/IMPLEMENTATION_PLAN.md).
