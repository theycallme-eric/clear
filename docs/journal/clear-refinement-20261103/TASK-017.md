# TASK-017 — Readable movement groups and label/control rhythm (#644)

Body `clear-refinement-v2-20261109b`, attempt 1, base `d7e5ccd` (after TASK-016 #702). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-017 writes this file.

## Intended outcome

REQ-017 (AC-C05-01, AC-C42-01, AC-C47-01, AC-R017-01–03; TASK-AC-0C1431FDDA19,
TASK-AC-9B1E8E32EE3B, TASK-AC-582934B08D11). Role: **foundation provider** for JOURNEY-017; no
completion ownership. Deliver shared movement-group and label/control spacing contracts, with
focused representative-consumer tests:

- C05 / R111: complete movement-entry groups stay together, with slightly more space between groups,
  never between the fields of one movement;
- C42 / R108, R109: choice-label gaps match the field rhythm; the good Rounds completed heading gap is
  kept; the dynamic completion count gets breathing room after the tiles;
- C47 / R112: the superset's added "Tick each movement…" / "blank field…" paragraph is removed, with
  no replacement prose and no change to performed/unrecorded semantics.

Not claimed: no logging route has adopted the focused frame. TASK-043–046 migrate consumers; TASK-041
owns full-route JOURNEY-017 visual and geometry closure.

## Decisions (from the sources; recorded rather than asked)

- **Values are the accepted reference's** (eded158c…, `tokens.css` / `presentation.css`):
  `--logging-label-gap` = `--spacing-200`, `--logging-count-gap` = `--spacing-400`,
  `--logging-movement-gap` = `--spacing-300` (extra space between two complete groups, added to the
  form's own gap, as in the reference's `.clr-accepted-form__movement + .clr-accepted-form__movement`).
  The R7 replay used the same label and count values.
- **Variable name realigned.** TASK-015 had used `--logging-movement-gap` for the gap *inside* one
  timed movement group. REUSE.md names it as the separation between movement groups, so that name now
  has the reference's meaning. TASK-015's inner value moves unchanged to
  `--logging-movement-field-gap` (`--spacing-300`). Nothing renders differently inside a group.
- **Cause of the cramped choice labels (R108).** Foundation's `ChoiceGroup` is a flex-column fieldset
  with `gap: --spacing-200`, but a rendered `<legend>` is not a flex item, so the gap never reached it:
  legend to chips was 0 px. Confirmed in Chromium with a static scratch page under the host lock (no
  product route): gap-only fieldset, legend→control 0 px; with the new legend margin, 8 px. The fix
  sets the legend's own `margin-block-end: var(--logging-label-gap)` in `.clr-timed-log` (inline or
  held), `.clr-accepted-log` (anything the frame holds) and `.clr-logging-movement`. It excludes
  `.clr-ladder-completion`.
- **"Matching fields".** The log's own labelled field (`.clr-timed-field`, QuantitySelector) keeps
  `--spacing-200` between its label and control, which is the step `--logging-label-gap` resolves to.
  TASK-009's check pins that rule to the literal `var(--spacing-200)`, so it stays literal. Equality is
  proved by resolution, and TASK-009's case is not edited. Foundation's `Input` keeps its own internal
  4 px label gap (Foundation-owned, unchanged).
- **Rounds completed heading gap kept** at its existing `--spacing-200` (the ladder's own rule,
  untouched). The reference raised it to `--spacing-300` inside its dialog, but the requirement says to
  keep the gap the owner called good, and `ladder` is not one of this task's gallery states.
- **Count gap.** `.clr-ladder-completion` used a flex gap of 8 px for tiles, count and partial line.
  Its gap is now 0 and each item has an explicit margin: the count `--logging-count-gap` (16 px, was
  8), the partial line `--spacing-200` (unchanged 8 px). The rule is scoped to
  `.clr-ladder-completion > …`. The live prescription's count line (TASK-013) is not touched.
