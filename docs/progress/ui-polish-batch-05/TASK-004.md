# TASK-004 — Recent-row status/date alignment

Issue #562 · REQ-004 · completion owner for JOURNEY-003.
Branch `agent-runner/task-004-a1-f53c466a`, base `ec99341` (TASK-002 merged).
This is the task's own progress record. For this body it replaces the shared daily journal, under
the owner-selected task-owned exception.

## Intended outcome

On Home's recent workout rows (B05-01.5), the status (glyph + word) and the date must sit on one
row and one baseline. Both pieces stay.

Constraints:

- Fix it once, in the shared recent-row composition in `src/ui/history-list.tsx`.
- Keep History's deliberate chronology row as it is.
- Leave long titles unchanged (01.3 is a no-change note).

## Sources read

- DECISIONS ("Global scope"), GLOBAL-PATTERNS (row "Result status/date alignment — 01.5"),
  VISUAL-REFERENCE (01.3, 01.5), and the task-owned progress template. The preview excerpts were
  not assigned to this task and were not used.
- I opened and viewed `sources/source-04-B05-01-home.jpg`. The spec computes its SHA-256 from the
  evidence snapshot: `e0a8762578b19714c7bb8d3385982186cac028227b28b290389115171b16e6f6`.
- Regions compared, both in the reference's Recent workouts card:
  - **01.3:** first row, long two-line title "UPPER BODY PUSH/PULL STRENGTH & CONDITIONING";
  - **01.5:** both rows, with the red line under "COMPLETED Sat 24 Oct 2026" and the same offset on
    "COMPLETED Thu 22 Oct 2026". In the reference the date sits visibly lower than the status word.

## Cause

The recent row's status/date line was a flex row with `align-items: baseline`. The status item
is an `inline-flex` whose first child is the text-less glyph box. With no text of its own, that
glyph supplies the item's baseline from its bottom edge. The date's text baseline was therefore
aligned to the bottom of the 24 px glyph, and the date hung below the status word.

The browser measured this before the fix, at 390 × 844: status text top 704.9, date text top
712.9. That is an 8 CSS px drop, the crooked line in 01.5.

## Changes

- `src/ui/history-list.tsx`: `RecentSessionItem`'s `status-date` line now uses
  `RECENT_STATUS_DATE_STYLE`. This is the existing row and meta styles with `align-items: center`.
  - Status and date share one font, size and line-height, so centring the two items puts both
    texts on the same line box and baseline.
  - The glyph stays centred on the word.
  - Not changed: `GLYPH_STYLE`, the chronology `SessionItem`, `RestItem`, titles, metrics and
    copy.
- `e2e/ui-polish-b05-recent-rows.spec.ts`: the new focused browser spec.
- `src/app/home-screen.test.tsx`: the AC-014 hierarchy test now also asserts the status-date
  line's `align-items: center`.
- No vendor (`src/design-system/`) edits. No new tokens, hex or px values.

## Consumers

- `HistoryList` / `WorkoutListItem` are used by:
  - Home (`layout="recent"`, the only recent-layout consumer);
  - History (`layout="chronology"`, default);
  - the dev gallery (chronology specimens only).
- Only the recent layout's status-date line changed. The chronology head/context composition and
  the gallery specimens render exactly as before.

## Verification: browser comparison

`npx playwright test e2e/ui-polish-b05-recent-rows.spec.ts --project=mobile`: **6 passed**.

Setup and scope:

- Captures were taken in mobile project Chromium emulation, `clear` skin, reduced motion, from
  source `ec99341` plus this task's uncommitted diff.
- Data was synthetic and intercepted: placeholder `.invalid` Supabase origin, no writes, no
  function or model calls (asserted).
- Each case captures one PNG per row and writes a JSON record with:
  - reference file, hash and region;
  - capture hashes and source identity;
  - viewport, consumer and state;
  - measurements.

Assertions run in every Home case:

- status and date: the same font; each on one line;
- on one line together: text tops and bottoms within 0.75 px;
- the glyph is centred on the word within 1.5 px;
- the title: full text present and computed font size equal to `--label-md-size`; `white-space:
  normal`, no ellipsis, no line clamp, no overflow; long titles wrap to two or more lines.

Results by case:

