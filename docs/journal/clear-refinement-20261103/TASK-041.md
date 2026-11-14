# TASK-041 — Verify adopted dialog and form rhythm in actual route consumers (#667)

Body `clear-refinement-v2-20261109b`, attempt 1. This is the task-owned progress note, the approved
exception to the shared daily journal for this body. Only TASK-041 writes this file.

## Status

Implementation complete (uncommitted), awaiting controller verification and commit. Base `d221cca` (#721, TASK-019 merged): `git fetch origin` then `git merge-base HEAD
origin/build/clear-refinement-2026-11-04` = `d221cca3721f4b753f219b6e344b2109c00839f7`.

## Intended outcome

REQ-016/017/018, completion owner of JOURNEY-016, JOURNEY-017 and JOURNEY-018 (AC-C40-01,
AC-C41-01, AC-C43-01, AC-R016-01–03, AC-C05-01, AC-C42-01, AC-C47-01, AC-R017-01–03,
AC-C44-01, AC-C57-01, AC-C58-01, AC-C59-01, AC-R018-01–04). Prove the selected dialog, header,
backdrop, movement-group rhythm and P01–P03 frame contract on the actual route consumers
(`/workout`, `/summary`, Home, `/review`), with real geometry measured in Chromium and
delivered-revision image evidence; fix genuine defects in the shared owners.

## Sources read

Brief; RUNNING-SUMMARY; TASK-016/017/018/033/019/043/044/045/046 notes; FINAL-POLISH-ACCEPTANCE
(P01–P05); REUSE.md; LOGGING-FIELDS.md; the accepted reference's `presentation.css`; the R7
replay CSS; correction register R109; `templates/gallery-authority.md`.


## Findings on the routes (Chromium probes, then the spec)

- **Defect fixed — keyboard focus invisible inside every log.** With a log open and a control
  focused by keyboard (for example the log's "Add 30s"), nothing was drawn on it: the app runs
  Foundation's `FocusBrackets`, whose one bracket layer is appended to `document.body`, and in
  brackets mode a focused button drops its own outline. A modal `<dialog>` is in the top layer,
  above everything in the body, so the brackets were painted under the log (probe: layer parent
  `BODY`, opacity 1, screenshot showed no brackets). This contradicts P02/C58 ("retain …
  intentional keyboard focus on controls"). Fix in the shared owner
  `src/ui/refinements/logging-overlay.tsx`: `useFocusBracketsInside` moves the one layer into the
  open log and hands it back to its previous parent (the body) on close or unmount; a layer
  Foundation already removed is left removed. Same approach as the deadline aura (TASK-008).
  Foundation is untouched. Regression test `src/ui/logging-overlay-focus-brackets.test.tsx`
  (3 cases; 2 failed before the fix, the "no layer" guard passed — tests-first confirmed).
- **Header alignment is real, but must be read paint to paint.** The title's trimmed box top
  equals the X button's box top in every moment, and the cap tops and the X's chamfered stroke
  meet on screen. Both paint outside their layout boxes (glyph caps above the trimmed line box,
  the stroke from the button's bleed), and Chromium's capture and `getBoundingClientRect` can
  differ by a constant offset, so the spec compares the title's first core-paint row with the
  X's first core-paint row in the same capture (`paintTop`). A first version compared paint
  with a box and reported a false 6 px; a second hid the X's whole bleed, which blurred the
  focused X and counted its focus brackets as the X. Both corrected (opacity, brackets hidden).
- **Frame contract holds on the routes** at 320×568, 390×844 and 1280×800: frame = visible
  viewport − 40 px (`--logging-viewport-gap`) for long forms, content height for short ones;
  scroller on the inner border, no bottom inset, chamfer clip, scrollbar gutter 0,
  `scrollbar-width: none`, no sideways overflow, no container outline on load/open/reopen or
  after a tap on blank space (focus then on the dialog, not focus-visible).
- **Rhythm** (390): superset groups 8 px inside, 20 px between (8 + 12); choice legends 8 px;
  ladder heading 8 px, count 16 px.

## Decisions (recorded rather than asked)

- **Rounds completed heading gap kept at 8 px (TASK-017 UAT item, confirmed against the
  reference).** The accepted reference `eded158c…` raises it inside the dialog
  (`.clr-accepted-log .clr-ladder-completion > legend { margin-block-end: var(--spacing-300) }`,
  12 px). The requirement text says to *keep* the good gap (R109: Eric called the Rounds completed
  heading-to-tile spacing good in the 12-round ladder screenshot), and the owner-reviewed R7 replay
  that R131 approved "as shown" uses `--spacing-200` (8 px). Changing it would also rewrite
  TASK-017's asserted meaning, which no approved requirement replaces. Kept at 8 px, measured on
  the route; recorded as an open owner item (adopt the reference's 12 px in the dialog or keep 8).
- **Set-log field labels.** Foundation's `Input` keeps its own 4 px label-to-field gap
  (Weight/Unit/Reps; Foundation 0.14.3 is immutable); the choice legend (Effort) sits at the 8 px
  label gap, which equals the timed log's labelled-field rhythm (`.clr-timed-field`). The accepted
  reference's set forms use the same Foundation `Input`, so this matches the reference. Recorded
  as an observation/owner item, not changed.
- **Gallery `ladder-long` gets the actual consumer.** The state kept TASK-018's provider specimen
  (other tasks' checks read it) and now also draws the route's own `LadderBlock` over a
  twelve-round ladder run into its cap, whose "Log results" opens the long log through
  `TimedResultDialog` exactly as `/workout` does (`src/dev/gallery-refinement-forms.tsx`,
  `GALLERY_LONG_LADDER_ATTEMPT`; memory only, no writer). No other gallery state needed changes:
  the 16 logging states already render the route consumers (TASK-019). No route CSS duplicated.
- **`?state=urgency`** (TASK-016's sweep item) already opens the shared `LoggingOverlay` (TASK-033);
  the gallery case asserts there is no visible Close word or text close button in it.
- **On-screen keyboard in the harness.** An emulated viewport change does not deliver the
  `visualViewport` `resize` event that a real keyboard sends, so the overlay's listener never ran
  (frame stayed sized for the old box: `--logging-visible-height: 844px` after shrinking to 464).
  The case shrinks the viewport and dispatches that event, as the browser would; then the frame
  follows the smaller visible viewport and Save stays reachable. Not a product change; a real
  iOS/Android keyboard was not observed.

## Changes

- `src/ui/refinements/logging-overlay.tsx` (shared owner): `useFocusBracketsInside` (above).
- New `src/ui/logging-overlay-focus-brackets.test.tsx` (3 cases, task-owned regression).
- `src/dev/gallery-refinement-forms.tsx`: `ladder-long` also renders the route's twelve-round
  `LadderBlock` (docblock paragraph added; existing specimen untouched).
- New `e2e/refinement/task-041.spec.ts` and `evidence/refinement/task-041/required-cases.json`
  (check-01, 10 required cases) plus its receipt.
- No CSS, token, hotspot (`gallery-refinements.tsx`, `presentation.css`, `tokens.css`,
  `gallery-registry.tsx`, `COMPONENTS.md`) or other task's test file was edited. No
  `required-cases.json` other than TASK-041's was created or edited.

## Tests (check-01, `e2e/refinement/task-041.spec.ts`, describe "TASK-041 adopted dialog and form rhythm in the actual route consumers")

One contained synthetic account (every write intercepted and answered here, nothing forwarded,
`assertContained`), one session with every `/workout` consumer: standard block (back squat,
romanian deadlift, plank by time, farmer carry by distance), a superset whose loaded movement has
the longest catalog name (its note title wraps), a circuit, then EMOM, AMRAP, For Time and a
**twelve-round** ladder. Shared readers: `readFrame` (dialog/frame/scroller boxes, border, bottom
inset, clip, scrollbar gutter/width, sideways overflow, interior full-width rules, outlines, frame
ring vs its own `--brd`, `::backdrop` paint, foreground filter/opacity/shadow), `readTokens`
(every value resolved from the running app's tokens), `visibleTops` (paint to paint),
`expectInertBehind` (no background control focusable or hit), `expectContainedScroll` (top →
a control cut by the inner lower border and painted to it → end by touch or wheel, frame and
dialog stationary, last control fully inside), `tabToLast`, `expectBracketsOn` (layer hosted by
the open log, around the control, and actually painted: capture differs with it hidden),
`readGroups`, `readLabelGaps`, `readCardPeers`, `expectDialogTextContrast` (TASK-029's method per
text node). Every inspected moment attaches a delivered-revision PNG (device pixels) and a JSON
beside it (reference commit, `HEAD` + uncommitted path count, URL, viewport, DPR); each case
attaches its readings JSON.

1. **JOURNEY-016 /workout 390 touch** (AC-R016-03; also C40/C41/C43/R016-01/02): anchor (draft
   through X; rest counting −5 s while open), saved confirmation, movement note over the running
   rest (rest behind −3 s; draft through Escape; focus to Edit note), other lift, timed and
   distance movement, set 2 then Extra set 3, saved-set correction (draft through X), superset
   round (draft through Escape), wrapped long note title (>1 line), circuit round, circuit
   movement; then ladder (race clock runs 10–11 s on behind its open log), finished ladder,
   AMRAP (rounds kept through X), For Time, EMOM (after 10 min). Each: native modal, one title,
   X focused, no half-sheet/Minimize, header, Balanced backdrop, frame contract, inert behind.
2. **JOURNEY-016 wrapped titles 320 keyboard reduced motion** (AC-R016-02): five-line note title,
   Workout feedback on /summary, rest day on Home; X focus-visible with brackets painted inside
   the log; drafts through Escape/reopen; rest day X/Escape keep the cancel meaning (reopens at
   "rest"); nothing written.
3. **JOURNEY-017 rhythm 390** (AC-C05-01; also C42/C47/R017-01..03): /review and /workout card
   peers (tier = `--movement-tier-gap`, next movement ≥ 2 × `--movement-peer-gap` away); anchor
   log legends; superset round: two complete groups (name, Performed, fields, Effort), inside
   ≤ `--logging-movement-field-gap`, between = parent gap + `--logging-movement-gap`; no paragraph
   outside the groups except the rest's label; helper words nowhere (pages and logs); A1 typed →
   only A1 written; round 2 partner ticked with blank Reps → written with `actual_reps: null`;
   For Time (Incomplete) and AMRAP movement groups; legends and timed fields at 8 px; 12-round
   ladder 3 of 12: heading 8 px (kept), count 16 px.
4. **JOURNEY-018 long logs 320 touch/wheel reduced motion** (AC-C44-01; also C57/C59/R018-01/03/04):
   anchor (long at 320; touch to Log set 1), superset (wheel to Log round 1; blank tap focuses the
   dialog without a ring), short note (content height, no scroll), 12-round ladder (touch to its
   last control), reopen without outline.
5. **JOURNEY-018 keyboard and focus 390 + 1280** (AC-C58-01; also R018-02/04, C44 keyboard):
   superset opened by Enter: X focus-visible with painted brackets; a value entered by keyboard;
   every Tab stop inside the log and fully in the frame's view up to Log round 1 (brackets
   painted on it); touch reopen on a fresh screen: X focused without ring, brackets layer
   opacity 0, no container outline; keyboard-up viewport (55 %): frame = visible − gap, Save in
   view; note short at both sizes.
6. **Gallery clear 390** (AC-C41-01): the 16 states, `ladder-long` specimen (long; wheel through
   it) and route ladder, and `urgency`: same header/backdrop/frame/inert checks, no visible Close
   word or text close button, focus back on the opener (or its successor), no network.
7–10. **Skins clear / vapour / signal / mono 390** (AC-C43-01): superset round and anchor log
   with the Balanced backdrop, and every text node in view (title, movement lines, labels,
   legends, status) at ≥ 4.5:1 measured against its actual painted ground.

## Earlier tests changed

None. No other task's spec, unit test or `required-cases.json` was edited (the owner decision of
2026-11-10 was not needed). The five deferred B05 half-sheet specs were not edited or run.

## Failures and corrections during the work

- Probe: tapping the superset's "Add note" was intercepted by its collapsed coaching trigger;
  the spec expands the disclosure first (`expandCoaching`) and centres openers (`tapOpen`).
- Header measurement (above): three iterations, from box-vs-paint (false 6 px), to bleed hidden by
  `visibility` (blurred the focused X, counted its brackets), to paint-vs-paint with opacity, a
  left-edge strip clear of the X glyph, and a capture-relative core threshold (mono's stroke is
  weaker than a fixed threshold).
- "No visible Close word": Workout feedback's own submit is "Save and close" (TASK-045); the
  check is now "the X is the only close control and no text reads Close / Close log".
- Superset paragraphs: the round shows the running rest's label ("Rest after back squat") as a
  paragraph; the check now requires every paragraph to be a movement's own line or the rest's.
- "Log round 1" is disabled until a movement is identified, so the keyboard case enters a value
  first; the AMRAP log's labels are fields, not legends.
- After a keyboard Escape a synthetic tap does not reset Chromium's focus-visible modality (the
  X then shows a ring: control focus, not a container outline); the touch-only check runs on a
  freshly loaded screen.
- The ladder clock read 11 s after a 10 s run once (whole-second readout across a tick); the
  check accepts 10–11.
- The ladder log has no Notes field on the route (its last control is the Effort choice); the
  scroll checks reach the log's last control generically.
- Host lock busy several times (other runs): environment waits, retried.

## Criteria → executed cases (check-01 case numbers as in "Tests")

| Criterion | Proved by | What is asserted |
| --- | --- | --- |
| AC-C40-01 | 1, 2, 6 | every moment is the native modal named by its one title, no half-sheet/Minimize, the workout blurred behind |
| AC-C41-01 | 1, 2, 6 | X framed, named "Close log", no visible word, the only close control; X visible top = title visible top (paint, ±1 px) in all 16 moments + wrapped titles + urgency |
| AC-C43-01 | 1, 7–10 | `::backdrop` = exactly the Balanced recipe resolved from tokens (55 % dim, 85 % edge, `blur(4px)`); dialog/frame/scroller/body no filter/opacity/shadow; direct AA contrast of every text in view in four skins |
| AC-R016-01 | 1, 6, 7–10 | as C40 + C43 (no darker backdrop, no rising sheet) |
| AC-R016-02 | 1, 2, 6 | as C41, including the five-line note title and Workout feedback |
| AC-R016-03 | 1, 2 | no background control focusable or hit while open; rest −5 s inside the anchor log, −3 s behind the note; ladder clock +10 s behind its log; drafts through X/Escape/reopen; focus back on the opener |
| AC-C05-01 / AC-R017-02 | 3 | groups hold name, Performed, fields, Effort; inside ≤ movement field gap; between = form gap + movement gap; card peers ≥ 2 × peer gap, tiers at the tier gap (/review and /workout) |
| AC-C42-01 / AC-R017-01 | 3 | every choice legend and timed field label at 8 px (= field rhythm); ladder heading 8 px kept; count 16 px > label gap |
| AC-C47-01 / AC-R017-03 | 3 | helper words nowhere on /review, /workout or the logs; no paragraph outside groups (rest label excepted); unticked partner never written; ticked partner with blank Reps written with `actual_reps: null` |
| AC-C44-01 | 4, 5, 6 | frame/dialog stationary top→middle→end; only the scroller moves; last control reached by touch, wheel, Tab and focus at 320/390/1280 |
| AC-C57-01 / AC-R018-01 | 1–6 | scroller on the inner lower border, no bottom inset, chamfer clip, no full-width interior rule; mid-scroll a control straddles the border and is the element painted 1 px above it |
| AC-C58-01 / AC-R018-02 | 2, 4, 5, 1–6 | no container outline on open/reopen/blank tap; frame ring = its own border; touch open: X focused without ring; keyboard: X and every Tab stop bracketed, brackets painted inside the log (fix) |
| AC-C59-01 / AC-R018-03 | 1–6 | `scrollbar-width: none`, gutter 0, no sideways overflow (scroller and document); wheel/touch/keyboard/focus scrolling reach the end |
| AC-R018-04 | 4, 5, 6 | long forms: frame = visible viewport − 40 px (far above half the screen); short forms content height, no scroll; keyboard-up viewport shrinks the frame with Save reachable |
| JOURNEY-016 / 017 / 018 | 1–10 | real entries `/workout`, `/summary`, Home, `/review`; gallery states reference-checked separately (case 6) |

## Verification (working tree on base `d221cca`)

Every Playwright command ran under
`node /Users/eric/Projects/support-tooling/agent-runner-v2/bin/v2.mjs with-lock --` (lock-busy
waits retried; never a port collision).

- `node scripts/refinement/run-required-check.mjs --task TASK-041 --check check-01 -- npx playwright test e2e/refinement/task-041.spec.ts --project=mobile`:
  **PASSED**, 10 total / 10 executed / 10 passed / 0 skipped (4.4 min). The spec was not edited
  after this run.
- Shared owner changed (`logging-overlay.tsx`; `ladder-long` in `gallery-refinement-forms.tsx`), so
  the earlier owners' exact guards were re-run:
  - TASK-016 check-01 (vitest, `header|focus|close|backdrop`): PASSED, 13 executed.
  - TASK-017 check-01 (`group|spacing|helper`): PASSED, 7 executed.
  - TASK-018 check-01 (`scroll|outline|viewport`): PASSED, 9 executed.
  - TASK-019 check-01: PASSED 5/5. TASK-043: 7/7. TASK-044: 7/7. TASK-045: 7/7. TASK-046: 6/6.
  - TASK-033 check-01: first run REJECTED 7/8 (l.902 "long log header: the glass is painted over
    this foreground", 0 changed pixels — the known flake); re-run PASSED 8/8. Every receipt above
    was rewritten byte-identical (no diff under `evidence/` except TASK-041's new directory).
- **TASK-033 l.902 investigated, not assumed.** Alone in this worktree `--repeat-each=4`: 2/4;
  `--repeat-each=8`: 6/8 (twice). Clean `git archive d221cca` export in a scratch directory (same
  `node_modules`): 8/8. Base + only my overlay change: 8/8. Base + only my gallery change: 8/8.
  Base + both (the same product source as this candidate): 8/8. So the failures follow the
  worktree environment (it also runs ~5 s faster), not this source [inferred: timing], matching
  TASK-043/046/019, which saw the same case fail in worktrees that never touched `ladder-long`.
  It passed in the full sweep below.
- **Full refinement sweep**, `npx playwright test e2e/refinement/ --project=mobile --workers=1 --trace=off`:
  **189 passed, 0 failed** (28.2 min). Per spec: 001 9, 002 7, 003 5, 004 5, 005 5, 006 7, 007 7,
  008 5, 009 3, 010 3, 011 3, 012 5, 013 5, 014 5, 015 3, 019 5, 020 3, 021 6, 022 4, 023 5,
  024 6, 025 5, 026 5, 027 4, 028 11, 029 13, 033 8, 041 10, 043 7, 044 7, 045 7, 046 6.
- **Non-refinement specs that run locally** (placeholder env `SUPABASE_URL=https://synthetic-review.supabase.invalid
  SUPABASE_ANON_KEY=synthetic-review-placeholder`): `uat-batch-01`, `ui-polish-action-glow`,
  `ui-polish-home`, `ui-polish-pwa-viewport`, `ui-polish-integrated`, `public-gallery`,
  `focus-ownership` (focus brackets), `gallery-motion`, `reduced-motion`. HEAD 48 passed / 11
  failed / 3 skipped; base `d221cca` (clean export) 49 / 9 / 4. Shared on both: `focus-ownership`
  l.387 forced colours (`:focus` not found), both `public-gallery` cases (pre-existing
  heading-order item), and `reduced-motion` route checks. The `reduced-motion` failures are
  variable run to run on both trees (re-run alone: HEAD 8 failed / 10 passed, base 8 / 10, a
  different set of routes each time; `content.checked` 1 at load); no logging dialog is opened by
  that spec, and the bracket move acts only while a log is open. No HEAD-only failure.
  The five deferred B05 half-sheet specs were not run or edited; backend-lane specs not run.
- `npx vitest run`: 274 files, 6385 tests passed. `npm run build`: passed. `npm run lint:ds`: clean.
  `npx tsc --noEmit`: exit 0. `npx eslint` on the four changed/new files: 0 problems.
  `node scripts/gallery-index.mjs --check`: 77 entries verified.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks <all 43 task dirs except TASK-039, TASK-041 included>`:
  **PASSED**, every receipt current.
- Not run: TASK-037/038 definition checks (not in `npm test`). TASK-037's record pins
  `repo:src/ui/refinements/logging-overlay.tsx` by hash, now stale as the cross-task rule expects
  (verify TASK-037 by its receipt).

## Image evidence

Each required case attaches delivered-revision PNGs (full viewport at device pixels: 3× at
320/390) with a JSON beside each (accepted reference `eded158c…`, `HEAD` and uncommitted-path
count, URL, viewport, DPR) and a readings JSON per case (header tops, frame boxes, gaps, contrast
minima). They live in the native Playwright report of the guard run; the controller's own guard
run regenerates them on the delivered revision. Nothing was committed as an image.

## Open owner / UAT items

- **Rounds completed heading gap in the dialog:** kept 8 px (requirement "keep", R7 replay);
  the accepted reference uses 12 px inside the dialog. Owner: keep 8 or adopt 12 (would also
  change TASK-017's asserted value).
- **Set-log field labels** sit 4 px above their inputs (Foundation `Input`, immutable) while
  choice legends sit 8 px above their choices; matches the accepted reference. Owner may want one
  rhythm.
- **Focus brackets in other native dialogs:** the same top-layer problem applies to every
  `AppDialog` (for example "That didn't save", the clear-set confirmation drawn over a log): keyboard
  focus there is drawn under the dialog [inferred from the same mechanism; not measured]. Not a
  logging-overlay consumer, so not changed here.
- **On-screen keyboard:** proved by shrinking the viewport and delivering the visual-viewport resize
  event; a real iOS/Android keyboard, Safari/WebKit and Firefox (no `text-box` trim: TASK-016's
  ~4 px residual) were not observed (Chromium only).
- **Touch scrolling** is a CDP-synthesised touch gesture in Chromium, not a physical device.
- **Mixed input:** after a keyboard Escape, a tap reopen keeps Chromium's focus-visible modality,
  so the X shows brackets (control focus, not a container outline) — browser heuristic, unchanged.
- **The route ladder log has no Notes field** (LOGGING-FIELDS lists Effort/Notes for the ladder);
  its last control is the Effort choice. Not changed (data/field ownership is not this task's).
- **TASK-033 l.902** remains environment-sensitive in worktrees (evidence above).
- Carried forward unchanged: TASK-033 glass soft edge on a full-height header; TASK-018/016 iOS items.

## Next action

Controller verification (`npm ci`, check-01 under the lock, build, lint:ds, test) and commit.
