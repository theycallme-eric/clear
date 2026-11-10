# TASK-014 — Accidental Finish recovery with aligned quiet Undo (#641)

Body `clear-refinement-v2-20261109b`, attempt 1, base `5bdd373` (after TASK-039 #679, TASK-001 to
TASK-013, TASK-030 and TASK-032, #680 to #694). Task-owned progress note: the approved exception to
the shared daily journal for this body. Only TASK-014 writes this file.

## Intended outcome

REQ-014 (C38, C39, C60; R124, R130, R141, R145; P04; AC-C38-01, AC-C39-01, AC-C60-01, AC-R014-01,
AC-R014-02, AC-R014-03) through `TimedWorkoutFlow` / `TimedResultLog`'s completion action on the real
`/workout` route and the ladder's end log. JOURNEY-014, completion owner: a ladder attempt has
checked progress and a draft, Finish is tapped by accident, and the quiet `Undo finish · Resume
ladder` — below Complete / Incomplete, before Rounds completed, its visible text at the dynamic
rounds-completed count's left edge — returns the same attempt (progress, draft, running or paused
state, original clock and cap) until a successful save, with no confirmation. Accepted gallery
reference `eded158cfd928d382c9a9409e2c372270312741d`, stable states `/gallery/refinements?state=ladder-4`
and `?state=ladder-12`.

## Selected design (from the approved sources; no new product decision)

### Presentation (C39, C60, AC-R014-01, AC-R014-02; R130, R141; P04)

- **Owner.** `TimedResultLog` gains a structured `completionAction?: { label, onAction } | null` for
  its For Time / ladder family. The log draws it — the existing DS `Button`, `variant="quiet"`,
  `size="sm"`, inside `<div class="clr-timed-undo" data-timed-undo>` — between the Work completed
  `ChoiceGroup` and `LadderCompletion` in the same result group (the accepted
  `{completionAction}` slot). A consumer cannot draw a framed CTA there: the log owns the look, the
  consumer owns whether it is offered and what it does. It is not drawn once `saved`.
  - Deliberate consolidation, recorded: the reference passed a `ReactNode`; a structured prop keeps
    one presentation owner and needs no new exported component (no new register entry).
- **Alignment.** The count's text starts at the result group's content edge (`LadderCount` is a
  plain `<p>` in a padding-free fieldset). The Undo's text must start there too. Recipe in
  `presentation.css` (tokens only; no route CSS; `tokens.css` read, no variable needed):
  `.clr-timed-undo { display: flex; justify-content: flex-start }`,
  `.clr-timed-undo > .clr-bleed { margin-inline: calc(var(--spacing-200) * -1) }` and
  `.clr-timed-undo button { padding-inline: var(--spacing-200) !important; margin: 0;
  justify-content: flex-start; text-align: start }`. The inherited inset (`--spacing-300`, set
  inline by the DS Button, hence `!important`) is replaced by `--spacing-200` and the same amount is
  given back outside the box, so **no inset is left on the text**.
  - **Deliberate refinement of the accepted recipe, recorded.** The reference removed the padding
    outright (`padding-inline: 0 !important; margin: 0`). I first adopted it exactly; the browser
    capture then showed the chamfer's doubled focus frame (2 × `--border-width`, inside the box)
    drawn over the first and last letters, and the hover fill ending flush with them. R141 / R145 leave target dimensions to
    engineering ("touch-target dimensions are flexible"), so the box now reaches 8 CSS px past the
    text on both sides: the visible text start is identical (measured), the look at rest is
    identical (quiet: no frame, no fill), the target is wider, and the focus frame clears the
    text. The box starts 4 CSS px inside the card body's own frame (probed: card body at 26, box at
    30, no clipping ancestor before the page scroller), so nothing is clipped.
- **"Spacing" (R141: "style, or at least copy the spacing").** Read as the visible text's left start
  and inset — the defect R141 and P04 describe — not a font, case or colour redesign, which R141
  says is not mandatory and AC-R014-02 says to preserve (quiet/link styling). The quiet button keeps
  its own uppercase, tracking and weight. The vertical rhythm is the group's existing
  `--spacing-400` gap on both sides (measured below).
