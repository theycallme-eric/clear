# TASK-023 — Review Regenerate follows the entire workout (#650)

Body `clear-refinement-v2-20261109b`, attempt 1, base `db98523` (after TASK-022 #699). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-023 writes this file.

## Intended outcome

REQ-023 (AC-C50-01; C50, G15, R05), completion owner of JOURNEY-023 on `/review`: Regenerate
follows all workout content, including the Cooldown, with unchanged behaviour and navigation. The
accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`,
`/gallery/refinements?state=preparation`, ends its Review composition with Regenerate after the
Cooldown.

## Findings at the base

- `/review` already drew Regenerate after the sections map, so after TASK-022 the Cooldown guide
  preceded it. The R05 defect (Regenerate between conditioning and cooldown) was not present at
  `db98523`. The existing AC-021 case proved section headings preceded it, but not the Cooldown's
  movements or that nothing readable followed it.
- TASK-022's gallery `?state=preparation` Review context stopped at the Cooldown guide. The accepted
  reference draws Regenerate after it, so the consumer adoption was incomplete.

## Changes

- `src/app/Review.tsx`: the existing Regenerate row is now the exported owner
  `ReviewRegenerateAction({ disabled, onRequest })`, with the same `ActionRow`, secondary `lg`
  `Button`, `RefreshCw` icon and label. Review draws it in the same place, as the last item of the
  content stack. The confirmation (`RegenerateConfirmDialog`), its state, `onRegenerate` and
  `ReviewRoute` are unchanged. There is no restyle and no CSS.
- `src/dev/gallery-refinement-scenes.tsx`: in the `?state=preparation` Review context,
  `GalleryPreparation` draws `ReviewRegenerateAction` after the Cooldown guide, with Review's own
  `RegenerateConfirmDialog`. Both answers only close it. The gallery discards nothing, navigates
  nowhere, and reads or writes nothing. It adds no route CSS and no new register entry, because the
  owner lives in `src/app`.
- `src/app/review-screen.test.tsx`, AC-021 block only (check-01):
  - The primary case "is the last control in the scrolling content, after every section" also
    asserts these points: the spectrum ends with its Cooldown guide; Regenerate's row is the
    list's last element; the Cooldown's last movement precedes it; nothing readable follows it.
    Closed `<dialog>`s are not content.
  - It adds three `AC-C50-01` cases. The first covers the whole preparation workout, with and
    without a Cooldown. The second covers unchanged behaviour: Keep it, confirm once, and held
    while Start is in flight. The third covers the gallery state.
  - The existing confirm case is untouched. Other blocks are untouched.
- New `e2e/refinement/task-023.spec.ts` (check-02, 5 cases). The pattern is the contained
  synthetic app from TASK-022's spec, and the generation POST is held and never forwarded.
- New `evidence/refinement/task-023/required-cases.json` and guard receipts.

## Consumer sweep

These specs locate Regenerate by role and name or read Review's button order:

- `e2e/refinement/task-002.spec.ts` (order `… Tempo, Regenerate, Start workout`);
- `e2e/contained-shell.spec.ts`;
- `e2e/design-0143/workout-lifecycle.spec.ts`;
- `task-040-home-review` and `task-040-lifecycle`;
- `e2e/ui-polish-b05-swap.spec.ts`.

The markup, label, position and confirmation are unchanged, so none is superseded and none was
edited. The core-loop specs don't locate Regenerate.

## Failures and corrections

- Order of work: the `Review.tsx` extraction was written before the new cases, not strictly
  test-first. Mitigation: two mutation checks. With Regenerate moved above the Cooldown (the R05
  defect), 3 of 5 check-01 cases failed and 4 of 5 check-02 cases failed. The gallery case is
  independent of the route. The file was restored from a scratch copy and is green again.
- First unit run: the "nothing readable follows" helper found the closed confirmation `<dialog>`
  (jsdom keeps it in the DOM), so it now skips `dialog:not([open])`. Dialog dismissal is read as
  "not open" rather than "absent". The gallery case needed plain `render`: `renderWithProviders`
  nests a second router.

## Verification (exact results)

| Command | Result |
| --- | --- |
| `npm ci` | completed |
| `node scripts/refinement/run-required-check.mjs --task TASK-023 --check check-01 -- npx vitest run src/app/review-screen.test.tsx --testNamePattern "AC-021" --passWithNoTests=false` | PASSED: 35 total, 5 executed, 5 passed, 30 skipped (outside the pattern) |
| `node scripts/refinement/run-required-check.mjs --task TASK-023 --check check-02 -- npx playwright test e2e/refinement/task-023.spec.ts --project=mobile` (host lock) | PASSED: 5 total, 5 executed, 5 passed, 0 skipped |
| TASK-022 check-01 / check-02 guards (gallery `?state=preparation` changed) | PASSED 7/7, 4/4 |
| `npx tsc --noEmit -p .` | clean |
| `npx eslint` on the four changed source/spec files | clean |
| `npm test` | 268 files, 6297 tests passed |
| `npm run build` | exit 0 |
| `npm run lint:ds` | exit 0 |
| `node scripts/gallery-index.mjs --check` | 75 entries verified |
| TASK-015 check-02 guard (stale rejected base receipt, host lock) | PASSED 3/3 |
| `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-015,TASK-022,TASK-023,TASK-030,TASK-031,TASK-032,TASK-034` | PASSED (after the TASK-015 re-run; see the next section) |

Visual evidence: the check-02 cases attach the whole scrolling content and the scrolled-to-end
phone screen at 320 and 390, plus the gallery state at 320. Regenerate sits under the Cooldown's
last name with Start pinned below.

## Final evidence verifier

- First run: FAILED, on TASK-015 only. Its committed `check-02` receipt at base `db98523` is
  `rejected`, recording a runner error: "http://localhost:5173 is already used". That was an
  earlier environment port collision, unrelated to this task.
- Correction: I re-ran TASK-015's exact approved guard, without editing its manifest, under the
  host lock: `node scripts/refinement/run-required-check.mjs --task TASK-015 --check check-02 --
  npx playwright test e2e/refinement/task-015.spec.ts --project=mobile`. It PASSED: 3 total,
  3 executed, 3 passed. Its receipt `evidence/refinement/task-015/results/check-02.json` is
  refreshed in this candidate.
- Second run: `delivery evidence clear-refinement-20261103 --mode final: PASSED`. Every listed
  task has current passing receipts, TASK-023 included. TASK-022's re-run receipts were
  byte-identical.

## Open assumptions

- "Unchanged behaviour" is proved through the route's existing flow. The flow asks first. Keep it or
  Escape keeps the workout. Confirming runs the generation (or Generate when the request can't be
  restated, which is unchanged and not exercised here). Cancel lands on "Nothing to review".
- In the gallery, confirming only closes the dialog. It is presentation, with no synthetic writer.

## Next action

The controller commits and verifies.
