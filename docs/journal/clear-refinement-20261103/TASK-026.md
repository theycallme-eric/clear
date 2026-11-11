# TASK-026 — History row hierarchy and intentional filter options (#653)

Body `clear-refinement-v2-20261109b`, attempt 1, base `fb9b749` (after TASK-025 #707). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-026 writes this file.

## Intended outcome

REQ-026 (AC-C53-01, AC-R026-01; C53, G18; R08, R19; V07, V08), completion owner of JOURNEY-026 on
the real `/history` and `/history/:id`. Each History workout row has its title on its own row with
its status and date beneath it; the Show filter omits Rest days and Not started while keeping All
entries, Completed and Partial; no record, date, actual or stored lifecycle status is removed or
reinterpreted. Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`,
`/gallery/refinements?state=screens` (History part).

## Before

- `src/ui/history-list.tsx` chronology row: a `head` flex row with the title left and the status
  (24 px glyph + word) right, wrapping beside a long title (the V07 / R19 regression); then a
  `date · focus` context line; then the metrics.
- `src/state/history.ts` `HISTORY_FILTERS`: All entries, Completed, Partial, Not started, Rest days.

## Changes

- `src/state/history.ts`: `HistoryFilter` is `'all' | 'completed' | 'partial'`; `HISTORY_FILTERS`
  lists those three. `historyFilterOf` reads the retired `unstarted`/`rest` values as `all`.
  `filterHistory` keeps every entry under `all` (rest runs and never-started sessions untouched).
  `historyEntries`, `historyStatus`, `HISTORY_STATUS_LABELS` (incl. `Not started`) unchanged.
- `src/ui/history-list.tsx`: the chronology `SessionItem` now renders `title` (own row, full width,
  link unchanged) → `status-date` (status word + glyph, then the stored day) → `metrics` (focus,
  Requested, Actual only when recorded, Intensity). The status/date line reuses Home's B05 recent
  line (`STATUS_DATE_STYLE`, `STATUS_STYLE`, 16 px `STATUS_GLYPH`; renamed from `RECENT_*`, Home's
  output unchanged); the chronology keeps its own status colour and larger h5 title, and the row
  carries `data-layout="chronology"` and `data-status`. The 24 px glyph map and `HEAD_STYLE` are
  gone. Rest rows unchanged.
- `src/app/History.tsx`: the collection card is extracted as exported `HistoryCollection` (same
  markup: Card, Show select only when history exists, ViewStateSwitch, HistoryList) and the state
  resolver as exported `historyViewState`; `HISTORY_TITLE` exported. Route behaviour, footer
  actions, Back and resolver unchanged.
- Gallery `?state=screens` (`src/dev/gallery-refinement-scenes.tsx`, `gallery-refinements.tsx`):
  new `HistoryScene` after Setup — AppHeader `History` title + the route's own `HistoryCollection`
  over four stored rows in memory (completed ×2, partial, never started; built with
  `savedSessionRow`) read by the route's `historyEntries` at a fixed instant, so rest runs are
  derived. Filter state in memory; titles draw as links but open nothing; no reads/writes; no route
  CSS. History's Back is deliberately not drawn in the gallery: a second "Home" button in the state
  would break TASK-024's protected `getByRole('button', { name: 'Home' })` locators.
- Tests:
  - `src/state/history.test.ts`: filter cases rewritten (three options; all keeps rest runs and the
    unstarted session; narrowing does not mutate; retired values read as all).
  - `src/app/History.test.tsx`: U44 case now asserts title / status-date / metrics order and stored
    day; filter-no-match cases use Partial; rest-filter case replaced by an AC-C53-01 case (offered
    options, All entries keeps rest runs and Not started, Partial shows recorded actual minutes);
    new gallery `?state=screens` History case.
  - `src/app/home-screen.test.tsx`: the superseded "leaves History's own chronology row unchanged"
    now asserts the chronology's full title with the shared title → status-date → metrics order.
  - `e2e/refinement/task-026.spec.ts`: 5 browser cases (journey at 320 and 390; keyboard/reduced
    motion/reopen at 320; recovery at 320; gallery at 320). Synthetic contained session, no writes.
- `evidence/refinement/task-026/required-cases.json`: check-01 declares all 5 cases.

## Consumer sweep

- `e2e/ui-polish-b05-recent-rows.spec.ts` (B05, superseded chronology case): now checks the new
  hierarchy; ran locally under the lock: 6 passed.
- `e2e/history-detail.spec.ts` (backend lane, not runnable locally): selected the retired Rest days
  and Not started options; now asserts the three offered options and opens the never-started row
  from All entries.
- `e2e/design-0143/task-040-lifecycle.spec.ts` uses only Partial/Completed: unaffected.
  `design-0143/accessibility`, `optional-feedback`, core-loop: no locator on the removed parts.
- Home recents (`Home.test.tsx`, `home-screen.test.tsx`, `ui-polish-home.spec.ts`): same markup.

## Failures and corrections

- First guard run: 5/5 failed.
  - At 320 the 24 px glyph + label-sm status and the date did not fit on one line, so the date
    wrapped under the status. Fixed by adopting Home's compact status/date line (12 px, 16 px
    glyph, nowrap) — R19 asks to inherit the delivered status/date row.
  - Spec bugs: rest-row regex anchored at `$` (row text ends with "Rest"); a `has:` locator rooted
    at the list; the recovery read failure tripped the boot check ("System check failed"), because
    boot and the first History page share one query. The failure is now injected only into the
    wider Load older workouts window, a real History-route error path.
- Unit test assumed a fixed today for rest-run counts; changed to compare counts before/after.

## Verification (final tree)

- `node …/v2.mjs with-lock -- node scripts/refinement/run-required-check.mjs --task TASK-026 --check check-01 -- npx playwright test e2e/refinement/task-026.spec.ts --project=mobile`: PASSED, 5/5 executed and passed.
- Re-run because `?state=screens` changed (exact approved guards, under the lock):
  TASK-024 check-01 PASSED (119/119), TASK-024 check-02 PASSED (6/6), TASK-025 check-01 PASSED (5/5).
  Receipts byte-identical (no diff).
- `npm run build`: pass. `npm run lint:ds`: pass. `npm test`: 269 files, 6343 tests passed.
- `npx eslint` on every changed file: 0 errors, 1 warning (react-refresh only-export-components on
  `historyViewState` in `History.tsx`).
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-034` (incl. TASK-026): PASSED, all current passing receipts.

## Open assumptions / UAT

- Status/date typography on History now matches Home's compact line (12 px, 16 px glyph) so both fit
  on one line at 320; V08 drew the status a little larger at 390. Owner may compare.
- Filter labels kept as the existing All entries / Completed / Partial (the reference's "All
  workouts" / "Incomplete" wording was not adopted; R08 keeps the existing useful choices).
- The focus moved from the date line to the start of the metrics line, as V08 draws it.

## Next action

Controller commits and verifies the candidate.