- **Height and target.** The block size is untouched: the DS Button's `min-height:
  var(--control-height)` (40 CSS px) — C39's "same vertical height". Its width is the text's plus
  8 CSS px each side (247.4 CSS px), so the target stays usable (R141: dimensions flexible).
- **No confirmation** (R124): one press; no dialog, `confirm` or alert.
- **Focus.** The pressed Undo disappears with the ended log. When it held the focus (keyboard, or a
  click that focuses), the focus goes to the restored race's lead control (Pause when running,
  Resume when paused), through a new optional `leadRef` on `TimedWorkoutActions`. Without it the
  focus fell to `body`.

### Clock truth (C38, AC-R014-03; R124)

TASK-032's `undoLadderFinish` semantics were checked against C38 / AC-R014-03 / R124 and **kept
unchanged** (no conflict found, so the owner was not edited):

- **Running Finish → Undo**: the clock resumes from the same `startedAt`, so the time spent finished
  counts and none is granted ("as though it had not occurred … rather than granting hidden extra
  active time"); the cap left is the original cap's. Matches the accepted gallery, whose clock keeps
  ticking while finished.
- **Paused Finish → Undo**: paused again at the same `pausedAt`; a paused Finish never expires.
- **Progress** comes back from the log's rounds (the reference's `setProgress(draft.highestRung)`),
  else the checkpoint's. **Entries** stay (effort, which is still the renderer's memory, survives
  because the log does not remount). **The answer** goes back to its pre-Finish value, so an answer
  given to the ended attempt is undone and no stale Complete/Incomplete survives the Undo.
- **Original cap**: `ladderUndoAvailability` says `expired` once undoing would resume at or past
  `originalCapSeconds`. The renderer re-derives the read model each second while a running Finish's
  Undo can still run out (`undoExpiry` in `ladder-block.tsx`), so the action is withdrawn at that
  moment with nothing pressed. The route shell's session clock happened to re-render the ladder each
  second anyway; the gallery has no such clock, and its check proves the tick (mutation M1).
- **The cap itself is never undone** (no checkpoint): only an athlete's Finish is.
- **No accidental whole-workout completion**: Finish and Undo write no row, call no session
  completion and stay on the section; Finish workout stays the shell's forward action.

### Save boundary with TASK-048 (AC-R014-03 "Successful Save ends Undo availability")

- Found: the forward action's `completeSection` → `remember(blockId)` and its `onContinue()` render
  in one batch, so the ladder unmounted before its `recorded` effect ran. The TASK-013 reviewer saw
  the same ("the local record stays save 'unsaved' until the ladder remounts"). A reload whose
  performed read failed or was slow therefore restored a saved attempt **with its Undo checkpoint
  open** — Undo offered after a successful save.
- Fix, through TASK-032's interfaces and the existing recorded fact (the brief's "and/or the recorded
  flag"):
  - `BlockCompletionApi.onBlockRecorded?(blockId, listener)`: the provider calls listeners in the
    same act as `remember` (this device's insert answered, a 23505 row already there, or the
    performed read), before `isBlockRecorded` renders and before the forward action moves on. It
    is the same fact as `isBlockRecorded`, not a writer.
  - `usePersistedLadder().markRecorded()`: applies TASK-032's `ladderRecorded` now (the `recorded`
    option's transition, without waiting for a render).
  - `LadderBlock` subscribes `markRecorded` for its block.
- **Not done, left to TASK-048**: `saveSucceeded` / `saveFailed` with the attempt id captured when
  the forward action began, the `saved-here` vs `saved-elsewhere` distinction on screen, visible
  failure/retry, and row readback. Closing through `ladderRecorded` keeps today's saved display
  (`saved-elsewhere`: no answer claimed, chips disabled) exactly as TASK-010 / TASK-013 assert it —
  so the out-of-scope "just-saved ladder shows no answer" partial-save display is unchanged and still
  TASK-048's. A failed save changes nothing (Undo and the draft stay).

### Family dispositions

- **Ladder (raced: legacy, `for_time`, `capped_window`)**: Undo, as above. JOURNEY-014's entry and
  the gallery states are ladders, and R124/R130 name "Undo finish / Resume ladder".
- **Scheduled ladder**: no Finish, so never an Undo (no checkpoint).
- **For Time**: **no Undo under this brief.** Its Finish is the athlete's report that the work is
  done (TASK-010's Complete starting point), not the ladder attempt R124 describes; its log offers no
  completion action (asserted). Its `workCompleted` semantics are TASK-010's, unchanged.
- **`workCompleted` where Undo exists**: the ladder never writes it. A ladder clock adopted from an
  older build's For Time record does not carry its `workCompleted` (TASK-032); the check proves an
  older `workCompleted: true` beside an adopted clock never becomes the ladder's answer, before or
  after Undo, and the For Time record is left byte-identical. The ladder's own answer is restored to
  its pre-Finish value by Undo. (This also closes TASK-032's reviewer-noted surviving mutant
  "adopting a legacy For Time workCompleted as the ladder answer".)

## Gallery (templates/gallery-authority.md)

- `?state=ladder-4` / `ladder-12` render the route's own `LadderBlock`, so after Finish they now draw
  the route's actual Undo (consumer adoption, memory `ShellStorage`, the shell's own
  `BlockCompletionProvider` over the gallery's refusing clients; no writer, no network). Their doc
  comment says so.
- Register: one new `TimedResultLog` specimen, `Ladder · just finished, Undo offered`
  (`TimedResultLogLadderUndo`, memory only); `COMPONENTS.md` regenerated (72 entries).
- TASK-010's `?state=ladder` is unchanged: its attempts (an older build's finished clock, a cap) are
  never undoable.
- Presentation authority only: no behaviour or data came from the gallery that the approved
  criteria and TASK-032 owner did not already define.

## Changes

- Source:
  - `src/ui/refinements/timed-result-log.tsx`: `completionAction` (`CompletionAction`), drawn between
    the completion row and the rounds; not drawn once saved.
  - `src/ui/refinements/presentation.css`: the accepted `.clr-timed-undo` recipe (alignment only).
  - `src/ui/timed-workout-flow.tsx`: optional `leadRef` on `TimedWorkoutActions`' lead control.
  - `src/ui/ladder-block.tsx`: Undo offered while `view.undo.available`; `undoExpiry` tick; focus
    return; `onBlockRecorded` → `markRecorded` subscription.
  - `src/state/block-completion.ts`: optional `BlockCompletionApi.onBlockRecorded`.
  - `src/state/block-completion-provider.tsx`: listeners, called in `remember` before
    `setRecorded`; supplied through the memoised seam.
  - `src/state/workout-persistence.ts`: `PersistedLadder.markRecorded()` (`ladderRecorded`, now).
  - `src/state/ladder-recovery.ts`: **unchanged** (semantics confirmed, see above).
- Gallery / register: `src/dev/gallery-refinement-flow.tsx` (doc; `TimedResultLogLadderUndo`
  specimen), `src/dev/gallery-registry.tsx` (specimen and summary), `docs/design/library/COMPONENTS.md`
  (regenerated), `src/dev/gallery-refinement-forms.tsx` (doc comment only).
- Docs: `src/state/README.md` (TASK-014 row: done), `PROJECT_MAP.md` (the new provider → renderer
  flow), `src/data/refinement-logging-contract.ts` and `docs/specs/LOGGING_FIELD_CONTRACT.md` (ladder
  draft text), `src/ui/refinements/ladder.tsx` (doc comment only).
- Tests: `src/ui/timed-workout-flow.test.tsx` (7 new cases), `src/state/block-completion-provider.test.tsx`
  (2 new cases), new `e2e/refinement/task-014.spec.ts` (5 cases), `e2e/refinement/task-013.spec.ts`
  (one superseded tab-order step, below).
- Evidence: `evidence/refinement/task-014/required-cases.json` and the guard's receipts.
- Untouched: `supabase/`, `.github/`, `src/test/design-0143-final-audit.test.ts`, every earlier
  `required-cases.json`, TASK-013's fixture (imported unchanged).

## Tests added (each with its criterion)

**check-01** — 7 cases in `src/ui/timed-workout-flow.test.tsx`, describe `TASK-014 accidental Finish
recovery with an aligned quiet undo`, over the real router at `/workout` (TASK-013's
`ladder-handoff-fixture.ts`: twelve rungs of kettlebell swing 3 → 36 with a fixed row under one 09:00
cap, and four rungs of plank 5 → 20 sec under a 15:00 For Time cap), injected `Date.now`, the shared
stylesheets applied. 45 s explicit timeouts (CI note). No name carries "EMOM", "ladder", "rung" or
"handoff" (checked with `vitest list` against TASK-011's and TASK-013's patterns: 0 selected).

1. **AC-R014-03 / AC-C38-01 running.** Finish at 03:00 with 3 checked; the log corrected to 4 and Too
   hard; 30 s later Undo: 03:30 Racing, `Cap in 05:30`, Pause + Finish, live 1–4 and `4 of 12`, the
   answer back to none, effort kept; the record keeps identity and `startedAt`, `finishedAt: null`, no
   `pausedAt`, checkpoint null, cap 540, draft `{completed: null, highestRung: 4}`; no For Time record.
   Within the original cap: 08:59 running, 09:00 `Cap reached`, the cap imports 4 and is never
   undoable. The four-round attempt: Finish Complete, Undo at once (00:45, `Cap in 14:15`), Finish
   again. No row, no session completion, still on the section.
2. **AC-C38-01 paused.** Paused at 01:40, 10 min, Finish → `Finished` 01:40 with checkpoint
   `{pausedAt, progress: 2, completed: null}`; an hour later Undo → `Paused` 01:40, `Cap in 07:20`,
   Resume + Finish, the stored clock equal to the paused one; 10 min more still 01:40; Resume → 02:40;
   6 checked; Finish. The four-round attempt: Undo, round 4 taken back live, Finish (Incomplete 3).
   Save: exactly two rows, `highest_rung` 6 and 3, all else null; the record closed.
3. **AC-R014-03 cap.** Finish at 08:20: offered at 08:59 of the would-be clock, gone at 09:00 with
   nothing pressed; the clock still `Finished` 08:20; the log still editable (corrected to 8); a reopen
   keeps it gone. The four-round attempt runs into its cap: never an Undo. Save: 8 and 2.
4. **AC-R014-03 reload / failed save / success.** Finish at 02:00, corrected to 6; reopen: offered;
   the save refused (dialog, 1 call, no row); Close: offered, the draft kept, the checkpoint kept;
   reopen again: offered; Undo: 02:30 Racing (02:00 + 30 s closed), 6 checked; 8 checked; Finish. A
   partial save (the long row saved, the short refused): the athlete stays, **no Undo at once**, no
   lifecycle control, the record closed. The retry: 4 calls, rows `[long 8, short null]`. Both records
   closed (`checkpoint: null`, saved). Reopen with the performed read failing, Previous: no Undo, no
   answer, chips disabled, no control, no further write.
5. **AC-R014-01 / AC-C39-01 / AC-C60-01 / AC-R014-02 presentation.** Never offered while ready,
   running or paused. One action; the result group's members are exactly [answer, Undo, rounds]; the
   count follows it. The DS quiet small button (`clr-btn--quiet`, `clr-chamfer--sm`, not primary,
   no glyph, `min-height: var(--control-height)`, transparent bleed, no glow). The recipe declares
   `padding-inline: 0 !important`, `justify-content: flex-start`, `text-align: start` and no size,
   colour, frame, font or tracking. Tab: answer → Undo → round 1, Shift+Tab back. Enter: no `confirm`,
   no dialog, the attempt back, focus on Pause. From a paused Finish, Space: focus on Resume.
6. **JOURNEY-014 gallery.** `ladder-4` and `ladder-12` (the route's `LadderBlock`): Finish, the Undo
   between the answer and the rounds (`2 of N`), Undo → Pause, 2 checked live, the log open again;
   Finish again; offered at 06:59 of the accepted 07:00 cap, withdrawn at 07:00 (only the attempt's
   own tick runs here); `localStorage` empty; no fetch.
7. **AC-R014-03 no stale completion.** A direct mount over an older build's For Time record
   (`workCompleted: true` beside a running clock): adopted at 02:00; Finish with 2 checked →
   Incomplete 2 (not Complete); Undo → no answer, outcome `{}`, 2 checked live, draft
   `{completed: null, highestRung: 2}`; the older record byte-identical; Finish again → 2. Then For
   Time on TASK-006's route fixture: Start, Finish, its log asks Work completed and offers no Undo.

**Seam tests (not a declared check)** — `src/state/block-completion-provider.test.tsx`, describe
`BlockCompletionProvider — told the moment a row is known (TASK-014, AC-R014-03)`: a listener is told
once per block, in save order, while the screen still says open and before the forward action hears
the answer; not again on a second press; told for the performed read and for a 23505 row; never for a
failed write; never once unsubscribed.

**check-02** — new `e2e/refinement/task-014.spec.ts` (5 cases, mobile, contained synthetic lane over
the same fixture; the clock held with `pauseAt` for exact readings and released before axe and
reloads; after a reload readings are checked against the stored `startedAt`):

1–2. **phone-320 / phone-390 touch**: Finish 3 of 12 → alignment; Undo after 30 s → 02:30 Racing, 3
   checked, no answer, no POST; Finish at 10 of 12 → alignment (two-digit count); the four-round
   ladder paused and finished at 4 of 4 → alignment; Undo → `Paused` 00:40, frozen for 60 s; Resume,
   round 4 off, Finish at 3 of 4 → alignment; both Undos visible, no overflow, axe (no exception);
   save `highest_rung` 10 and 3.
3. **keyboard, phone-390, reduced motion**: Start/check/Finish by keyboard; Tab order answer → Undo →
   round 1; the focused Undo shows the shared focus frame; Enter → Pause focused, no dialog event,
   00:45 Racing; Pause, Finish, Space on Undo → Resume focused, `Paused`; animations ≤ 0.01 ms; axe;
   keyboard save `highest_rung` 2.
4. **recovery, phone-390**: the four-round ladder finished at 14:50 of 15:00 — offered at 14:59,
   withdrawn at 15:00 unprompted; the twelve-round ladder finished at 02:00 (checkpoint asserted) and
   corrected to 6; reload: offered, the expired one stays gone; the save refused (503): offered, the
   draft kept; reload: offered, alignment; Undo: the same `startedAt`, running from it (≥ 140 s); 8
   checked; Finish; save: 3 POSTs, rows 8 and 2; both stored records closed; reload with the performed
   read refused, Previous: no Undo, no control, no answer, chips disabled; axe.
5. **gallery `ladder-4` / `ladder-12` at 320 and 390**: alignment with 2 of N; axe; capture; Undo →
   Pause + Finish, 2 checked live; route storage untouched; no network.

Captures and measurement JSON are attached to the Playwright report: `long-finished-undo-phone-{320,390}`,
`short-finished-undo-phone-{320,390}`, `long-undo-focused-keyboard-reduced-phone-390`,
`undo-focused-keyboard-reduced-phone-390` (the focused Undo with 24 px around it),
`gallery-ladder-{4,12}-undo-phone-{320,390}` (whole cards, read in a 2600 px tall viewport), and
`alignment-*.json`. Geometry asserted in every alignment reading: text start = count text start =
group content edge (≤ 0.5 px); the box reaches past the text by the same amount each side, at least
2 × `--border-width`; below the completion row, above the Rounds completed legend; height ≥ control
height; width ≥ control height; quiet at rest (`::after` transparent, `::before` no fill or
scanlines), its own uppercase. Comparable references: P04
(`P04-acceptance-schematic.svg`), the accepted `ladder-4` / `ladder-12` states and the R7 replay
`scene.html?view=timed&state=ladder&rounds=4&overlay=dialog&skin=signal` (VISUAL-CONTRACTS: "Start,
check through a rung, Finish, then Undo … apply P04 text inset").

## Mutation checks

Each mutation was applied to the real file, the TASK-014 vitest cases (or the seam tests) run, and the
file restored and confirmed with a byte comparison against a scratch copy (scratchpad
`mut/run.py`). `git status` was compared before and after each batch.

| Mutation | Failed cases |
| --- | --- |
| M1 no Undo-expiry tick | 1 (gallery; the route shell's clock re-renders the ladder anyway — survived until the gallery expiry step was added) |
| M2 no `onBlockRecorded` subscription in the ladder | 2 (paused/save, reload/failed/success) |
| M3 the provider never notifies | 2 |
| M4 Undo drawn after the rounds | 7 |
| M5 the inherited inset kept (first recipe) | 1 (presentation; geometry in check-02) |
| M6 Undo offered whenever the attempt ended | 2 |
| M7 hidden time extension (Undo shifts the start by the time finished) | 3 |
| M8 the post-Finish answer kept | 4 |
| M9 the pause forgotten | 2 |
| M10 focus not returned | 1 |
| M11 a framed secondary button | 2 |
| M12 an "Are you sure" confirmation | 6 |
| M13 progress from the checkpoint, not the log | 2 |
| M14 Undo ignores expiry (owner) | 1 |
| M15 Undo after a save (owner's `saved` reason dropped) | 0 here — equivalent at the route (a closed attempt has no checkpoint); TASK-032 check-01 fails 2 |
| P1 provider never notifies (seam tests) | 2 |
| P2 provider notifies on a later task | 1 |
| P3 unsubscribe ignored | 1 |
| N1 the inset not given back outside the box (final recipe) | vitest 1; browser: text 8 px right of the count, gallery case fails |
| N2 the inherited `--spacing-300` inset kept | vitest 1; browser: 4 px off |
| N3 padding 0 with the outward margin kept | vitest 1; browser: 8 px off |

The pure reference recipe (padding 0, no outward margin) aligns the text but fails check-02's "the
focus frame clears the first letter" (`text.left - button.left ≥ 2 × --border-width`).

## Alignment measurements (browser, Range over each text node; CSS px)

Every state measured, phone-320 and phone-390, touch, keyboard (reduced motion) and the gallery:

| State | Undo text left | Count text left | Group content edge | Δ | Button box | Inside L / R | Height | Lines | Gap above / below |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| long 3 of 12 @320, @390 | 38.00 | 38.00 | 38.00 | 0.000 | 30.0–277.4 | 8.0 / 8.0 | 40 (= control height) | 1 | 16 / 16 |
| long 10 of 12 @320, @390 | 38.00 | 38.00 | 38.00 | 0.000 | 30.0–277.4 | 8.0 / 8.0 | 40 | 1 | 16 / 16 |
| short 4 of 4 @320, @390 | 38.00 | 38.00 | 38.00 | 0.000 | 30.0–277.4 | 8.0 / 8.0 | 40 | 1 | 16 / 16 |
| long 2 of 12, keyboard, reduced motion @390 | 38.00 | 38.00 | 38.00 | 0.000 | 30.0–277.4 | 8.0 / 8.0 | 40 | 1 | 16 / 16 |
| gallery ladder-4 / ladder-12, 2 of N @320, @390 | 38.00 | 38.00 | 38.00 | 0.000 | 30.0–277.4 | 8.0 / 8.0 | 40 | 1 | 16 / 16 |

- One- and two-digit rung counts (4 and 12) and one- and two-digit completed counts (3, 4, 10) all
  start at the same edge. The text fits one line at 320 (231.4 CSS px of 244).
- The gaps are the result group's `--spacing-400` on both sides of the 40 px box.
- Before the refinement (first recipe) the same states measured text = count = button = 38.00 with a
  231.4 px box; the focused capture showed the frame on the letters (kept outside the repo).

## Sweep (every spec and test under `e2e/` and `src/`)

What changed that a test could assume: after an athlete's Finish on a raced or legacy ladder, a new
button `Undo finish · Resume ladder` sits in the log between the Work completed radiogroup and the
Rounds completed tiles (one more Tab stop there); `BlockCompletionApi` has one more optional member;
the stored ladder record of a saved block is closed at save time rather than on the next mount.

Searched for:
- names a substring match would now also find (Playwright's `getByRole` name is a case-insensitive
  substring unless `exact`): `'Finish'`, `'Resume'`, `/Finish/`, `/Resume/`, `/undo/`, `finish`,
  `Undo` in every `getByRole` / `getByText` / `filter` / `hasText` without `exact: true`;
- tab order and focus after a ladder's Finish: `keyboard.press('Tab')`, `Shift+Tab`, `toBeFocused`
  in every spec mentioning a ladder or rung;
- button counts in a ladder card or log: `getByRole('button')`, `toHaveCount`, `queryAllByRole`;
- the seam's shape: `BlockCompletionApi` literals and `useBlockCompletion()` consumers;
- storage after a save: `clear.workout-ladders`, `localStorage.length`, `stored(`.

Results:
- **Superseded and updated** (cites TASK-014 and AC-C39-01 / AC-R014-01 in place):
  `e2e/refinement/task-013.spec.ts`, keyboard case: from Incomplete, Tab reaches the Undo, then
  round 1 (one added Tab and assertion; case name and every other step unchanged).
- **Checked, not superseded:**
  - `task-006.spec.ts`: the ladder's Finish by keyboard, then `Finished` status, `Finish workout` in
    the footer only (`'Finish workout'` is not a substring of the Undo's name); the gallery case's
    row buttons are inside `[data-timed-actions]`, which the Undo is not in.
  - `task-010.spec.ts`: its ladders end at the cap or are an older build's finished clock (no
    checkpoint) — never an Undo; its gallery `?state=ladder` likewise.
  - `task-012.spec.ts`: after Finish it counts the 12 buttons inside `Rounds completed` only.
  - `task-007.spec.ts` / `task-008.spec.ts`: `Resume` locators are scoped to For Time, AMRAP or EMOM
    cards.
  - `ui-polish-b05-scroll-boundaries.spec.ts`: tabs between rung tiles only, from the first tile.
  - Backend lane (cannot run here; they need `.env.runner.local`): `design-0143/workout-ladder.spec.ts`,
    `workout-lifecycle.spec.ts` (`/^Finish/` is anchored), `task-040-lifecycle.spec.ts` (excluded by
    the config), `accessibility.spec.ts`, `e2e/core-loop.spec.ts`: no ladder race Finish followed by
    Tab or a button count; only `Finish workout` with `exact: true`. Not edited.
  - `src/`: every bare `BlockCompletionApi` literal (17 test files) omits the new optional member and
    typechecks; `ladder-block.test.tsx`, `timed-result-log.test.tsx`, `ladder-rungs.test.tsx`,
    `refinement-ladder-recovery.test.ts`, `block-completion-ownership.test.ts` and the gallery tests
    pass unchanged.
  - `src/test/design-0143-final-audit.test.ts`: not modified.

## Failures and corrections

- **A locator that never resolved.** The first spec run timed out (180 s) in `clockOf`: a
  page-rooted locator passed to `filter({ has })` is resolved inside each candidate, so it matched
  nothing. Now the clock card is filtered by `page.getByRole('timer')` (relative).
- **Drifting browser clock.** Playwright's installed clock runs with real time, so exact readings
  around scans and captures would be flaky. Route cases now hold it (`pauseAt`, TASK-006's pattern),
  release it before axe and reloads, and check post-reload readings against the stored `startedAt`.
- **Two surviving mutants, then caught or explained.** M1 (no expiry tick) survived the route cases
  because the shell's session clock re-renders the ladder each second; the gallery case now proves
  the tick. M15 is equivalent at the route (closed attempts carry no checkpoint) and is caught by
  TASK-032's check.
- **Name collision with TASK-013's pattern.** One case name said `highest_rung`, which contains
  "rung"; renamed before the manifest was written (`vitest list` now selects 0 TASK-014 cases with
  `ladder|rung|handoff` or `EMOM`).
- **The flush focus frame** (see Presentation): found in the first capture; recipe refined; vitest
  and browser assertions added (N1–N3).
- **A truncated gallery capture** at 320 (the card ran past the viewport): gallery and route
  captures are now taken in a 2600 px tall viewport, of the whole card.
- A throwaway probe spec (`e2e/zz-scratch-task014/`) was used once to check clipping ancestors and
  was deleted; `git status` confirmed nothing left.

## Verification (this worktree, uncommitted candidate on `5bdd373`, 2026-11-10)

`npm ci` was run once at the start (exit 0). Final runs, after the last source and test edit:

- `node scripts/refinement/run-required-check.mjs --task TASK-014 --check check-01 -- npx vitest run src/ui/timed-workout-flow.test.tsx --testNamePattern "undo|resume|cap" --passWithNoTests=false`:
  **PASSED**. Native 32 total, 15 executed, 15 passed (7 declared plus TASK-006's 3, TASK-011's 3 and
  TASK-013's 2 cases whose names carry "resume" or "cap"), 0 failed, 17 skipped, 0 todo.
- `node scripts/refinement/run-required-check.mjs --task TASK-014 --check check-02 -- npx playwright test e2e/refinement/task-014.spec.ts --project=mobile`:
  **PASSED**. Native 5 total, 5 executed, 5 passed (synthetic origin, no credentials; 120–180 s
  per-case timeouts; about 100 s for the file).
- Manifest `evidence/refinement/task-014/required-cases.json` sha256
  `35ee23dd36bf10cbfbedfab61698ce36b3b155de61836a5f126cb8cdd8971aca`.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,TASK-002,TASK-003,TASK-004,TASK-005,TASK-006,TASK-007,TASK-008,TASK-009,TASK-010,TASK-011,TASK-012,TASK-013,TASK-014,TASK-030,TASK-032`:
  **exit 0**; every task "current passing receipts"; accepted-gallery 1193 files verified (94
  staged, 1099 from the integration base).
- `npm run build`: exit 0 (`tsc --noEmit` over `src` and `e2e`, then Vite). The shared
  `toast-host` chunk is 368.84 kB (TASK-013 recorded 367,639 bytes): the Undo wiring and the seam.
  TASK-030's contract tables stay out of every chunk (`block_movement_results`, `LOGGING_MOMENTS`
  absent).
