# CLEAR visual library

Use `/gallery` or `/gallery/app` for actual app components. Both use the same
register and styles as the development gallery. This branch is a source
proposal; deployment and visual approval are recorded separately.

## Find and reuse

- Start with [the component index](COMPONENTS.md), generated from
  `src/dev/gallery-registry.tsx`. Read the linked implementation for its API.
- App presentation lives in `src/ui/`; screens/state owners live in `src/app/`
  and `src/state/`. Keep related visual parts shared and distinct behavior with
  its owner. Existing private parts are not automatically new public components.
- Follow [the active three-delivery plan](PLAN.md). The first consolidation and
  comparison targets related Review, History and Favorites presentations.
- Regenerate the index with `node scripts/gallery-index.mjs` after register
  changes; `--check` verifies that the generated file is current.

## Request a gap

Record four things in the issue/PR before requirements consume a new contract:

1. The user need, screen/state and existing options checked.
2. Why those options do not fit and the smallest proposed extension.
3. The owning source and affected consumers or intentional variants.
4. An actual-component preview and the relevant acceptance checks.

Design experiments use isolated branches. Show source-labeled current/proposed
examples, review material visual changes, then carry the approved component,
source/state and evidence links through requirements and integration. An
appearance-preserving refactor needs verification, not invented design approval.
Use the existing issue/PR for these references; no separate sidecar is required.

## Examples and limits

The current register has 49 entries and 131 initial examples. It covers 48 app
UI exports plus contextual Input; important live/session owners still need safe
fixtures. Use actual implementations with deterministic data/controllers, no
live account writes and no shipped test harness. Add coverage in useful slices.
Do not copy a historical pattern merely because it has an example.

The 0.14.3 foundation remains an immutable import. App-owned styles/components
are editable; revisit foundation authoring when a real foundation edit is
wanted. Historical archive pages stay at `/dev/gallery/ds` in development.
Their FormField/OverflowRail accessibility findings remain reference findings;
public archive delivery is deferred.

[Released-batch UAT guide](REVIEW-GUIDE.md). Shared implementation changes should
update the relevant examples and check actual consumers using existing tests.
Merge and production release remain separate from visual approval.
