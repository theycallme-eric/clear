# TASK-109 — A3 task 9 (F7): Warm-up and Cooldown from real data, coaching and movement notes (#732)

Body `clear-gallery-adoption-v2-20261120` (round 07), attempt 1, branch `v2/clear-gallery-adoption-v2-20261120/task-109-a1`,
integration branch `build/clear-gallery-adoption-2026-11-13`, base `628c7aa2` (TASK-108 merged). Source material only:
the old build `build/clear-refinement-2026-11-04` (`181e580`). This is the task-owned progress note; it satisfies the
shared daily journal rule for this body. Only TASK-109 writes it.

Path note: the brief's rules name this folder (`clear-gallery-adoption-20261116`); the issue body names
`clear-gallery-adoption-20261113`. The brief's path is used, as TASK-103 to TASK-108 did.

## Status

Attempt 1 implemented and committed locally; every required check passed through the guard (parity twice, receipts
and captures byte-identical). Nothing pushed. One item is flagged for the controller (see "Open", item 1).

## Intended outcome

- JOURNEY-022 (completion owner) on `/review` and `/workout` (and `/history/:id`): Warm-up and Cooldown are Round 7's
  concise PreparationGuide — the stable title, TASK-034's approximate time and the movement names on separate lines —
  read from the real composition (Review) or the session's active rows (Workout, History; swaps in place), in their
  loading, error-with-retry, missing and ready states; each live section has its own preparation clock, held once per
  session, Start / Pause and Add 30 sec, no Dismiss.
- JOURNEY-005 (completion owner) on `/review` and `/workout`: one bottom "Coaching and notes" disclosure per grouped
  block with a labelled role=group section per movement (hidden "— FORMAT: names" suffix, aria-labelledby,
  HeadingSection levels); each movement's note in Round 7's "Movement note" dialog, its draft, save, status and
  failure its own; the empty-state messages kept (decision 5).

## Changes

Product (gallery-owned files marked G; each change named by a criterion and listed in the parity receipts'
`galleryChanges`):

- G `src/ui/preparation-guide.tsx` (TASK-AC-2E1486B7B4BF, TASK-AC-4BF91CC8AA52, AC-R034-02, AC-R022-02): Round 7's
  PreparationGuide keeps its `guide` prop (the gallery's sample) and also takes TASK-034's `reading` + `type` (+
  `onRetry`), drawing loading (busy region), a failed read (named error, "Try again"), a section with no movement left
  and nothing for an absent section, in Round 7's card. The ready card: title, `approximateDurationText` (identical to
  Round 7's `~N minutes` for N≠1; "~1 minute" for one), the names one per line in `clr-v4-guide-list`, now named
  "<title> movements". The clock: `usePreparationClock(clockKey, minutes)` — the session's PreparationClockProvider,
  the component's own in the gallery — in Round 7's CountdownBar with Round 7's Start/Pause/"Time reached" and "Add 30
  sec"; its warning from its own deadline (`movementCountdownDeadline`) and "Final 10 seconds" in the final ten (the
  inherited TASK-022 reads).
- `src/state/preparation-guide.ts`: `persistedPreparationReading(entry, type)` (a malformed row is an error, no active
  movement is missing). Pure; TASK-034's other exports unchanged.
- G `src/app/Review.tsx`: each section in order — a Warm-up/Cooldown is `PreparationGuide` over
  `composedPreparationGuide` of the composition Start persists (swap in place), every other section its blocks; the
  presentation's sample `guides` are no longer read.
- G `src/app/Workout.tsx`: `PreparationClockProvider` inside the rest provider; the open Warm-up/Cooldown is
  `PreparationGuide` over `persistedPreparationReading(snapshot.sections[index])` with its clock keyed by the section.
- G `src/app/SessionDetail.tsx`: Warm-up/Cooldown by `PreparationGuide` over the record's rows, the error's retry
  re-reading the record.
- G `src/ui/exercise-coaching.tsx` (TASK-AC-82B8F7A4EF0B): GroupCoachingPanel's sections are
  `CoachingMovementSection` — a `role="group"` labelled by its heading's id, the list and each section's guidance/note
  under HeadingSection (tight rhythm, so no box moves); exported `GROUP_COACHING_LABEL`, `NOTE_ADD_LABEL`,
  `NOTE_EDIT_LABEL`. The movement note was already Round 7's dialog (TASK-AC-C4EE3D4EC8F0 is proved by tests).
