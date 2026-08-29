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
| `scripts/` | Repository automation | adding a deterministic local or CI maintenance command |
| `.claude/skills/` | Claude Code project entry points | exposing a reusable workflow to Anthropic tooling |
| `.agents/skills/` | Codex project entry points | exposing the same reusable workflow to Codex |

Current flow is only `index.html → src/main.tsx → src/app/router.tsx`. Data and state boundaries are
stubs until their DAG issues land. No backend client exists yet.
