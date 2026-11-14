# TASK-003 — Consistent format badges and truthful prescribed load (#630)

Body `clear-refinement-v2-20261109b`, attempt 1, base `90b52b8` (after TASK-039 #679, TASK-001 #680
and TASK-002 #681). Task-owned progress note: the approved exception to the shared daily journal for
this body. Only TASK-003 writes this file.

## Intended outcome

REQ-003 (C08, C09, C10, C11; AC-R003-01…04; G03, G24; R04, R31, R38, R41, R47, R51, R59, R60, R65,
R97) delivered through the shared block header, `loadText` and the prescription formatters on the
real `/review` and `/workout` routes (JOURNEY-003, completion owner): every block's badge names its
format or shape alone, below its title, in one position whatever its label's length and never
truncated; the duration, cap, rounds and scheme are readable below the badge; the prescribed load
stays in its normal target row in both views, including the live EMOM, AMRAP, For Time and ladder;
Review drops only the generic `Rest 60s` lines of EMOM, AMRAP and For Time movements; the verified
circuit has no Review weight change and keeps its actual weight entry in its optional logger.
Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, stable state
`/gallery/refinements?state=cards`.

## Shared owner dispositions

- `src/ui/refinements/movement.tsx` — **adopted and extended in place.** `MovementGroupHeader` gains
  a `meta` slot (`[data-structure-meta]`, the shared quiet data label) for what the badge leaves out.
  `MovementIdentity` and `MovementList` unchanged.
- `src/ui/refinements/workout-card.tsx` — **extended (deliberate consolidation).** `WorkoutCard`'s
  `badge` slot is replaced by `structure` (the block's `StructureIdentity`): the card itself draws
  `StructureBadge formatOnly` below the title and `structureDetailText` below the badge, so no
  consumer can put the details back in the badge or move it. This is the reference
  `RefinementWorkoutCard`'s format-only badge plus `clr-timed-meta` line, composed from real data
  rather than the reference's hard-coded strings. `ReviewMovement` / `LiveMovement` unchanged.
- `src/ui/refinements/presentation.css` — `.clr-movement-group-header` is now one stacked column
  (`flex-direction: column; align-items: flex-start; flex-wrap: nowrap`), the accepted reference's
  own final rule (C09); new `.clr-movement-group-header__meta`. Tokens only.
- `src/ui/refinements/tokens.css` — **read; no new variable.** REQ-003's coverage entry lists no
  semantic variables; the header uses existing spacing and the shared text role.
- `src/ui/refinements/movement-readings.ts` — **adopted unchanged**: `liveMovementReadings` (Review's
  `loadText` + `equipmentName`, the duplicate-Bodyweight rule) is now what the EMOM, AMRAP, For Time
  and ladder movements read.
- `src/ui/workout-chrome.tsx` — `StructureBadge` gains an opt-in `formatOnly` (default unchanged, so
  History's `SessionSectionCard` and `FormatPreview` keep their full reading). `SectionHeader`'s
  "Structures in this section" list passes `formatOnly`, so `/workout` shows no badge with a
  duration inside it (C08); its composition otherwise stays TASK-027's (compact navigator, C54).
- `src/state/workout-progress.ts` (structure identity owner) — `StructureIdentity.format` (the badge's
  words) and `structureDetailText()` (the details line). `format` is `LADDER` exactly when the ladder
  renderer performs the block (`isLadderScheme && (for_time || explicit ladder_timing)`, the
  `blockRendererFor` dispatch rule), otherwise the structure's label. `StructureColumns` gains an
  optional `ladder_timing`.

## Changes

- C08/C09/AC-R003-01: `BlockPanel`, `AmrapBlock` (now drawn in the shared `WorkoutCard` instead of its
  own badge-left/count-right row) and `ReviewSection` pass `structure`; the live section's structure
  list is format-only. Review keeps its existing rule of no badge on a plain standard block.
- C10/AC-R003-02: EMOM, AMRAP, For Time and ladder movements show the prescribed load through
  `liveMovementReadings` and the shell's unit (`useShellWeightUnit()`, new in `state/set-logging.ts`:
  the SetLogging provider's profile unit, `null` outside the shell → number without a unit). The
  explicit-timing ladder states the load in each round's target line (` · 15 kg`, in a
  `[data-movement-load]` span); the legacy ladder's movement row carries it as `load`.
- C11/AC-R003-03: `state/review.ts` reads no per-movement `rest` for `emom`/`amrap`/`for_time` blocks.
  The column is still persisted (Start sends `rest_seconds` unchanged); the block's own rest
  (`roundRest`, the EMOM's in-minute window) and every live clock stay.
- AC-R003-04: `LoadSuggestionView.adjustable` (false for a movement in a `circuit` block, set by
  `reviewLoadSuggestions`). `LoadSuggestionDialog` then explains the number without the
  "Your weight" field, "Use this weight" or "Use the suggestion". Every other structure keeps the
  override (not extrapolated). The circuit's existing optional logger (`Rest for <movement>` →
  set sheet with Weight) is unchanged.
- Gallery `/gallery/refinements?state=cards`: both contexts use `WorkoutCard structure`; the live
  timed movements carry their prescribed load. Registry: `MovementGroupHeader` specimens are
  format-only with details, plus a new "long label, short and long formats" specimen;
  `LoadSuggestionDialog` gains a "circuit movement" specimen; summaries updated;
  `docs/design/library/COMPONENTS.md` regenerated (61 entries).
- Fixture `src/test/format-badges-fixture.ts` (shared by check-01 and check-02): standard (absolute,
  % 1RM, RIR, last session), superset (dumbbell pair), verified circuit, EMOM (15 s window), AMRAP,
  plain For Time and a true timed ladder (explicit `capped_window`), timed movements with
  `rest_seconds: 60`; anchors for the circuit's swing and the back squat.
- Evidence: `evidence/refinement/task-003/required-cases.json` (check-01: 12 vitest cases; check-02:
  5 Playwright mobile cases), receipts written by the guard.

## Decisions recorded (not product decisions; derived from the approved sources)

- LADDER badge: G03 accepts "format-only badge treatment … including LADDER"; R7's reviewed code used
  `glyph === 'Ladder'`. The dispatch rule is used instead so a circuit with a `ladder_down` scheme
  (rendered by `CircuitBlock`) stays `CIRCUIT`, and a For Time `pyramid` (rendered by `LadderBlock`)
  is `LADDER`. The scheme (`LADDER UP`, `PYRAMID`) stays in the details line (R65: keep ascending/
  descending meaning).
- Live superset rounds: the shell's identity has never stated a superset's set count as rounds
  (`structureDetail`: "the prescription already says per exercise"); Review does (`groupRounds`).
  Unchanged here: the live superset's count stays in `Set 1/3` and `3 × 10 reps`, so its live header
  has no details line. Badge position is identical either way.
- Per-hand meaning: no prescription column states per-hand, and the formatter has none. The meaning
  stays the equipment's (`dumbbell pair` beside the name) next to the unchanged `loadText` reading; no
  per-hand prose or range is added (R04 "without adding explanatory prose"; G24/REQ-036: per-hand
  semantics and ranges are TASK-036's definition work).
- "Review Change weight": the current app has no control labelled so (it was the F08 preview
  proposal). The only Review weight-change path is OVR-01c's per-prescription override, offered on an
  anchored, loaded-function movement — reachable on an accessory circuit. That override is what is
  removed for circuits. A conditioning circuit had no suggestion and still has none.

## Tests added and changed

- New `src/ui/block-panel.test.tsx` (check-01, 12 cases over the real router, Review and Workout
  routes and the gallery state; criteria in the manifest).
- New `e2e/refinement/task-003.spec.ts` (check-02, 5 cases, contained synthetic lane at 320/390,
  reduced motion; attaches `review-*`/`workout-*` scroller captures and one capture per block card per
  context, plus `review-anchored-phone-320` and `gallery-cards-phone-320`).
- Updated, each citing its criterion in a comment:
  - `src/app/Review.test.tsx` — round count "in the badge" → beside it (AC-C08-01); STANDARD badge with
    its scheme in the details line (AC-C08-01); For Time ladders listed as LADDER (AC-C08-01, G03).
  - `src/app/review-screen.test.tsx` — superset/circuit badge text and rounds line (AC-C08-01, AC-C09-01).
  - `src/app/Workout.test.tsx`, `src/ui/workout-chrome.test.tsx` — section structure list is
    format-only; the window is on the block card (AC-C08-01).
  - `src/ui/amrap-block.test.tsx`, `src/ui/circuit-block.test.tsx`, `src/ui/emom-block.test.tsx`,
    `src/ui/ladder-block.test.tsx` — badge text and the details line (AC-C08-01, AC-R003-01).
  - `src/ui/movement-identity.test.tsx` (TASK-002 check-01 target) — `SUPERSET · 3 ROUNDS` /
    `CIRCUIT · 2 ROUNDS` in the badge and "badge on the header's far side" → format-only badge with
    the rounds below (AC-C08-01, AC-C09-01).
  - `e2e/refinement/task-002.spec.ts` (TASK-002 check-02 target) — the same badge texts, and the
    conditional "badge on the right" geometry → badge below the identity at the header's start
    (AC-C09-01).
  - Fixture-only type maintenance (adding `format` to literal identities, no assertion changed):
    `src/state/block-completion-provider.test.tsx`, `src/state/conditioning.test.ts`,
    `src/ui/block-renderers.test.tsx`, `src/dev/gallery-registry.tsx`.

## Sweep (every spec and test under `e2e/` and `src/`)

Searched `e2e/**/*.ts` and `src/**/*.test.*` for badge strings with details (`· N ROUNDS`, `MIN`,
`MIN CAP`, `LADDER UP/DOWN`, `PYRAMID`, `N+1`, `INVERSE`, `FIXED INTERVAL`), `Structures in this
section`, header geometry (`clr-movement-group-header`, `data-block-top-row`, badge left/right),
Review per-movement `Rest Ns` on timed blocks, the AMRAP header row/`N movements`, the load
suggestion's override (`Use this weight`, `Your weight`, spinbutton) and `StructureIdentity` literals.

- Fixed (backend lane, not runnable here; each loads under `--list`):
  - `e2e/design-0143/workout-lifecycle.spec.ts` — `REVIEW_SECTIONS` badges → format-only with a
    `details` field read from `[data-structure-meta]` (ladder → `LADDER` / `2 MIN CAP · LADDER UP`);
    the containment evidence note's wording. Pre-existing staleness recorded by TASK-002 (section tabs
    by stored title, `Log set 1 of …` on landing) is not TASK-003's and was not touched.
  - `e2e/design-0143/task-040-home-review.spec.ts` — superset card badge and rounds read separately.
  - `e2e/design-0143/workout-circuit.spec.ts` — `CIRCUIT · 3 ROUNDS` → badge `CIRCUIT` + `3 ROUNDS`.
  - `e2e/design-0143/workout-formats.spec.ts` — the ladder section's structure list now says `LADDER`.
- Fixed (synthetic, run): `e2e/refinement/task-002.spec.ts` (above).
- Checked, not superseded: `e2e/design-0143/workout-amrap.spec.ts` (no header reads),
  `e2e/design-0143/format-preview.spec.ts` (FormatPreview keeps the full badge),
  `e2e/design-0143/task-040-lifecycle.spec.ts` (historical, excluded for 0.14.3),
  `e2e/ui-polish-b05-rest-log.spec.ts` / `-active-hierarchy` (live rest, not Review),
  `e2e/refinement/task-001.spec.ts` (rail checks only; passes), History/session-detail tests
  (`StructureBadge` default unchanged), `src/ui/load-suggestion.test.tsx` and `src/app/Review.test.tsx`
  override cases (standard/primary movements; still offered), `src/state/review.test.ts` (rest cases
  are standard blocks), `src/state/workout-progress.test.ts` (`toMatchObject`).
- Left as is, local-only B05 (cannot load here: each reads an absent `.evidence` reference image at
  module load, as TASK-001/002 recorded): `e2e/ui-polish-b05-structure-badges.spec.ts` (expects
  `CIRCUIT · 2 ROUNDS`-style badges and the section list's full readings) and
  `e2e/ui-polish-b05-review-groups.spec.ts` (`badge: 'SUPERSET · 3 ROUNDS'`). Both are now also
  superseded by C08/C09; follow-up where the `.evidence` references exist.

## Failures and corrections

- Expected live superset details to match Review's `3 ROUNDS`; the shell's identity deliberately has
  none (see Decisions). The fixture now states per-context details, and the check asserts the live
  superset's `Set 1/3` / `3 × 10 reps` instead.
- `Rest 60s` check was too broad: the circuit's `Rest 60s between rounds` is real round rest. Narrowed
  to `Rest 60s(?! between rounds)` plus per-detail-row checks.
- Review-only assertions were read after navigating to Workout (`cards('review')` empty); moved before
  Start.
- Browser "badge on one line" counted the glyph's box as a second line; the counter now reads text
  nodes only.
- Card captures were overlapped by the pinned header/footer; card images are taken in a taller
  viewport at the same width, which is then restored.

## Verification (this worktree, uncommitted candidate, 2026-11-09)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-003 --check check-01 -- npx vitest run src/ui/block-panel.test.tsx --passWithNoTests=false`: PASSED, 12/12 executed and passed, 0 skipped.
- `node scripts/refinement/run-required-check.mjs --task TASK-003 --check check-02 -- npx playwright test e2e/refinement/task-003.spec.ts --project=mobile`: PASSED, 5/5 executed and passed, 0 skipped (synthetic origin; no credentials used).
- `npm run build`: exit 0 (includes `tsc --noEmit` over `src` and `e2e`). `npm run lint:ds`: exit 0.
  `node scripts/gallery-index.mjs --check`: 61 verified.
- `npm test`: 253 files, 6102 tests passed, 0 failed.
- `npx playwright test e2e/refinement/task-001.spec.ts e2e/refinement/task-002.spec.ts --project=mobile`
  (run directly, not through the guard): 16/16 passed.
- `npx playwright test <the six edited specs> --list --project=mobile`: 29 tests in 6 files, exit 0.
- `npx eslint` on every edited spec, the fixture and the new test: 0 errors.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-003`:
  passed (current receipts). With `TASK-002` included it first reported TASK-002's two receipts
  stale; refreshed under the controller rule (next section), after which all three are current.
- Visual check of the per-card captures at 320: AMRAP, FOR TIME, SUPERSET and LADDER cards show the
  format-only badge below the section label, the details line below it and the load in each target
  row (ladder rounds `2 reps dumbbell thruster · 15 kg`).

## TASK-002 receipt refresh (controller rule for this body, 2026-11-09)

Controller rule: a task that supersedes an earlier task's check target refreshes that task's receipts
by re-running the earlier task's exact approved guard commands, with that task's `required-cases.json`
unchanged, and records it in its own progress note.

- Why: C08/C09 (AC-C08-01, AC-C09-01) superseded assertions in TASK-002's two check targets,
  `src/ui/movement-identity.test.tsx` (check-01) and `e2e/refinement/task-002.spec.ts` (check-02):
  rounds-in-badge `SUPERSET · 3 ROUNDS` / `CIRCUIT · 2 ROUNDS` and "badge on the right" → format-only
  badge below the identity with the rounds in `[data-structure-meta]`. No declared case was renamed,
  removed or skipped. The changed target hashes made both committed TASK-002 receipts stale.
- Before: `verify-delivery-evidence … --mode final --tasks TASK-001,TASK-002,TASK-003` REJECTED with
  exactly `TASK-002 check-01: stale receipt: target src/ui/movement-identity.test.tsx changed after the
  run` and the same for check-02 / `e2e/refinement/task-002.spec.ts`.
- Re-run from the worktree root, TASK-002's approved commands verbatim:
  - `node scripts/refinement/run-required-check.mjs --task TASK-002 --check check-01 -- npx vitest run src/ui/movement-identity.test.tsx --passWithNoTests=false`:
    PASSED, exit 0; native 11 total, 11 executed, 11 passed, 0 failed/skipped/todo; all 11 declared
    cases passed.
  - `node scripts/refinement/run-required-check.mjs --task TASK-002 --check check-02 -- npx playwright test e2e/refinement/task-002.spec.ts --project=mobile`:
    PASSED, exit 0; native 7 total, 7 executed, 7 passed, 0 failed/skipped/todo; all 7 declared
    cases passed (synthetic lane, no credentials).
- Refreshed receipts: `evidence/refinement/task-002/results/check-01.json` and `results/check-02.json`.
  The only diff in each is its target's `sha256` (check-01 `974028b5…` → `4ca7c406…`, check-02
  `9f53c7ed…` → `44757e42…`, each equal to the current file).
- Manifest unchanged: `evidence/refinement/task-002/required-cases.json` was not edited; sha256
  `01f085e068b230a7c9a12a451867586aa8c58157b038d3ed0118623fc4c05c09` before and after, the same
  hash both receipts record. `git diff` under `evidence/refinement/task-002/` shows only the two
  receipts.
- After: `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003`:
  PASSED, exit 0; TASK-001, TASK-002 and TASK-003 each "current passing receipts".
- Then confirmed nothing moved: TASK-003 check-01 PASSED (exit 0; 12/12 executed and passed, 0
  skipped), TASK-003 check-02 PASSED (exit 0; 5/5, 0 skipped), `npm test` exit 0 (253 files, 6102
  tests passed, 0 failed). The final verifier for TASK-001,TASK-002,TASK-003 again PASSED, exit 0, with
  all three current, and the TASK-002 manifest hash unchanged.

## Open assumptions / unresolved

- Live superset header shows no rounds line (pre-existing identity rule); a product call if the owner
  wants Review's `N ROUNDS` echoed live.
- History (`SessionSectionCard`) and `FormatPreview` keep the full `EMOM · 10 MIN` badge: not on
  JOURNEY-003's routes. Carrying C08 there is a separate change.
- The explicit-timing ladder's round lines repeat the load per round until TASK-012's compact ladder
  prescription replaces them.
- Per-hand semantics and load ranges: TASK-036's definition (no column exists).

## Next action

Controller verification and commit; TASK-036 consumes the AC-R003-04 evidence (check-01
`AC-R003-04 …`, check-02 `AC-R003-04 keyboard and touch …`).