- G `src/ui/workout-experience-presentation.tsx`: comment only (`guides` is the gallery's sample).

Tests and specs (every inherited body is in `evidence/refinement/task-109/test-ledger.json`):

- `src/ui/preparation-guide.test.tsx` (new, owned whole): the build's 7 bodies rewritten onto Round 7 (the gallery case
  renamed), plus one added /history/:id case (TASK-AC-2E1486B7B4BF).
- `src/ui/group-exercise-coaching.test.tsx` (new, owned whole): the build's 9 bodies on Round 7.
- `src/ui/exercise-coaching.test.tsx` (owned whole): the groundwork's 6 build-edit bodies restored in place (base
  bodies superseded, their still-holding reads carried in) and the 4 absent "urgent rest" bodies restored verbatim
  beside Round 7's 4 "low rest" bodies (TASK-108's C1, kept).
- `src/app/Workout.test.tsx` (TASK-110's): the one TASK-005 superset body (R7-1).
- `src/app/circuit-rounds.test.tsx` (TASK-107's): the AC-061 per-movement group read (S2), by role and name.
- `src/app/Review.test.tsx` (6) and `src/app/review-screen.test.tsx` (1) (TASK-119's): updated for the wired guides
  (see "Failures and corrections" and "Open").
- `e2e/refinement/task-005.spec.ts`, `task-022.spec.ts`: rewritten onto Round 7 (task-022's gallery case renamed;
  TASK-022's manifest updated).
- `e2e/refinement/task-109-parity.spec.ts` (new, 6 cases): preparation (/review, /workout, /history/:id), movement-note
  and cards at 320 and 390; captures in the evidence store under `clear-gallery-adoption-v2-20261120/task-109/captures/`
  (58 files).
- Evidence: `evidence/refinement/task-109/required-cases.json` (check-01 53 declared, check-02 1, parity 6),
  `test-ledger.json`, `parity/*.json`, `results/*.json`; refreshed receipts for TASK-005, TASK-022, TASK-107, TASK-108.

## Failures and corrections

- Wiring the guides made 37 base tests fail across 7 files. 29 were the live guide's title: drawn as a label (the
  build's choice), it left no "Warm-up"/"Cooldown" heading on /workout, which Round 7's compact navigator does not draw
  and other tasks' tests read. Corrected: the title is the section's heading on every route (Round 7's own Card default);
  the inherited case now asserts the card's title is the one heading.
- `gallery-registry.test.tsx` rejects an unframed `src/ui` component export; `LivePreparation` was dropped (the routes
  compose `PreparationGuide` directly) and the reading helper moved to `src/state/preparation-guide.ts`, which also
  cleared two new react-refresh warnings.
- 7 Round 7 base bodies in TASK-119's Review.test.tsx / review-screen.test.tsx read Review's Warm-up and Cooldown as
  block cards. They were updated as narrowly as the old build updated the same bodies for TASK-022 (rules.crossFile).
- Round 7 draws the note dialog in place, so a closed dialog's hidden status copy stays in its section: `getByText`
  status reads became role/visible-line reads; closing waits for the dialog's exit; the opener is wrapped in `.clr-bleed`.
- Parity: the first runs failed on stale state (the spec and a component edited while Playwright ran; Vite reloaded
  mid-run) and on the section list's name ("Accessory"). Corrected; no edits during browser runs afterwards.
- The movement section's inner HeadingSection first used `clr-stack` (the build's rhythm), which would have moved boxes
  in the accepted gallery; changed to `clr-stack clr-stack--tight`. A base-vs-task gallery comparison (below) confirms no
  box moved.
- Self-check found base reads replaced by stronger in-dialog reads in three exercise-coaching bodies; the base's panel
  reads were carried back in. It also found the gallery clock's digits read droppable; restored in unit and e2e.

## Verification

All browser runs were under the host lock (`node /Users/eric/Projects/support-tooling/agent-runner-v2/bin/v2.mjs
with-lock -- …`), one at a time. No other task's parity spec was run. `npm ci` exit 0 at the start.

| Check (through the guard) | Result |
|---|---|
| TASK-109 check-01 (five files) | PASSED, 131/131 executed; 53 declared |
| TASK-109 check-02 (circuit-rounds, name filter) | PASSED, 1 executed of 14 |
| TASK-005 check-01 / check-02 | PASSED, 9/9 / 5/5 |
| TASK-022 check-01 / check-02 | PASSED, 8/8 / 4/4 |
| TASK-034 check-01 | PASSED, 8/8 |
| TASK-109 parity, run 1 and run 2 | PASSED, 6/6 each; all 6 receipts and `results/parity.json` byte-identical; all 58 captures hash-identical |
| TASK-107 check-01 (circuit-rounds changed) | PASSED, 60/60 |
| TASK-108 check-01 (Workout.test changed) | PASSED, 296/296 |
| CI chain as one command | exit 0: typecheck ok; lint 0 errors / 175 warnings (as base); lint:ds ok; gen-issues 71 requirements, 136 edges; gen:types current; `npm test` 275 files, 6,418/6,418; build ok; console grep no match |
| `verify-delivery-evidence.mjs --mode final --body clear-refinement-20261103 --tasks TASK-005,TASK-022,TASK-034,TASK-107,TASK-108,TASK-109` | PASSED, current passing receipts for all six |
| `lsof -nP -iTCP:5173 -sTCP:LISTEN` after every browser run | nothing listening |

Parity receipts: cards and movement-note: zero text and zero layout differences in every part (dialog focus on Close
log on both sides). Preparation: every text difference labelled (the catalog's lower-case names, AC-R034-01; the
Cooldown's real ~4 minutes against the sample's ~3, AC-R022-01; the Cooldown clock's own title,
TASK-AC-4BF91CC8AA52), one labelled layout difference (that title's width), all else within 2 px.

Gallery unchanged at rest (one-off, scratch): the accepted gallery served from the base tree and from this tree, same
states and drive at 320 and 390 (preparation; cards closed and opened; movement-note closed and driven to its
dialog): identical words in every part; the only box differences are the elements this task adds (the per-movement
`role="group"` div, its heading span, the inner sections) at the same positions and sizes as the elements they wrap.
Kept as `evidence-store/clear-gallery-adoption-v2-20261120/task-109/gallery-base-vs-task109.json` (sha256 d83fa9fd…).

TASK-023 check-01 (review-screen, name filter) was not run: its receipt was already stale at the base (it records the
build's file hash), and its cases are TASK-119's to restore.

## Self-check (standing rule)

(a) Titles. 10 files and specs touched since `628c7aa2`, 218 tests at the base; 1 absent or renamed at HEAD (task-022's
gallery case, renamed) — recorded with `renamedFrom` (the unit gallery case, absent at the base, also carries
`renamedFrom`). Unrecorded: 0. No `.skip`, `.only` or `.todo` added.

(b) Expect calls (TypeScript parser; body plus its file helpers, multiset against the build's and the base's): 51
bodies compared (41 with a build counterpart, 23 with a base counterpart); 90 build reads and 38 base reads not
verbatim at HEAD, in 25 bodies, every one classified (0 unclassified): build — gallery 29, wording 16, in-place dialog
13, hook 10, TASK-119's own restore 10, decision 4 6, Review list 3, section heading 1, equivalent 1, TASK-107's own
rewrite 1; base — gallery 11, wording 10, in-place dialog 10, decision 4 2, hook 2, Review list 2, approved change 1.
`matchersWeakened: false` (ledger `rules.matchersWeakenedNote`); the reads dropped where Round 7's gallery has no
equivalent are in `rules.retiredAssertions`.

Inherited assertions: groundwork F7 26 (preparation-guide 7, group-exercise-coaching 9, exercise-coaching 6 + 4), round
07's Workout coaching body 1 and circuit AC-061 1, e2e task-005 5 and task-022 4, the carried TASK-034 suite 8. Ledger:
82 rows — rewritten 40, carried 29, superseded 6, added 7.

## Open

1. **For the controller (cross-file, test-update rule).** Wiring Review's guides (this task's C49 criterion) failed 7
   Round 7 base bodies in TASK-119's files, which TASK-119 runs whole later. They were updated (rules.crossFile), each
   as the old build updated it for TASK-022. One update removes a behaviour read rather than a look: Review.test.tsx
   "offers a swap on every movement" no longer expects "Swap air squat" for the warm-up movement — the concise guide has
   no Swap (C49; the inherited TASK-022 case asserts it). If that is judged "behaviour Round 7 lacks" under the rule,
   it needs the owner's word; the alternative is not to wire Review's guides, which contradicts this task's criterion.
2. UAT list: ledger `rules.forTask115`.
3. /history/:id: a Warm-up or Cooldown is drawn as the concise guide (as Round 7's History did under its sample);
   any logged rows those sections hold are not listed there [inferred: the live flow logs no warm-up sets].
4. Real phones and WebKit untested (Chromium and jsdom only).

## Next action

Controller: V2 verify and review.
