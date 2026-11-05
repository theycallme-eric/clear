# TASK-001 — Shared movement hierarchy and peer grouping

Body `clear-refinement-20261103` · issue #628 · REQ-001 · JOURNEY-001 (completion owner) · branch
`agent-runner/task-001-a1-627ef3aa`. Task-owned progress record: for this body it satisfies the older
shared-daily-journal requirement (owner-selected policy); the required contents are kept below.

## Outcome

Review (`/review`) and the active Workout (`/workout`) draw one movement hierarchy and one peer list
from the accepted gallery reference `eded158` (`/gallery/refinements?state=cards`): prominent name,
quiet equipment beside it, prescription and prescribed load below, action/progress in their own
slot (C01); no Last-performance row, prescribed load kept (C02); rules only between peers, no final
rule and no grouping rail (C04).

## Changes

- `src/ui/refinements/movement.tsx` — `MovementIdentity`, `MovementList`, `MovementGroupHeader`,
  `distinctLoad`. The reference's `movement.tsx` and the card composition of `workout-card.tsx` are
  consolidated here; the card itself stays the existing `BlockPanel`/Review owners, so no second
  card component exists.
- `src/ui/refinements/presentation.css` — composed only from existing Foundation tokens. It
  declares no new variables, so no `tokens.css` layer was needed for this task.
- Consumers: `Review.tsx` and `review-exercise-row.tsx` (Review); `block-renderers-frame.tsx`,
  `set-logger.tsx`, `superset-block.tsx`, `circuit-block.tsx` (Workout). The superset pair rail and
  Review's group rail are removed. `loadText` accepts a `null` guidance so Workout states the same
  prescribed load as Review.
- Gallery: `gallery-registry.tsx` / `gallery-comparisons.tsx` cards state adopts the real owners.
- Tests: `src/ui/movement-list.test.tsx` (9 named cases), `e2e/refinement/task-001.spec.ts`
  (6 named cases, phone/tablet/desktop × /review, /workout), `evidence/refinement/task-001/`.

## Failures and corrections

- Attempt 1 failed controller `npm run build`: unused `CSSProperties` import in
  `superset-block.tsx` (TS6133). It had already been removed when attempt 2 started; build passes.
- `npm test` then had 10 failures. Eight were older tests asserting the superseded layout
  (equipment row below the prescription, inline per-row rules, the superset pair rail, the
  `Equipment ·` prefix). They now assert the REQ-001 structure: `review-screen.test.tsx`,
  `set-logging-sheet.test.tsx`, `superset-block.test.tsx`.
- One was a real regression: a standard movement's `Bodyweight` load was being dropped. Load
  deduplication against equipment now applies only inside rounds, as before.

## Verification (attempt 2, final tree)

- check-01 (`movement-list.test.tsx`): PASSED, 9/9 required cases, 9 executed.
- check-02 (`task-001.spec.ts --project=mobile`): PASSED, 6/6 required cases, 6 executed.
- `npm run build`: pass. `npm run lint:ds`: pass.
- `npm test`: 6076 passed, 2 failed — both in `src/test/design-0143-final-audit.test.ts`.

## Unresolved

- The 0.14.3 final audit binds the runtime source hash (`index.html` + `src`, excluding tests,
  `src/dev` and the design system) to `docs/design/CLEAR-0.14.3-FINAL-AUDIT.md` and to TASK-034's
  captured records. Any runtime change fails those 2 tests until the audit is re-derived by the
  authenticated collector, which needs a privileged backend. That was not authorized here and it
  is not this task's output. Every refinement task that changes runtime source will hit it. The
  owner needs to decide how this body re-derives or rebinds that audit.
- `e2e/ui-polish-b05-review-groups.spec.ts` (TASK-010, B05-04 reference) still reads the old
  `[nameRow, prescription, equipment]` order and a per-row rule. It was not run in this session
  because of permissions, and it is expected to fail until it is re-pointed at the REQ-001
  hierarchy.
- Next safe action: owner decision on the audit binding; then update the B05 spec in its own issue.

## Owner-authorized verification recovery — 5 November 2026

The two remaining failures bind current runtime/driver hashes to the last accepted Format Preview capture. They are genuine source-freshness requirements rather than observed UI regressions. Keep the assertions, old captures and historical native receipt unchanged. Freeze this candidate and run the unchanged authenticated mobile collector into a new task-owned evidence group, using the existing namespaced disposable fixture with generation blocked, then rerun ordinary native recovery. No old record is relabelled as current and no check is skipped. Capture/verification results follow below only after actual execution.
