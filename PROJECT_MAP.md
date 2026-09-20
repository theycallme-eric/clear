# Project map

This is the honest ENV-01 scaffold. Update it only when a directory boundary or data flow changes.

| Path | Boundary | New files belong here when… |
|---|---|---|
| `src/app/` | App composition and routing | adding a route, screen, or route-level boundary |
| `src/data/` | External data and persistence | talking to Supabase, the catalog, or another backend |
| `src/state/` | Client state | adding a query hook, state machine, or cross-screen workflow |
| `src/ui/` | App-owned presentation | adding a reusable domain component not supplied by the design system |
| `src/design-system/` | Vendored public design surface | integrating a versioned export in DS-01; never for app-owned components |
| `src/test/` | Shared test setup | adding test-only configuration or helpers |
| `docs/` | Frozen baseline and deep specs | recording product/design/process knowledge, not runtime code |
| `docs/backend/` | REQ-008 backend gate: live inventory, dispositions, rollback, post-cutover checks, and read-only evidence from the previous app | recording reused-Supabase-project audit state; never runtime code |
| `scripts/` | Repository automation | adding a deterministic local or CI maintenance command |
| `scripts/backend-audit/` | Read-only inventory and snapshot tooling for the reused Supabase project (`npm run backend:prereqs` / `backend:inventory` / `backend:snapshot`) | adding audit/snapshot capture steps; never mutation |
| `scripts/adherence/` | The DS-08 adherence gate (`npm run lint:ds`) and its fixtures: the vendored rule set raised from `warn` to `error` | changing how design-system adherence is enforced; never for the rules themselves, which come from the export |
| `.github/workflows/` | GitHub pull-request automation | adding a required repository check or deployment workflow |
| `.claude/skills/` | Claude Code project entry points | exposing a reusable workflow to Anthropic tooling |
| `.agents/skills/` | Codex project entry points | exposing the same reusable workflow to Codex |

Current flow is only `index.html → src/main.tsx → src/app/ErrorBoundary.tsx → src/app/router.tsx`;
the boundary is the CORE-04 crash catch above the router. Data-driven views render their state
through the shared four-state contract (`src/state/view-state.ts` + `src/ui/view-state.tsx`, see
`docs/conventions/state-contract.md`). Data boundaries are stubs until their DAG issues land. No
backend client exists yet.
