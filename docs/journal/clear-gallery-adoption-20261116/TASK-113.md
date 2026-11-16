# TASK-113 — A3 task 13: Setup and error screens re-proved on Round 7 (#736)

Body `clear-gallery-adoption-v2-20261116`, attempt 1, integration branch
`build/clear-gallery-adoption-2026-11-13`, base `ebedaf23` (TASK-103 merged). Source material only:
the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note;
it satisfies the shared daily journal rule for this body. Only TASK-113 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body
names `clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 did.

## Status

Attempt 1 (2026-11-16) complete and committed on the worker branch, awaiting controller
verification. One real defect was found and fixed: on the real `/onboarding` route Round 7's setup
head drew **two** dividers (C52 / AC-R025-01 ask for one). The build's pinned title during the
commit was also restored. The error screens needed no change.

## Intended outcome

- JOURNEY-025 (completion owner): Set up CLEAR, the step label and progress stay pinned above one
  shared divider while the equipment scrolls, on the real route, with every onboarding step and no
  review-app preview draft.
- JOURNEY-028 (completion owner): the released ErrorView keeps its error role on frame, accent
  bar, emission and glyph in all four skins, with retry unchanged.
- A look check of both routes against their accepted gallery states at 320 and 390 px.

## Findings

1. **Two dividers on Setup (fixed).** Round 7 gives the setup header
   `.clr-setup-header { border-block-end: 0 }` (`src/ui/workout-experience-presentation.css`) so
   that the head's one rule closes title and progress together. In a browser that rule loses:
   `src/styles/shell.css` closes every fixed header with
   `.clr-screen > .clr-scroll-region > .clr-scroll-region__head > header { border-bottom: … }`, at
   specificity (0,3,1) against (0,1,0). Load order does not matter; the header always drew its own
   rule between the title and the progress, and the head drew a second one under the progress.
   The carried TASK-025 e2e caught it as soon as its selector read Round 7's head: "one divider —
   the head's — and no second rule" received `['head', 'header.clr-setup-header']` at 320 and 390,
   on every journey. Task 2's Onboarding test could not see it (it matches the CSS text in jsdom).
2. **Title unpinned while committing (restored).** The build pinned the Set up CLEAR title in the
   header while the setup commits (`SETUP_HEADER` on the committing Screen; the build's
   AC-R025-01 test is named for it, though its body never checked that moment). Round 7's Onboarding
   dropped the header there, so the title moved into the scrolling content during the commit and
   back after it.
3. **equipmentSetupDraft.** Round 7's `Onboarding` reads `presentation?.equipmentSetupDraft` (the
   review app's two-step preview). The product presentation has none, so the real route starts from
   the empty draft and walks all five steps; only `src/dev/gallery-refinement-runtime.tsx` gives one,
   and no gallery state mounts `Onboarding`. Proved, not changed.
4. **Errors.** `src/ui/view-state.tsx` is byte-identical in the build and in the accepted gallery;
   `?state=errors` draws the same ErrorView. The route's failure and the gallery state match element
   for element (19 boxes, 0 differences) and paint for paint in all four skins.

## Changes

- `src/app/Screen.tsx` (not gallery-owned; unchanged by bec4454): a header joined by a pinned layer
  hands its closing rule to the one head (`JOINED_HEADER_STYLE = { borderBottom: 0 }` on the
  header), restoring the build's TASK-025 Screen rule without its wrapper. The style is on the
  element, so no stylesheet or load order (dev or production) can draw the second rule. The
  `pinnedHead` prop doc says so again. Only Onboarding passes `pinnedHead`.
- `src/app/Onboarding.tsx` (gallery-owned): the committing Screen also takes Round 7's setup header
  (`presentation ? { className: 'clr-setup-header' } : undefined`), so the title stays pinned while
  the setup commits (AC-R025-01). Nothing joins it then, so the header keeps its own rule (one
  divider). No other line changed; `equipmentSetupDraft` handling is task 1's.
- `src/app/Onboarding.test.tsx`: four added tests (every step under Round 7's head from the empty
  draft; one divider on the header itself; title pinned while committing; no production setup
  draft). Imports added; no existing test body changed.
- `e2e/refinement/task-025.spec.ts`: rewritten for Round 7 — `readHead` reads `.clr-setup-progress`
  (was `.clr-screen__pinned`), every route assertion the build's; the synthetic answers are held
  until `visit`'s scan of the boot screen ends, and `openSetup` then scans the settled setup screen
  (see failures). The gallery case reads Round 7's accepted Setup part (a static composition) and
  is renamed. Three build assertions about the build's own gallery part do not apply to it
  (progressbar name/values, overflow, a tap answering) and are listed in the ledger.
- `e2e/refinement/task-113-parity.spec.ts` (new, 10 cases): Setup (`/onboarding` beside the
  `screens` state's Setup part, matched to its one ticked equipment, Dumbbells) at 320/390 —
  words, and the pinned head's geometry (step beneath the title from its edge, one divider closing
  and spanning the head, content starting at it, head still while the content scrolls, no
  overlay), and how the equipment choices are drawn (the part's sample chips beside the route's
  shipped checkbox rows: labelled TASK-AC-A76ECE156C75); errors (`/summary`'s failed session read
  beside `?state=errors`) in four skins × 320/390 — words, every element's box within 2 px, and the
  painted roles. Same held-boot harness as TASK-025.
- Evidence: `evidence/refinement/task-113/required-cases.json` (check-01: 20 cases; parity: 10),
  `test-ledger.json` (52 carried, 7 rewritten, 2 retired, 14 added), `results/check-01.json`,
  `results/parity.json`, `parity/*.json` (receipts). Captures are outside Git, in the project
  evidence store under `clear-gallery-adoption-v2-20261116/task-113/captures/`, hashed in the
  receipts. `evidence/refinement/task-025/required-cases.json` (Round 7 description, renamed gallery
  case) and `task-028/required-cases.json` (description) updated; their result receipts rerun.

Gallery-owned files changed (for the controller's hand diff): `src/app/Onboarding.tsx` only — the
committing Screen's header (AC-R025-01). It is not drawn by any `/gallery/refinements` state (the
`screens` Setup part is a static composition), so no gallery state changes with it.
`src/app/Screen.tsx`, `src/ui/view-state.tsx` and every CSS file are not gallery-owned or were not
touched.

Map note (PROJECT_MAP.md not edited, per the controller): Screen's joined head — a fixed header
plus `pinnedHead` share one divider, the header giving up its rule — is again a Screen rule, as in
the build's TASK-025.

## Failures and corrections

- The parity draft's matched-data step unticked checkboxes through a live `checked` locator list,
  which shifted as boxes were unticked and timed out; it now reads the ticked names first.
- The gallery Setup part's chips are `aria-pressed` buttons, not checkboxes; the ticked reading
  covers both. Its words are upper-cased by CSS in `innerText`; the intended-difference rules are
  case-insensitive.
- The rewritten TASK-025 gallery case first tapped the last chip and expected it pressed; the
  accepted part's choices are a fixed sample, so the tap was dropped and the case checks the choice
  is in view below the divider.
- TASK-025's journeys failed axe `region` on the skip link now and then (3 of 24 journey runs):
  `visit('/')` scans the first screen whose h1 shows, which is the boot screen, while the boot was
  handing over to the router and redirecting to `/onboarding`, so axe sometimes read a torn DOM.
  Not caused by this task's change (the harness and boot are the base's). Fixed in the spec, not
  the fixture (outside the lane): the synthetic answers wait until `visit` returns, so its scan
  reads the steady boot screen, and `openSetup` scans the settled setup screen as well. After the
  fix: 20/20 TASK-025 runs (`--repeat-each=4`). `task-028.spec.ts` was left byte-identical: 33/33
  over three repeats.
- `npm run lint` once crashed reading a Playwright trace file being written in `test-results/` by a
  concurrent browser run (ENOENT); rerun after the browser run.

## Verification (this worktree)

Final tree, 2026-11-16:

- `run-required-check TASK-113 check-01`: PASSED, 47/47 (20 required cases).
- `run-required-check TASK-025 check-01` (host lock): PASSED, 5/5.
- `run-required-check TASK-028 check-01`: PASSED, 8 executed (15 filtered by the name pattern).
- `run-required-check TASK-028 check-02` (host lock): PASSED, 11/11.
- `run-required-check TASK-113 parity` (host lock, dev server): PASSED, 10/10. Setup facts equal on
  both sides at 320 and 390; every word difference and the equipment-control difference labelled;
  errors 0 layout and 0 paint differences (19 boxes each) in every skin.
- Repeats (host lock, no receipts): `task-025` + `task-113-parity` `--repeat-each=4` 60/60;
  `task-028` `--repeat-each=3` 33/33.
- `node scripts/refinement/verify-delivery-evidence.mjs --mode final --body clear-refinement-20261103
  --tasks TASK-113,TASK-025,TASK-028`: PASSED (current passing receipts for all three).
- Before the fix (base `ebedaf23` plus the rewritten selectors): TASK-025 4/5 journeys failed at
  the second rule; parity screens failed (`oneDivider`, `dividerClosesHead`, `dividerSpansHead`,
  `contentStartsAtDivider` false on the route). The added one-divider and committing unit tests fail
  on the base Screen/Onboarding and pass after.
- Production bundle (`vite build` with synthetic public values into the scratchpad, `vite preview`,
  `E2E_BASE_URL`; host lock): `task-025.spec.ts` + `task-113-parity.spec.ts` 15/15. Receipts then
  replaced by the dev run.
- CI chain (`npm run typecheck && npm run lint && npm run lint:ds && python3 scripts/gen-issues.py
  --check && npm run gen:types -- --check && npm test && npm run build && ! git grep … console`):
  exit 0. Lint 0 errors, 175 warnings (as base); `npm test` 6,245/6,245 (263 files; base 6,241 + 4
  added). The parity spec's last harness edits came after this run; `tsc` and `eslint` on it were
  clean.

## Open assumptions and questions

- The restored committing header (finding 2) is the build's TASK-025 behaviour under Round 7's
  header; the gallery shows no committing state. Worth a glance at approval.
- The route's head spaces the step 20 px below the title and adds the progress bar (Round 7's
  `clr-setup-progress` padding); the gallery's static Setup part puts its step line directly under
  its label and has no bar. Recorded in each screens receipt (`layout.gaps`), not compared: the
  part is a static composition, and the bar is required (C52, AC-R025-01).
- Setup's equipment: the accepted part draws a three-item sample as chips; the route keeps the
  shipped checkbox rows (Round 7's Onboarding did not change them, and U09's tests cover them).
  Labelled TASK-AC-A76ECE156C75 in the receipt; worth confirming at approval that the chips were
  only the sample's shorthand.
- The errors look check uses `/summary`'s failed session read (a 503, "Server error. Try again
  later."); no route read produces the gallery's sample timeout, so the title and message are
  labelled differences (AC-R028-01, TASK-AC-7B8DC9E87617).
- The build's second Screen test (`pinnedHeadRule={false}` closes the head with the layer's own
  rule) stays retired with task 2's file: Screen still honours the prop, but no screen uses it and
  `Screen.test.tsx` is outside this task's lane. Left for TASK-115's end-of-run ledger.
- Real devices not checked; Chromium phone emulation at 320 and 390 only.

## Next action

Controller: run the brief's commands, diff `src/app/Onboarding.tsx` (the one gallery-owned file
changed), and review the parity receipts and captures.
