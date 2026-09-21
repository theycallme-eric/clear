# Project map

This is the honest ENV-01 scaffold. Update it only when a directory boundary or data flow changes.

| Path | Boundary | New files belong here when… |
|---|---|---|
| `src/app/` | App composition and routing | adding a route, screen, or route-level boundary |
| `src/data/` | External data and persistence | talking to Supabase, the catalog, or another backend |
| `src/state/` | Client state | adding a query hook, state machine, or cross-screen workflow |
| `src/ui/` | App-owned presentation | adding a reusable domain component not supplied by the design system |
| `src/design-system/` | Vendored public design surface | integrating a versioned export in DS-01; never for app-owned components |
| `src/styles/` | App-owned CSS the export does not ship | composing the shipped motion vocabulary or skin; never new visual ideas or raw values |
| `src/test/` | Shared test setup | adding test-only configuration or helpers |
| `docs/` | Frozen baseline and deep specs | recording product/design/process knowledge, not runtime code |
| `docs/backend/` | REQ-008 backend gate: live inventory, dispositions, rollback, post-cutover checks, and read-only evidence from the previous app | recording reused-Supabase-project audit state; never runtime code |
| `supabase/` | The Supabase CLI's project root: `config.toml` and the migration series | changing how the CLI reaches the project; never application code |
| `supabase/migrations/` | Schema as SQL, one migration per domain, applied in order by foreign key. Also holds the reused project's inherited history as no-op markers — see its README | adding or amending a schema domain; never seeds, which are DATA-02's |
| `scripts/` | Repository automation | adding a deterministic local or CI maintenance command |
| `scripts/backend-audit/` | Read-only inventory and snapshot tooling for the reused Supabase project (`npm run backend:prereqs` / `backend:inventory` / `backend:snapshot`) | adding audit/snapshot capture steps; never mutation |
| `scripts/adherence/` | The DS-08 adherence gate (`npm run lint:ds`) and its fixtures: the vendored rule set raised from `warn` to `error` | changing how design-system adherence is enforced; never for the rules themselves, which come from the export |
| `.github/workflows/` | GitHub automation: pull-request checks (`ci.yml`) and scheduled project maintenance (`keep-alive.yml`, the only job that reaches Supabase from CI) | adding a required repository check, a deployment workflow, or a scheduled job |
| `vercel.json` | The deploy contract: build command, published directory, SPA rewrite | changing how a deploy is built or how the host resolves a URL; never for when a deploy runs, which is Vercel's Git integration |
| `.env.example` | The environment contract: every variable a run or a deploy needs, names and placeholders only | introducing a variable; never a real value, and never a server-side secret under a `VITE_` prefix |
| `.claude/skills/` | Claude Code project entry points | exposing a reusable workflow to Anthropic tooling |
| `.agents/skills/` | Codex project entry points | exposing the same reusable workflow to Codex |

Current flow is `index.html → src/main.tsx → src/app/ErrorBoundary.tsx → src/app/router.tsx →
RootLayout → AppChrome → screens`. The CORE-04 boundary sits above the router. `RootLayout` mounts
the DS-06 atmosphere once and sets `data-atmosphere` from `src/app/atmosphere.ts`; a screen never
mounts an atmosphere of its own. `AppChrome` owns the skip link, route-change focus, and polite route
announcer. Every screen renders inside the `Screen` primitive, which owns the `<main>` landmark, the
single `<h1>`, and the document title (CORE-05). Data-driven views use the shared four-state contract
(`src/state/view-state.ts` + `src/ui/view-state.tsx`, documented in
`docs/conventions/state-contract.md`). Data boundaries are stubs until their DAG issues land. No
backend client exists yet.

The database is a second, independent flow: `supabase/migrations/` → the reused Supabase project.
DATA-01a adds the catalog domain — exercise definitions, the component→pattern map, muscle
mappings, the authored pattern weighting, and the three derived views. Catalog tables are readable
by authenticated users and writable only by the service role, and that is the convention every
later catalog table follows. Nothing in `src/` reads them yet; DATA-03 adds the typed client.
Migrations are authored and dry-run only until the off-machine-backup gate in
`docs/backend/live-inventory.md` clears.
