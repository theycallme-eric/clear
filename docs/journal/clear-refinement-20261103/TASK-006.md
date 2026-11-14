# TASK-006 — Timed Start/Pause/Resume/Finish action hierarchy (#633)

Body `clear-refinement-v2-20261109b`, attempt 1, base `c07c4ed` (after TASK-039 #679 and TASK-001 to
TASK-005 #680 to #684). Task-owned progress note: the approved exception to the shared daily journal
for this body. Only TASK-006 writes this file.

## Intended outcome

REQ-006 (C17, C18; G05; R39, R48, R66, R68, R98; AC-C17-01, AC-C18-01, AC-R006-01, AC-R006-02) is
delivered through the timed format controllers on the real `/workout` route (JOURNEY-006,
completion owner).

- Every timed action is one responsive, full-width row.
- The EMOM, AMRAP and For Time rows sit after the work and its prescription and before the card's
  Coaching and notes.
- The ladder keeps its top exception: after its identity and cap, before the rung row and the
  repetitive round list.
- The running controls are a secondary Pause beside the format's primary Finish or Finish early.
  While paused, Resume takes Pause's place.
- A section's Finish never finishes the workout.
- Pause follows the confirmed semantics (2 November 2026, retained by R98): it freezes the section
  clock and its cap while the workout clock continues, and Resume keeps the active time and the
  window left.

Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, stable states
`/gallery/refinements?state=ladder-4` and `?state=ladder-12`.

## Selected lifecycle (derived from the approved sources, not a new product decision)

C18 and AC-R006-02 say "retain the reviewed" vocabulary. The reviewed flow is R7's
`TimedWorkoutFlow`, whose shown Start/Pause/Resume/Finish flows R98 accepted. Its wording is in the
reviewed source (`code/reviewed-r7/src/ui/timed-workout-flow.tsx`) and the replay bundle:
`format === 'amrap' || format === 'emom' ? 'Finish early' : 'Finish'`.

| Format | Ready | Running | Paused | Ended |
| --- | --- | --- | --- | --- |
| EMOM | Start EMOM (primary) | Pause (secondary) + Finish early (primary) | Resume + Finish early | none |
| AMRAP | Start AMRAP | Pause + Finish early | Resume + Finish early | none |
| For Time | Start For Time | Pause + Finish | Resume + Finish | none |
| Ladder (raced: legacy, `for_time`, `capped_window`) | Start ladder, top slot | Pause + Finish | Resume + Finish | none |
| Scheduled ladder | Start schedule, top slot | nothing to press (its own lifecycle; R7 excluded it too) | n/a | none |

- Wording that already existed is unchanged: Start EMOM/AMRAP/For Time, Finish, Finish early, Start
  schedule and Finish workout.
- An AMRAP with no window kept its existing "Finish". The same rule applies to an EMOM with no
  window, because it has nothing to end early (`finishLabel`).
- What existing actions do is unchanged:
  - AMRAP Finish early still settles the window and offers the optional result.
  - For Time Finish still stamps the finish.
  - Finish workout is still the section save.
- New actions:
  - Pause and Resume on every raced format.
  - Finish early on the EMOM (R7's reviewed control). It stops the schedule where it is and
    records nothing (E01): the EMOM outcome stays `{}`.
  - Start, Pause and Finish on raced ladders (R66, R67, R68). They run the For Time clock owner.
    The ladder still records only its declared ending.

## Shared owner dispositions

- **TimedWorkoutFlow** (R7 owner; brief's shared owner): deliberately consolidated as
  `src/ui/timed-workout-flow.tsx` → `TimedWorkoutActions`.
  - R7's `TimedWorkoutFlow` replaced every timed renderer with one isolated proposal: its own
    schedule, score, result log and in-memory result adapter. Adopting it would have moved data and
    controller ownership, which the brief forbids.
  - The route's format controllers therefore keep their clocks, schedules, scores and writes. They
    compose this one owner for the part R7 and the accepted gallery share: the action hierarchy and
    its slot.
  - The lead control keeps its DOM position (Start → Pause → Resume), so focus survives each change.
- **Format controller owners:**
  - `EmomBlock`: Start moved out of `SectionTimer` to after the list and the rest note. Adds Pause,
    Resume and Finish early, the PAUSED and FINISHED EARLY phase words, and a truthful
    early-finish note.
  - `AmrapBlock`: the actions moved out of `Window` to after "Each round:". Finish early is now
    primary (C18). Adds Pause and Resume, plus a "Paused" label.
  - `ForTimeBlock`: actions after the work as before, now through the shared slot. Adds Pause and
    Resume. The clock says "Paused" and keeps "Cap in …" frozen with no urgency.
  - `LadderBlock`: `useLadderRace` drives the clock and the top-slot actions.
    - Raced ladders run EXE-04b's clock (`for-time.ts` persistence). The clock is drawn by the now
      exported `ForTimeClock` once started, with ladder words; Finish says "Finished", not
      "Finished under cap" (R69).
    - The scheduled ladder's Start moved into the same top slot.
- **State owners:**
  - `src/state/timed-lifecycle.ts` (new) holds the shared pause arithmetic: `pauseClock`,
    `resumeClock` (moves `startedAt` on by the pause), `pausedElapsedSeconds`, `clockStopMoment`
    and `restoredPause`, plus the vocabulary (`TimedLifecyclePhase`, `finishLabel`).
  - `for-time.ts` gains a `paused` phase, finishing at the pause, `forTimeTicking` and
    `forTimeLifecycle`.
  - `amrap.ts` gains a `paused` phase and finishing at the pause.
  - `emom.ts` gains `paused`/`endedEarly` on the view, `finishEmom` and an optional `finishedAt`.
  - `workout-persistence.ts` guards accept the optional `pausedAt` and the EMOM's `finishedAt`.
  - No new storage key, and no database column, field or write. Records written before this change
    parse unchanged.
- `src/ui/refinements/ladder.tsx` (accepted reference): **read; deliberately not adopted here.**
  Its `LadderPrescription` and `LadderCompletion` (compact rep-first prescription, live check-off,
  completion tiles) are C33–C36: TASK-012 and TASK-013. The gallery states draw the route's actual
  ladder renderer instead.
- `src/dev/gallery-refinement-flow.tsx`: **created, as a deliberate consolidation** of the
  reference's `GalleryLadderFlow`.
  - `?state=ladder-4` / `ladder-12` render the actual `LadderBlock` over the accepted composition
    (`src/dev/gallery-refinement-flow-data.ts`: push up 2…2n plus a fixed 4-rep burpee under one
    07:00 `capped_window` cap). They use memory-only storage, the shell's own
    `BlockCompletionProvider` over the gallery's refusing clients, and the in-memory coaching
    library.
  - The reference's synthetic timer, result log, Undo and `GalleryUrgency` are not copied. They are
    TASK-007, TASK-008, TASK-013, TASK-014 and TASK-046 work.
  - Register specimens `TimedActionsReady`, `TimedActionsRunning`, `TimedActionsPaused` and
    `TimedActionsLifecycle` also live here.
- `src/ui/refinements/presentation.css`: **adopted.** The accepted `.clr-timed-actions` recipe: a
  grid of `repeat(auto-fit, minmax(0, 1fr))` with a `--spacing-300` gap, controls 100% of their
  cell, labels centred. Tokens only.
- `src/ui/refinements/tokens.css`: **read; no new variable** (REQ-006 `semanticVariables: []`).
- `src/ui/refinements/workout-card.tsx`: **read; unchanged.** Its `coaching` slot is drawn last,
  so actions placed in the card's children always precede coaching (TASK-005's documented order).
- `movement.tsx`, `movement-readings.ts`, `overview.tsx`, `GroupExerciseCoaching`: unchanged.
- REUSE.md: one owner, no route-local look-alike, and the gallery draws the actual consumer.
- LOGGING-FIELDS.md: no field, reason or write added. The EMOM, AMRAP, For Time and Ladder result
  contracts are untouched (TASK-009, TASK-011, TASK-013, TASK-031, TASK-046).

## Changes

- New: `src/ui/timed-workout-flow.tsx`, `src/state/timed-lifecycle.ts`,
  `src/dev/gallery-refinement-flow.tsx`, `src/dev/gallery-refinement-flow-data.ts` and
  `src/test/timed-actions-fixture.ts`. The fixture is shared by check-01 and check-02: an EMOM with
  a 15 s rest window, a two-movement AMRAP, a For Time and the 12-rung long ladder in the
  workout's last section.
- Changed: `src/state/{emom,amrap,for-time,workout-persistence}.ts`,
  `src/ui/{emom,amrap,for-time,ladder}-block.tsx`, `src/ui/refinements/presentation.css` and
  `src/dev/gallery-refinements.tsx` (states `ladder-4`, `ladder-12`).
- Register: a `TimedWorkoutActions` entry with four specimens is added to
  `src/dev/gallery-registry.tsx`. `ForTimeClock` is exempted in `src/dev/gallery-registry.test.tsx`
  with its reason, following that file's pattern for `ForTimeBlock` and `EmomBlock`.
  `docs/design/library/COMPONENTS.md` was regenerated (66 entries).
- `PROJECT_MAP.md`: the refinements row names the new owner, the state module and the flow gallery
  file.
- Evidence: `evidence/refinement/task-006/required-cases.json` (check-01: 9 vitest cases; check-02:
  7 Playwright mobile cases). Receipts in `results/` were written by the guard.

## Tests added and changed

- New `src/ui/timed-workout-flow.test.tsx` (check-01, 9 cases). It runs over the real router at
  `/workout` with an injected `Date.now`, covers the gallery states, and applies the shared
  stylesheets.
  - Mutation checks, both restored afterwards:
    - Pause made primary: 4 cases failed.
    - Resume made not to shift the start: 2 cases failed.
- New `src/state/timed-lifecycle.test.ts` (10 pure cases, not a declared check). It covers the
  pause arithmetic per format, finishing while paused, round-trips through storage, records written
  before Pause, and dropped bad stamps.
- New `e2e/refinement/task-006.spec.ts` (check-02, 7 cases). It runs on a contained synthetic lane
  at 320 and 390 using Playwright's clock.
  - Covered: touch, keyboard, reduced motion, reload recovery and the gallery states.
  - Captures attached:
    - `<format>-{ready,running,paused}-phone-{320,390}`
    - `ladder-arrival-phone-{320,390}`, the viewport on arrival at the ladder header
    - `gallery-ladder-{4,12}-{ready,paused}-phone-320`
  - VISUAL-CONTRACTS ties no V/P image to C17 or C18. The comparable references are the accepted
    `ladder-4`/`ladder-12` states and the R7 replay timed scenes (`scene.html?view=timed&state=…`).
- Updated, superseded by approved criteria and citing them:
  - `src/ui/ladder-block.test.tsx`, "free-paced For Time never infers progress…": "no Start button
    at all" became "the ladder offers its own Start ladder (AC-R006-01, C18; R66, R67)". The case
    now also starts the clock and shows that elapsed time still marks no round live and records
    nothing.
  - `e2e/design-0143/workout-ladder.spec.ts` (backend lane): comment only, at "Only the scheduled
    ladder has a clock to start". The assertion (no clock stored for the unstarted free and capped
    ladders) still holds. It loads under `--list` and typechecks.

## Sweep (every spec and test under `e2e/` and `src/`)

Searched for: `Start EMOM|AMRAP|For Time|schedule|ladder`, `Finish early`, `'Finish'`, `Pause`,
`Resume`, `Finish workout`, `getByRole('timer')`, `expectHandsOff`, `Hit the time cap`,
`How did this block end`, the three timed storage keys, `clr-rail`, and button/animation/loop counts
in timed sections.

- Fixed: the two files above.
- Checked, not superseded:
  - `e2e/design-0143/workout-emom.spec.ts`, `workout-amrap.spec.ts`, `workout-ladder.spec.ts`,
    `workout-lifecycle.spec.ts`, `workout-formats.spec.ts`, `accessibility.spec.ts` and
    `e2e/core-loop.spec.ts`, all backend lane:
    - The `expectHandsOff` patterns (`minute done|log set`, `record rounds|…`, `round done|log set`)
      do not match Pause, Resume or Finish early.
    - `/^Finish/` on the non-last AMRAP section matches only Finish early.
    - `loops()` counts `data-loop` claims; the primary glow is a static filter.
    - The 8-rung accessibility ladder's rail still fits at 390.
    - All load under `--list`. Running them here fails at their credentials gate ("Needs
      SUPABASE_URL…"), as expected without `.env.runner.local`.
  - `e2e/design-0143/task-040-lifecycle.spec.ts`: excluded for 0.14.3.
  - Run directly, not through the guard, so earlier receipts were not rewritten: `e2e/refinement/task-001`
    to `task-005.spec.ts`, 31/31 passed. `e2e/ui-polish-b05-scroll-boundaries.spec.ts`, including the
    ladder rung rail cue case, 12/12 passed.
  - `e2e/ui-polish-b05-movement-countdown.spec.ts`: every case stops at the absent B05 `.evidence`
    reference image (pre-existing, recorded by TASK-001 to TASK-005). Its AMRAP lines
    (`Start AMRAP`, the `Time remaining` timer) are unchanged by this task.
  - All `src/` tests: 257 files, 6141 passed.

## Failures and corrections

- Wrong arithmetic in the first session-time expectation; the For Time fixture's label is
  "The work:" (one movement). Both fixed in the test.
- Direct block mounts reused the route's first block id from `localStorage`. Storage is now cleared
  before them.
- `react-refresh/only-export-components` warnings from helpers exported by component files. Moved
  `finishLabel`/`TimedLifecyclePhase` to `state/timed-lifecycle.ts` and `forTimeTicking`/
  `forTimeLifecycle` to `state/for-time.ts`. No warning was added in any touched file (counts
  compared against `HEAD` per file).
- The gallery used an inert `BlockCompletionContext`. `block-completion-ownership.test.ts` allows
  only the shell's provider, so the gallery now uses the actual `BlockCompletionProvider` over the
  refusing clients.
- The registry gate flagged the newly exported `TimedWorkoutActions` and `ForTimeClock`. The first is
  registered; the second is exempted with its reason.
- e2e: `page.clock.install` lets time drift during load, so the touch case now holds the clock
  (`pauseAt`) for exact readings. axe schedules timers, so the clock is resumed before scanning.
  Reload recovery uses relative readings.
- e2e: the touch case hit the 30 s default timeout under the guard. Captures were batched into one
  tall viewport per state, and the long journeys set 120 s.
- e2e reduced motion: animations are the app's 0.01ms hard cut (`a11y.css`). The spec asserts
  duration ≤ 0.01ms and ≤ 1 iteration rather than "not running".
- **Pre-existing accessibility finding, scoped not hidden.** The accepted 12-rung ladder makes the
  existing read-only rung row (`LadderRungs` over the DS `OverflowRail`, unchanged here: "read-only
  … no focus stop") overflow at phone widths (scrollWidth 428 > clientWidth 324 at 390). axe
  `scrollable-region-focusable` (WCAG 2.1.1) flags that scroller.
  - axe's first scan of a page (`visit`'s) does not report it; every later scan does. This was
    reproduced on the gallery `ladder-12` state with no interaction.
  - `checkJourneyA11y` in the spec runs every other rule on every node. It requires that rule's
    violations to be exactly read-only rung rail scrollers and nothing else, and attaches them.
  - Not fixed here: the row's redesign is TASK-012's compact prescription and TASK-013's wrapping
    tiles "without horizontal overflow". Changing `LadderRungs` would be another task's owner.
    `ui-polish-b05-scroll-boundaries` also asserts this rail's scrolling cues.
- Observation, not this task: `e2e/public-gallery.spec.ts` "Library overview" and "App-composed" fail
  on axe `heading-order` (`… .clr-stack--tight.clr-stack > div > h6`). They fail identically on the
  base `c07c4ed`, run in a scratch `git worktree` that was then removed. Pre-existing.

## Verification (this worktree, uncommitted candidate, 2026-11-09)

- `npm ci`: exit 0.
- `node scripts/refinement/run-required-check.mjs --task TASK-006 --check check-01 -- npx vitest run src/ui/timed-workout-flow.test.tsx --passWithNoTests=false`:
  PASSED. Native 9 total, 9 executed, 9 passed, 0 failed/skipped/todo.
- `node scripts/refinement/run-required-check.mjs --task TASK-006 --check check-02 -- npx playwright test e2e/refinement/task-006.spec.ts --project=mobile`:
  PASSED. Native 7 total, 7 executed, 7 passed, 0 failed/skipped/todo (synthetic origin; no
  credentials used). The first guarded run was REJECTED: one case hit the 30 s timeout. It passed
  after the correction above.
- Manifest sha256 `5a4519ac8d24b83b91089e58bcfaabb45e2e6461c05b959c4af8197326f369f5`.
- `npm run build`: exit 0 (includes `tsc --noEmit` over `src` and `e2e`). `npm run lint:ds`: exit 0.
  `node scripts/gallery-index.mjs --check`: 66 verified.
- `npm test`: 257 files, 6141 tests passed, 0 failed.
- `npx playwright test <every non-B05 spec> --list --project=mobile`: 383 tests in 46 files.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006`:
  PASSED, exit 0. TASK-001 to TASK-006 each have "current passing receipts".

## Earlier-task receipts

None refreshed. No file named in another task's `required-cases.json` was edited
(`movement-list.test.tsx`, `movement-identity.test.tsx`, `block-panel.test.tsx`,
`summary-facts.test.tsx`, `group-exercise-coaching.test.tsx`, `e2e/refinement/task-001` to
`task-005.spec.ts`). `git diff -- evidence/` is empty for every earlier task. The final verifier
above confirms their receipts are current.

## Open assumptions / unresolved

- EMOM Finish early follows R7's reviewed control (accepted by R98). G05's headline names only
  "secondary Pause" for EMOM. If the owner wants a running EMOM without Finish early, that is a
  one-line change (no `onFinish`).
- The early-finish note ("Finished early, in minute N of M. Continue when you are ready.") and the
  PAUSED / FINISHED EARLY / Paused words are minimal truthful state copy. The copy pass (R45,
  TASK-037) and the EMOM end log (TASK-011, which replaces the natural-end note with a Log action
  per R43) may reword them.
- Raced ladders now show a clock, but record no elapsed time or cap result, and their ending stays
  declared. Importing clock and timeout outcomes into results is TASK-013, TASK-031 and TASK-046.
  Durable draft/cap recovery beyond the stored clock is TASK-032 and TASK-048.
- The scheduled ladder has no Pause; its rounds start on the clock (its existing lifecycle, which
  R7 also excluded).
- The 12-rung read-only rung row's keyboard reachability (above) is left to TASK-012 and TASK-013.
  TASK-042's aggregate scan of `ladder-12` will see it until then.
- Focus is not moved after Finish removes the action row (unchanged from the existing For Time
  Finish). The next controls stay reachable by Tab.

## Next action

Controller verification and commit.
