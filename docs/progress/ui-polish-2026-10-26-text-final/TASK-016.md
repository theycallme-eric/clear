# TASK-016 — Abandon in the framed top menu

Issue #536 · REQ-019 · role: completion-owner for JOURNEY-015.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

On the active workout, Abandon moves out of the header's quiet text button and into a framed top
menu. The menu trigger shows only its glyph, with no visible "Actions" word, and keeps "Actions" as
its accessible name. Abandon still asks the same confirm. Confirming abandons with the existing
retention behaviour and destination, and dismissing returns to the unchanged workout.
Abandon/save semantics do not change.

## Baseline, as found (HEAD `0724a44`, contains `7f0a367`)

- `src/app/Workout.tsx` put a `Button variant="quiet"` with the `LogOut` glyph and the visible
  word "Abandon" directly in the `AppHeader` `actions` slot. The app had no header menu, and
  nothing rendered the word "Actions".
- The design system has no menu component. `IconButton` (icon-only, framed, with a required
  accessible name) and the `Menu` glyph are both public. ATOMIC.md says icon-only buttons are
  always framed.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` passed. PRE-002: the design system
  declares 0.14.3, `git diff 7f0a367 HEAD -- src/design-system` is empty, and the design system
  is still untouched.
- `gh issue view` was not used, so the approved task body was the contract. Issue comments were
  not read by the worker.

## What changed (local, unpublished)

- `src/ui/workout-chrome.tsx`: new `WorkoutMenu` and `WORKOUT_MENU_LABEL = 'Actions'`.
  - The trigger is the shipped `IconButton` (the framed secondary variant) with the `Menu` glyph
    and `label="Actions"`. It has `aria-expanded` and `aria-controls` pointing at the panel.
  - The panel is a `.clr-chamfer clr-chamfer--sm` framed `role="group"` named "Actions". It is
    `hidden` while closed and holds the existing quiet `LogOut` / "Abandon" button.
  - Choosing Abandon closes the panel, returns focus to the trigger, then calls `onAbandon`.
    Focus is on the trigger when the confirm opens, so dismissing the confirm returns focus there.
  - Esc closes the panel and returns focus to the trigger. A press outside closes it. Neither
    acts on the session.
  - Optional `defaultOpen` exists only for the gallery's "open" specimen.
- `src/ui/workout-navigation.css`: the wrapper is `position: relative`. The panel is absolute,
  under the trigger's right edge, `z-index: 1`. Spacing uses tokens only, and the chamfer
  provides the opaque ground.
- `src/app/Workout.tsx`: `actions: <WorkoutMenu onAbandon={() => setAskedToExit(true)} />`.
  The confirm (`AbandonConfirmDialog`), `confirmAbandon`, `cancelExit`, the blocker,
  `ABANDON_ROUTE` and every save path are unchanged.
- `src/dev/gallery-registry.tsx`: `WorkoutMenu` entry (REQ-019) with "closed" and "open"
  specimens. The gallery coverage test requires every `src/ui` export to be framed or exempted.
- Tests:
  - New `src/app/abandon-menu.test.tsx`: 8 real-route cases.
    - AC-067: the name is "Actions" with no visible text, a glyph, the framed class (not quiet),
      and collapsed. Abandon is absent until the menu is opened.
    - AC-066: the framed panel holds Abandon, with an overlay CSS contract. Esc and an outside
      press close it, abandon nothing, and return focus. The accepted confirm copy appears, and
      Keep going returns to `/workout` with nothing abandoned or completed.
    - AC-066, continued: confirming lands on Home `/` with `abandoned == [session]`, no
      completion, and the shell storage cleared. A failed abandon keeps the session. A blocked
      navigation still raises the same confirm.
  - `src/app/Workout.test.tsx`: 3 existing abandon cases now open "Actions" first. Their
    assertions are unchanged.
  - e2e specs (`accessibility`, `workout-lifecycle`, `task-040-lifecycle`,
    `task-040-lifecycle-gaps`): each header Abandon click is preceded by opening "Actions". The
    accessibility spec's focus-return trigger is now the menu button. These were **not run**
    here, because they need a browser and a disposable backend.
- Nothing changed in GitHub or any external service.

## Decisions and assumptions (for review)

- **Disclosure, not ARIA `menu`:** with one item, a `role="menu"` would need a roving-focus and
  arrow-key contract for no benefit. A labelled disclosure gives screen readers the name,
  expanded state and controlled region.
- **"Framed"** means the trigger is the framed icon button, not the quiet one, and the panel is
  a chamfered frame.
- Abandon keeps its existing quiet variant and `LogOut` glyph inside the panel. The confirm stays
  the critical surface.

## Failures and corrections

- First full run: 3 failures. One was the gallery coverage test, because `WorkoutMenu` was
  unframed. A registry entry was added, then a second ("open") specimen, because each entry must
  have more than one state. The other two are the known audit blocker below.
- Lint warnings went from 141 to 143. Both new warnings are the file-wide
  `react-refresh/only-export-components` warning that every gallery specimen function already
  produces. There are 0 errors.

## Initial worker verification

| Command | Result |
| --- | --- |
| `npm test -- abandon-menu` | pass, 1 file / 8 tests |
| `npm test` | **fail**: 2 of 5750, both in `src/test/design-0143-final-audit.test.ts` (blocker below); 230 of 231 files pass |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors (143 warnings) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

## Verification stop: runtime-source-bound audit evidence

This is the same blocker as TASK-006/007/009/011–015. Any runtime change in `src/` changes the
runtime-source hash, so two checks fail:

- *proof labels › bound to the package and runtime source of this tree*
- *TASK-034 AFTER evidence (eight-cell mobile group)*

Fixing them means committing the tree and re-capturing the four-skin mobile format-preview group
against a disposable authenticated backend. This worker cannot do that. No record, hash or audit
text was edited, because that would fabricate evidence.

Next safe action: the controller reads issue #536's comments, runs the four updated e2e specs, and
re-captures the format-preview evidence against the committed tree. Then it runs native
verification.

## Controller verification recovery — in progress

- Native initial97448 reached terminal verification-failed after the worker succeeded. Both
  independent criterion/task runs passed8cases; full suite stopped on the two source-bound audit
  checks. Initial complete candidate78feb39 is retained; attempt1/max2 is unchanged.
- Root read live issue #536/comments0. Existing confirmation/retention/save/blocker handlers remain
  unchanged. Reviewer found two concrete corrections, now applied before new proof: the plain
  menu frame uses the required public bleed wrapper; three added Actions clicks were removed
  from historical0.9.7 BEFORE collectors, which remain byte-identical to the base. Current
  browser menu adaptations retain substantive assertions. Home resumption-card Abandon is unchanged.
- The focused frame assertion now checks the actual emission wrapper and contained chamfer. An
  inaccurate test comment was corrected: abandoned sessions return Home and cannot resume.
- Actual320×568 and390×844 menu geometry/focus/cancel cases are being added to the existing
  circuit fixture; its four original circuit/footer cases remain intact. Root will execute these
  with existing current dialog/abandon-recovery browser journeys on the owned local backend.
- The local backend started successfully with migrations verified byte-identical to actual
  TASK-016 source. No hosted mutation, Runner repair, extra model invocation or counter reset.

Next: focused tests, commit clean source, actual browser proof and current-source format capture,
then native same-attempt verification and protected build-branch delivery. No browser success or
physical-iPhone/hosted proof is inferred before execution.

## Proof selection and current progress

Focused correction12181 passed8tests; design lint53462 passed. Backend status also passed after
start75404/reset61396. A focused JOURNEY-015 browser case will explicitly log a set, exercise
one controlled failed abandon then retry, and verify actual retained row values. Public preview
uses a narrowly schema-shaped intercepted fixture; the local trusted run uses the real disposable
backend. Neither fixture mode is represented as the other.

The wider old workout-lifecycle recovery case still assumes pre-sheet forms and raw set-log POSTs.
It is not selected as proof for this menu change. The new focused current entry/recovery path
proves the same menu retention requirement directly, while the existing current accessibility
dialog case exercises native confirmation safety and focus. No historical BEFORE collectors run.
Approved TASK-018 explicitly selects its own bounded synthetic integrated spec, not the older
wide backend matrix. No existing required Runner command or acceptance criterion is changed.

Final independent runtime review found no concrete blocker. Browser driver now includes two
phone geometry/keyboard/dismissal/focus cases and one explicit logged-set abandon failure/retry
retention case. Its trusted fixture reads full actual rows; public preview implements only the
needed schema-shaped insert/replay and abandon responses and makes no database-proof claim.
The four original circuit/footer case bodies are unchanged. Actual browser execution is next.
