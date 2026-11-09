# TASK-001 — Shared movement hierarchy and peer grouping (#628)

Body `clear-refinement-v2-20261109b`, attempt 1, base `931c3e7`. Task-owned progress note (the
approved exception to the shared daily journal for this body). Only TASK-001 writes this file.

## Intended outcome

REQ-001 (C01, C02, C04; G01, R02, R28, R30, R31, R75, R97, R132) delivered through the shared owners
`MovementIdentity` / `MovementList` / `MovementGroupHeader` in `src/ui/refinements/movement.tsx`
(accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, REUSE.md), adopted by the
real `/review` and `/workout` routes (JOURNEY-001), with the stable gallery state
`/gallery/refinements?state=cards`.

## Changes

- New shared owner `src/ui/refinements/`: `movement.tsx`, `presentation.css` (movement recipes
  only), `tokens.css` (canonical semantic variables `--movement-peer-gap`, `--movement-tier-gap`,
  both resolving to Foundation spacing tokens), `movement-readings.ts` (shared name / equipment /
  prescribed-load readings through Review's existing `loadText` and the profile unit).
- Deliberate consolidations over the reference recipe: equipment sits beside the name element
  rather than inside the heading (heading accessible names stay the movement name); the name and
  equipment share one wrapping flex row; optional `extra` (Review's own rest) and `children`.
- Review: `ReviewBlockRows` moved unchanged in behaviour to `src/ui/review-block.tsx` so the gallery
  renders the route's consumer; groups use `MovementGroupHeader` + `MovementList`; the inner
  grouping rail (`borderInlineStart`) and per-row inline rules were removed; standard blocks are a
  `MovementList` too. `ReviewExerciseRow` is `MovementIdentity` with Swap in the action slot.
- Workout: `BlockPanel`'s top row is `MovementGroupHeader`; `BlockPanel.MovementList` delegates to the
  shared `MovementList`; `BlockPanel.Movement` is `MovementIdentity` (heading) with new `ordinal`
  and `load` props. `ExerciseSetLogger` and the closed circuit row now show the prescribed load
  (R31) beside the prescription and compact equipment beside the name (was `Equipment · x` line).
  Superset's left rail (`PAIR_STYLE`) removed (C04, R28, R75).
- C02: there was no Last-performance row on current main movement rows; the change keeps none,
  keeps the prescribed load, and keeps the OVR-01c suggestion (history-derived) intact.
- Gallery: `/gallery/refinements?state=cards` (`src/dev/gallery-refinements.tsx`,
  `gallery-refinement-cards.tsx`, `gallery-refinement-cards-data.ts`), nav link, four registry
  entries; `docs/design/library/COMPONENTS.md` regenerated. `PROJECT_MAP.md` row for the new dir.
- Tests: new `src/ui/movement-list.test.tsx` (7 cases), new `e2e/refinement/task-001.spec.ts`
  (9 cases, synthetic contained lane at 320/390/768/1280), `src/test/peer-grouping-fixture.ts`,
  `evidence/refinement/task-001/required-cases.json`. Updated assertions that encoded superseded
  decisions: superset rail case (now asserts no rail), Review B05-04 separate equipment line and
  inline per-row rule (now R132 inline equipment + shared peer list), set-logging-sheet order case.

## Failures and corrections

- Accessible name lost a space when the ordinal span contained a trailing space: moved the space
  to a text node between spans.
- jsdom does not parse `flex: 1 1 0`; used the equivalent `1 1 0%`.
- axe `empty-heading` fired at desktop when scanning during the Workout entry transition; the spec
  now waits for finite animations to finish before reading or scanning (same as existing B05 specs).
- `block-completion-ownership` forbids a second `BlockCompletionContext` provider: the gallery's
  Workout side no longer uses `BlockPanel`; it draws the same shared header and frame list.

## Owner-authorized change (2026-11-09)

- Owner decision 2026-11-09 (Eric), recorded in the Agent Runner V2 ledger (body
  `clear-refinement-v2-20261109b`, resume-authorized entry): AUTHORIZED, ONE-TIME, NARROW change to
  `src/test/design-0143-final-audit.test.ts` so the CLEAR 0.14.3 final audit is treated as historical
  proof of the tree it was captured on. Requirements were not re-approved.
- Exactly two tests changed, each renamed to say it verifies the captured (historical) source and
  commented with the owner decision:
  - eight-cell mobile group test: `validateFormatPreviewEvidence` now receives the runtime source hash
    recorded in the capture records (asserted 64-hex and named in the audit) instead of
    `currentFormatRuntimeHash(root)`. All byte, pixel, manifest, session, screenshot, package, driver,
    lineage and ancestry assertions are unchanged. The now-unused `currentFormatRuntimeHash` import
    was removed.
  - audit binding test: `hashTree(src/design-system) === PACKAGE_HASH` unchanged; the current-src
    runtime hash requirement is replaced by: capture records agree on one runtime source hash, it is
    64-hex, and the audit names it.
- No audit document, capture record or evidence file was edited.

## Verification (this worktree, uncommitted candidate, 2026-11-09)

- `node scripts/refinement/run-required-check.mjs --task TASK-001 --check check-01 -- npx vitest run src/ui/movement-list.test.tsx --passWithNoTests=false` — PASSED, 7/7 executed and passed.
- `node scripts/refinement/run-required-check.mjs --task TASK-001 --check check-02 -- npx playwright test e2e/refinement/task-001.spec.ts --project=mobile` — PASSED, 9/9 (synthetic origin; no credentials used).
- `npm run build` — exit 0. `npm run lint:ds` — exit 0.
- `npm test` — 251 files, 6078 tests passed, 0 failed (after the owner-authorized audit-test rebind;
  before it, the 2 design-0143 final-audit runtime-hash tests failed).

## Open assumptions / unresolved

- Resolved 2026-11-09 by the owner-authorized rebind above (the audit hash was not hand-edited).
- Existing `e2e/ui-polish-b05-review-groups.spec.ts` / `ui-polish-b05-active-hierarchy.spec.ts`
  encode B05-04 (separate equipment line, superset rail) superseded by R132/C04, and read reference
  images from an `.evidence` dir absent here; they were not run or rewritten.
- Section/block spacing between complete groups (C05/R111 multi-movement rhythm) is only the shared
  peer gap; no separate inter-block spacing change was made.

## Repair round 1 (2026-11-09)

Documentation-only repair from the reviewer verdict. No product code, test or evidence changed.

- Shared owner `src/ui/refinements/workout-card.tsx`: deliberately deferred, not adopted or
  consolidated in TASK-001. The file does not exist at base `931c3e7` and this candidate does not
  create or import it. In the accepted gallery reference (`eded158`), REUSE.md assigns it "Review
  versus Workout actions, preparation and format-card composition". Its reference content
  (`RefinementWorkoutCard`, `RefinementWorkoutHeader`, `RefinementPreparation`) is a timed-format card
  (EMOM/AMRAP/For Time meta line, `DeadlineTimer` session header, per-movement notes, warm-up card)
  composed over `MovementIdentity` / `MovementList` / `MovementGroupHeader`. TASK-001's movement
  hierarchy and peer grouping (C01, C02, C04, AC-R001-01/02, JOURNEY-001) is fully carried by the
  shared `src/ui/refinements/movement.tsx` owner, adopted on real `/review` and `/workout`. The card
  composition belongs to the later timed-format/card tasks. This brief does not name which task IDs
  own them, so none are assigned here. Those tasks should create `workout-card.tsx` on top of
  `movement.tsx` rather than adding a look-alike in a route.
- Follow-up (not TASK-001 scope): `e2e/ui-polish-b05-review-groups.spec.ts` and
  `e2e/ui-polish-b05-active-hierarchy.spec.ts` still assert B05-04 decisions (separate equipment
  line, superset rail / context tiers) that R132/C04 supersede. They read reference images from an
  absent `.evidence` folder and are local-only (excluded in `playwright.config.ts` for non-local
  targets). They are not in CI or in this task's verification commands, and they were not run or
  rewritten. A follow-up should rebase them on R132/C04, or retire the superseded cases, where the
  reference assets exist.
- Re-verification after this note: see the controller report for this repair round
  (`npm test`, check-01, check-02).

## Next action

Controller verification and commit.