| Case (consumer · state · viewport) | Result | Reviewed capture vs reference |
| --- | --- | --- |
| Home recents · pictured rows (long completed, short completed, long partial) · 390×844 | pass: all 3 rows on one line, status/date top & bottom equal (686.9/700.9 for row 1) | `home-recents-pictured-phone-390-row1..3.png` (`fcb2cf64…`, `4c64be01…`, `de182deb…`). Compared with 01.5: "COMPLETED Sat 24 Oct 2026" now reads as one straight line; the 01.5 drop is gone. Compared with 01.3: the long title wraps over two lines at the same size, untruncated, as in the reference. |
| Home recents · all statuses (Not started, Partial, Completed; long titles; widest dates, e.g. Wed 30 Sep 2026) · 390×844 | pass: all 3 rows on one line, both result statuses | `home-recents-statuses-phone-390-row1..3.png` (`ae2a7d01…`, `5404c9e2…`, `bcc48a28…`): each status and date straight on one line. |
| Home recents · pictured rows · 320×568 | pass (wrap fallback, see finding) | `home-recents-pictured-narrow-320-row1..3.png` (`799934fd…`, `415e7c24…`, `ce55e1d8…`). |
| Home recents · all statuses · 320×568 | pass (wrap fallback, see finding) | `home-recents-statuses-narrow-320-row1..3.png` (`5ae35806…`, `0d89c716…`, `7c186a89…`). |
| History chronology · six sessions with rest runs · 390×844 | pass: head (title + right status) is baseline/space-between, `date · focus` context below the head, no status-date line | `history-chronology-phone-390-row1..6.png` (row 1 `e9cda62f…`). Deliberate variant unchanged. |
| History chronology · same · 320×568 | pass | `history-chronology-narrow-320-row1..6.png` (row 1 `ee4089f9…`). |

Full hashes are in each case's JSON attachment under `test-results/`. The abbreviated hashes above
come from the reviewed run. Later reruns overwrite `test-results/`, so the controller's own run is
the authoritative capture identity.

## Final checks (worker tree, `ec99341` + uncommitted diff)

- `npx playwright test e2e/ui-polish-b05-recent-rows.spec.ts --project=mobile`: 6 passed.
- `npx vitest run src/app/home-screen.test.tsx`: 14 passed.
- `npm test`: **2 failed**, 5812 passed (237 files; 236 pass). Both failures are in
  `src/test/design-0143-final-audit.test.ts` (see blocker below).
- `npm run lint:ds`: exit 0.
- `npm run build`: exit 0 (existing chunk-size warning only).
- `npm run lint`: 0 errors, 143 warnings, the same count as TASK-002's baseline; none in touched
  files.
- `npm run typecheck`: exit 0. The first run caught a duplicate `status` key in the spec's
  measurement record; it was renamed `result`.
- `npm run gen:types -- --check`: current.
- `python3 scripts/gen-issues.py --check`: exit 0.

## Verification stop: runtime-source-bound audit evidence

This is the same blocker TASK-002 and every runtime task in the previous body recorded. The 0.14.3
final audit hashes the runtime source (`index.html` + `src`, excluding tests, dev and vendor), so
the `history-list.tsx` change fails two checks:

- *proof labels › bound to the package and runtime source of this tree*;
- *TASK-034 AFTER evidence (eight-cell mobile group)*.

The worker did not edit any audit text, evidence record or hash, and did not weaken the test.

Next safe action: the controller commits this tree, genuinely recaptures the TASK-034
format-preview group against a disposable local backend, and rebinds the audit. This is the
existing procedure, recorded in TASK-002 "Root recovery checkpoint".

## Findings and corrections

- **Narrow wrap fallback (finding, not a regression).** At 320 px the row's content box is about
  220 px. "Not started"/"Completed" plus a date needs about 230–257 px. The row's existing
  `flex-wrap` then moves the date to the next line, starting at the status's own left edge (left
  edges equal within 0.75 px). The spec accepts the wrap only below 375 px; at the B05 phone width
  it requires one line.
  - Fitting both at 320 would need smaller type or a row redesign, which 01.3/01.5 do not
    authorise. No change made.
  - The owner may want to decide on this, but it is not required by the stated criteria.
- **Initial fixture error (corrected).** The first "pictured" fixture used `goal_preset: 'power'`.
  That is not a valid enum: "Power" is a `session_focus`. The real history read rejected it, and
  Home showed its error state. The fixture now uses `session_focus: 'power'`, `goal_preset:
  'balanced'`.
- **Clipped captures (corrected).** The first captures were whole-card/list element screenshots.
  These clip to the inner scroll region, so the long History list and the 320 px card were partly
  blank. Capture is now one screenshot per row, after scrolling the row into view.

## Unresolved / pending

- Physical-iPhone UAT of the Home recents remains **pending** until observed. This proof is
  Chromium emulation only.
- The 320 px wrap fallback above is recorded for owner awareness.

## Next safe action

1. The controller performs the audit recapture/rebind described above.
2. It then runs the independent verification.
3. The PR is opened from this branch (not done by this worker).