- `npm run lint:ds`: exit 0. `npx eslint` per changed file against `git show HEAD:<file>`: no new
  error or warning (`gallery-registry.tsx` 137 → 137, `ladder-block.tsx` 2 → 2, every other changed
  or new file 0).
- `node scripts/gallery-index.mjs --check`: 72 verified.
- `npm test`: 265 files, **6260 passed**, 0 failed (TASK-013: 265 / 6251; +9 = 7 route cases + 2
  seam cases).
- `git diff 5bdd373 -- supabase .github src/test/design-0143-final-audit.test.ts src/state/ladder-recovery.ts src/test/ladder-handoff-fixture.ts`:
  empty.
- Not run: the backend-lane specs (they need `.env.runner.local`). None was edited; the sweep above
  found none that this change affects.
- This note is not a check target, so editing it after the runs leaves every receipt current.

## Earlier-task receipts

Every check of TASK-001 to TASK-013, TASK-030 and TASK-032 was refreshed by genuinely re-running its
exact approved guard command (each manifest's `command`), sequentially, after the candidate's code and
tests were final, together with TASK-014's two. No manifest was edited
(`git diff -- 'evidence/refinement/*/required-cases.json'` is empty). All 31 PASSED:

| Task | check-01 | check-02 |
| --- | --- | --- |
| TASK-001 | 7/7 | 9/9 |
| TASK-002 | 11/11 | 7/7 |
| TASK-003 | 12/12 | 5/5 |
| TASK-004 | 10/10 | 5/5 |
| TASK-005 | 9/9 | 5/5 |
| TASK-006 | 32/32 (the whole file, now with TASK-014's 7) | 7/7 |
| TASK-007 | 13/13 | 7/7 |
| TASK-008 | 13/13 | 5/5 |
| TASK-009 | 8 executed of 17 | 3/3 |
| TASK-010 | 9 executed of 17 | 3/3 |
| TASK-011 | 9 executed of 32 | 3/3 |
| TASK-012 | 9/9 | 5/5 |
| TASK-013 | 11 executed of 32 | 5/5 |
| TASK-014 | 15 executed of 32 | 5/5 |
| TASK-030 | 112/112 | 12/12 |
| TASK-032 | 10/10 | — |

- **Changed receipts, as expected** (their target file was edited, so its hash is new): TASK-006,
  TASK-011 and TASK-013 check-01 (`timed-workout-flow.test.tsx` holds the new cases) and TASK-013
  check-02 (`task-013.spec.ts`, the superseded tab step).
- **Every other receipt is byte-identical** (`cmp` against a copy taken before the run), including
  the checks that drive the changed `ladder-4` / `ladder-12` states or read the docs this task edited
  without a changed target: TASK-006 / TASK-012 / TASK-013's gallery cases, TASK-010 (its
  `?state=ladder` never offers Undo), TASK-030 check-02 (the contract and spec text) and TASK-032
  check-01 (the README row and the hook's new `markRecorded`).
- The TASK-010 "AC-R010-02 effort reuses Frown, Meh and Smile…" flake noted by the controller was not
  seen in this task's runs (`npm test` and TASK-010 check-01 both green).

## Open assumptions / unresolved (for the controller and owner)

- **Recipe refinement.** The text start is exactly the accepted P04 result; the box reaching 8 px
  past the text on each side is a delegated-geometry choice (R141 / R145) to keep the focus frame off
  the letters. If the owner prefers the reference's flush box, it is one CSS rule plus check-02's
  clearance assertion — but the focus frame would then sit on the first and last letters again.
- **"Spacing"** is read as the visible left start and inset (and the group's existing vertical
  rhythm), not a type/case/colour change (R141 says that is not mandatory; AC-R014-02 keeps the quiet
  style).
- **For Time has no Undo** (disposition above). If the owner wants For Time's Finish reversible too,
  that is new scope: For Time has no checkpoint owner today.
- **Save boundary.** Undo ends durably at the moment the row is known (through `ladderRecorded`).
  `saveSucceeded` / `saveFailed`, the saved-here display and readback are TASK-048's; the
  out-of-scope "just-saved ladder shows no answer after a later block's save fails" is unchanged.
- **Focus after Undo** goes to the race's lead control near the top of the card; on keyboard (and
  platforms that focus on tap) that scrolls to it. A touch tap on iOS keeps the scroll position.
- **Copy** `Undo finish · Resume ladder` is the accepted reference's; TASK-037's copy pass may refine
  it (tests read the literal).
- **Effort** (renderer memory) survives an Undo while the ladder stays mounted; it is still lost on
  reload and never saved (TASK-046 / TASK-047).
- **Out of scope, recorded and not fixed** (from TASK-013's UAT): two "Rounds completed" counts
  mid-run when answered before Finish (TASK-046); two-digit pair tiles such as "20 / 10" overrunning
  by about 3 px; a just-saved ladder showing no answer after a later block's save fails (TASK-048).
  Per-movement partials stay TASK-015's.
- **No isolated prerequisite**: local storage and the existing writer only; no migration, new
  writer or live service.

## Next action

Controller verification and commit.