- **Movement-group contract.** `.clr-logging-movement + .clr-logging-movement { margin-block-start:
  var(--logging-movement-gap) }`. Adopted by TimedResultLog's per-movement groups (24 → 36 px between
  two movement groups; 12 px inside one; other sections keep 24 px) and by the superset round's
  movement groups (8 → 20 px between groups; 8 px inside one; the sheet's own stack is unchanged).
- **C47.** The sentence appeared in exactly one place: the `context` prop of `SupersetRoundSheet` in
  `src/ui/set-logger.tsx`. It was not in any spec, gallery state, register entry or doc. The prop is
  now omitted. `SetLoggingSheet.context` becomes optional and draws no paragraph when absent. Every
  other caller still passes its movement line. Performed, blank-is-null and validation logic are
  unchanged.

## Gallery authority dispositions (`templates/gallery-authority.md`)

- `?state=for_time`: actual consumer adoption through the route's own `ForTimeBlock`. The capped
  race's wall ball / burpee groups sit apart, and Work completed / Effort sit at the label gap. Proved
  in check-01's JOURNEY-017 case. The `amrap`, `ladder` and `ladder-long` states get the same rhythm
  through the same shared owner.
- `?state=superset`: **does not exist at this base.** It arrives with the superset's move into the
  frame (TASK-044). It is not created here, so there is no gallery-only form and no synthetic writer.
  The route's own `SupersetRoundSheet` carries the change and is tested directly.
- No route CSS was duplicated. All rules are in `presentation.css` over `tokens.css`.

## Changes

- `src/ui/refinements/tokens.css`: `--logging-movement-field-gap` (TASK-015's value),
  `--logging-movement-gap` (reference meaning), `--logging-label-gap`, `--logging-count-gap`.
- `src/ui/refinements/presentation.css`:
  - the movement group's inner gap now uses the field-gap variable;
  - new `.clr-logging-movement` sibling rule;
  - new legend rhythm rule;
  - `.clr-ladder-completion` gap 0, with explicit count and partial margins.
- `src/ui/refinements/timed-result-log.tsx`: movement groups carry `clr-logging-movement`; docblock.
- `src/ui/set-logger.tsx`: helper context removed; movement groups carry `clr-logging-movement`;
  docblock.
- `src/ui/set-logging-sheet.tsx`: `context` optional, with no paragraph when absent.
- `src/dev/gallery-refinement-forms.tsx` (docblock dispositions) and `src/dev/gallery-registry.tsx`
  (one TASK-017 sentence in TimedResultLog's summary). `docs/design/library/COMPONENTS.md` regenerated
  (`node scripts/gallery-index.mjs`, 76 verified).
- `src/ui/logging-overlay.test.tsx`: header note, cascade/token helpers, and a new describe block
  "TASK-017 movement groups and label/control rhythm" (7 cases). TASK-016/018 cases untouched.
- New `evidence/refinement/task-017/required-cases.json` (7 required cases) and its receipt.
- Receipts refreshed: TASK-016 check-01 and TASK-018 check-01 (their target file changed).

## Tests (check-01, `--testNamePattern "group|spacing|helper"`)

jsdom has no layout, so spacing is read from the cascade. Every top-level rule of Foundation,
`set-effort.css` and `presentation.css` is matched against the rendered element. The winner is picked
by specificity, then order, with the inline style first. Its variable is then resolved through
`tokens.css` to the Foundation step in px.

1. AC-C05-01 timed log groups: For Time Incomplete (wall ball + burpee). The test checks this inline
   and inside `LoggingOverlay`. It checks:
   - each group holds its own fields;
   - 12 px inside a group;
   - 24 px before the first group and 36 px before the second;
   - 24 px before the effort group.
2. AC-C05-01 superset groups: identity, Performed, measures and effort stay in each group, and the
   groups are siblings. 8 px inside a group and 20 px between groups.
3. AC-C47-01 helper (consumer): no sentence and no tick/blank/not-recorded prose. The only paragraphs
   are the two movement lines. Log round stays disabled until something is identified. A ticked movement
   with blank reps logs `{ setNumber: 1 }`, and the unticked partner logs nothing.
4. AC-R017-03 helper (sweep): neither sentence appears anywhere under `src/` or `e2e/`, except in this
   test file.
5. AC-C42-01 label rhythm: Work completed and Effort · optional (inline and in the frame), each superset
   movement's Effort, and Workout feedback's feeling in the frame all sit at the label gap. That gap
   equals `.clr-timed-field`'s gap (8 px).
6. AC-R017-01 ladder at 4 and 12 rounds:
   - the heading gap is still `var(--spacing-200)`;
   - the count is 16 px after the tiles and still truthful;
   - the partial line is 8 px under the count;
   - the Work completed legend is at the label gap.
7. JOURNEY-017 gallery `for_time`:
   - the capped race's second group is 36 px out;
   - its legends are at 8 px;
   - the finished race's single group has no extra margin;
   - no logging dialog is on the page and there are no fetches.

Tests-first: before any implementation, all 7 failed (selected 7, 17 skipped). That confirms none of
TASK-016/018's cases match this pattern.

## Sweep

- Helper sentence: no other occurrence anywhere (case 4).
- Superset consumers: `SupersetBlock` (unchanged API), `superset-logging.test.tsx`
  (performed/blank semantics, passing in `npm test`). The e2e superset specs
  (`ui-polish-b05-sheet-surface/rest-log/movement-countdown/active-hierarchy`, `ui-polish-integrated`)
  locate the round by form/group/role names, never by the paragraph. None is superseded and none was
  edited.
- Backend-lane specs (`e2e/design-0143/*`, workout-lifecycle, task-040, core-loop, B05): none
  references the helper, `--logging-*`, `.clr-logging-movement` or the ladder count's spacing. Not
  edited.
- `.clr-ladder-completion` geometry readers (`task-013.spec.ts`, `ui-polish-b05-scroll-boundaries`):
  they measure tiles, columns and rows, not the count's offset. They are unaffected.
- TASK-010's `e2e/refinement/task-010.spec.ts` and `timed-result-log.test.tsx` group readers exclude
  `.clr-timed-log__group--movement`. They are unaffected (TASK-009/010/015 file: 23/23 passed).
- Not touched: `.github/**`, `src/test/design-0143-final-audit.test.ts`, every other task's
  `required-cases.json`, `supabase/`, any `.env*`. `PROJECT_MAP.md` unchanged (no new directory or
  boundary).

## Verification (uncommitted candidate on `d7e5ccd`)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-017 --check check-01 -- npx vitest run
  src/ui/logging-overlay.test.tsx --testNamePattern "group|spacing|helper" --passWithNoTests=false`:
  **PASSED**. 24 total, 7 executed, 7 passed, 17 skipped.
- TASK-018 check-01 (exact manifest command): **PASSED**. 9 executed, 9 passed, 15 skipped.
- TASK-016 check-01 (exact manifest command): **PASSED**. 13 executed, 13 passed, 11 skipped.
- `npm test`: 269 files, **6321 passed**.
- `npm run lint:ds`: clean.
- `npm run build`: passed.
- `node scripts/gallery-index.mjs --check`: 76 verified.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final
  --tasks TASK-001,…,TASK-018,TASK-022,TASK-023,TASK-030,TASK-031,TASK-032,TASK-034`: **PASSED**,
  exit 0. Every listed task has current passing receipts. Foundation 0.14.3 is unchanged.

## Failures and corrections

- First `npm test`: 1 failure. TASK-009's "AC-C26-01 … one result group" pins `.clr-timed-field` to
  the literal `gap: var(--spacing-200)`, and I had pointed that rule at `--logging-label-gap`. I
  reverted the rule to the literal (same value) and changed my case to prove equality by resolution.
  TASK-009's test is not edited.
- My first docblock in `set-logger.tsx` quoted the removed sentence, and my own sweep case flagged it.
  I paraphrased the comment.

## Open assumptions / items for later tasks

- TASK-044: add `?state=superset` with the superset in the frame. Its groups already carry
  `clr-logging-movement`, and the frame's legend rhythm applies there.
- TASK-043: the anchor/other set sheet's Effort legend gets the label gap once it is inside
  `LoggingOverlay` (`.clr-accepted-log`). Until then, the inline set-logging sheet keeps its 0 px
  legend gap. This task does not migrate it.
- TASK-041: confirm the gaps on phones (jsdom proves the cascade; the Chromium probe confirmed only
  the legend mechanism). The reference's 12 px ladder heading gap inside the dialog was deliberately
  not adopted (R109: keep the good gap). UAT can confirm.

## Next action

Controller verification (`npm ci`, check-01, build, lint:ds, test) and commit.
