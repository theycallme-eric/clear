# TASK-005 — Shared framed icon-only Back housing

Issue #563 · REQ-007 · completion-owner for JOURNEY-004.
Branch `agent-runner/task-005-a1-fd1c27d1`, base `0c9f55b` (after TASK-003).
Task-owned progress record. For this body it stands in for the shared daily journal, under the
owner-selected task-owned exception.

## Outcome intended

Every equivalent header Back action — Generate, Settings, History, session detail, locations and
format preview — renders as the public `IconButton` (framed, icon only), the housing Home's
Settings control already uses, through the existing `Screen` `header.actions` API. Each accessible
name and each existing destination/fallback is unchanged. Unrelated controls are untouched; shell
geometry and the pinned head stay with TASK-002/003.

## Sources read

- Primary: `sources/source-01-DECISIONS.md`, `sources/source-02-GLOBAL-PATTERNS.md` (row "Framed Back
  actions — 02.2, 08.1"), `sources/source-03-VISUAL-REFERENCE.md` (02.2, 08.1 and the B05-08 render
  states).
- Images opened and viewed: `sources/source-05-B05-02-generate.jpg` (02.2, top right: "← HOME", note
  "This should just be a back arrow with the icon housing like other screens") and
  `sources/source-11-B05-08-settings.jpg` (08.1, top right: "← BACK", note "This should be an icon in a
  container").
- Supporting: `source-12-DESIGN-SYSTEM-REFRESHER.md` (Header actions row), `source-13`, `source-17`.
- No conflict found. The references show the current arrow-plus-text; the target is the existing
  framed control on Home, which the references call "like other screens".

## Changes

| File | Change |
| --- | --- |
| `src/app/Generate.tsx` | `Button variant="quiet"` "Home" → `IconButton label="Home"`; `navigate('/')` kept. |
| `src/app/Settings.tsx` | → `IconButton label={SETTINGS_BACK_LABEL}` ("Back"); `goBack` (history −1, else Home replace) kept. |
| `src/app/History.tsx` | → `IconButton label={HISTORY_BACK_LABEL}` ("Home"); `navigate('/')` kept. |
| `src/app/SessionDetail.tsx` | → `IconButton label={SESSION_DETAIL_BACK_LABEL}` ("Back"); `goBack` (−1, else `/history`) kept. |
| `src/app/LocationSettings.tsx` | → `IconButton label="Settings"`; `backToSettings` (−1 from Settings, else `/settings` replace) kept. |
| `src/app/FormatPreview.tsx` | → `IconButton label="Settings"`; same `backToSettings` kept. Unused `Button` import dropped. |
| `e2e/ui-polish-b05-header-back.spec.ts` | New focused mobile browser spec (below). |

Every Back keeps `ArrowLeft size={20}` and the default (secondary) `IconButton` variant. That is
the same housing as Home's Settings control, without Home's REQ-005 glow wrapper. There is no vendor
edit, no new component and no per-route styling.

## Browser evidence — `e2e/ui-polish-b05-header-back.spec.ts`

It renders production routes in mobile Chromium at 390×844, CLEAR skin, with deterministic capture
(`installDeterministicCapture`). Every API request is intercepted: synthetic reads only. Unknown
requests fail the test, writes are counted and must be 0, generation is guarded, and nothing leaves
the local Vite origin. Session-detail reads answer as a synthetic read failure, so detail renders
its error state with the header intact. This is not an installed-iPhone result.

Per consumer, two tests:

1. **Reached in-app.** The test visits Home, captures Home's Settings control as the established
   housing, then reaches the consumer the way a user does. It checks that the Back control:
   - has Home's class list and is a 40×40 square of the same size;
   - has an `aria-label` equal to the preserved name, no visible text and one glyph.
   It then decodes the actual capture in the browser's canvas and checks that:
   - the drawn frame stands >20 luminance above the header 5–6px outside it, on the top and left
     edges;
   - the frame's chromaticity is within 0.05 of Home's frame and its luminance within 12;
   - the arrow glyph is >40 above the interior.
   It then clicks Back and asserts the destination pathname and the router history move
   (back / push).
2. **First entry (no in-app history).** The test visits the route directly (history idx 0), captures
   it, clicks Back, and asserts the existing fallback and history move (replace / push).

Two more tests cover AC-022:
- Settings' `Manage places`, `Preview formats` and `Sign out` keep their visible text and are not
  `clr-hit`. Locations' delete `ConfirmDialog` keeps text `Cancel` and destructive `Delete`; it is
  closed with Cancel and nothing is written.
- The logging sheet's `Minimize` collapse keeps its own name, `aria-expanded`, single chevron and
  collapse behavior.

Generation-loading Cancel was not exercised: reaching it needs a generation request, which this
synthetic proof refuses. Its source (`GenerationLoadingHost`) is not touched by this change.

### Navigation matrix (all passed)

| Consumer | Name | With in-app history | Without (direct/PWA first entry) |
| --- | --- | --- | --- |
| Generate | Home | Home → Generate → Back → `/` (push, as before) | `/generate` → `/` (push) |
| Settings | Back | Home → Settings → Back → `/` (history back) | `/settings` → `/` (replace) |
| History | Home | Home → View history → Back → `/` (push) | `/history` → `/` (push) |
| Session detail | Back | Home → History → row → Back → `/history` (history back) | `/history/:id` → `/history` (push) |
| Locations | Settings | Home → Settings → Manage places → Back → `/settings` (history back) | `/settings/locations` → `/settings` (replace) |
| Format preview | Settings | Home → Settings → Preview formats → Back → `/settings` (history back) | `/settings/formats` → `/settings` (replace) |

Not every Back goes to Home: four consumers return through history or to their own fallback.

### Visual comparison records

References:
- B05-02 = `sources/source-05-B05-02-generate.jpg`, SHA-256
  `9b9f3796547d20c938d89f6022775d7b57748d13ff47ce489b00b5e8603d24b7`, region 02.2 (header Back, top
  right).
- B05-08 = `sources/source-11-B05-08-settings.jpg`, SHA-256
  `b940f3f57130cff2f4ca4123473852d2d44e92723ed8a0d1a25280acce87f097`, region 08.1 (header Back, top
  right).

Each with-history capture has three records in that test's output directory:
`<consumer>-back-with-history.{png,json}` and `<consumer>-comparison.json`. Together they hold the
reference file and hash, the capture SHA-256, source HEAD `0c9f55b` (dirty: the uncommitted change
under test), the viewport, state and consumer, and `result: "pass"`. Measured on the final run:

| Consumer | Ref | Frame lum (top/left) | Header outside (top/left) | Established frame | Glyph / interior | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Generate | B05-02 | 138.5 / 138.5 | 54.3 / 53.7 | 138.5 / 138.5 | 231.9 / 61.0 | pass |
| Settings | B05-08 | 138.5 / 138.5 | 54.3 / 53.7 | 138.5 / 138.5 | 231.9 / 75.7 | pass |
| History | B05-08 | 138.5 / 138.5 | 54.3 / 53.7 | 138.5 / 138.5 | 231.9 / 61.0 | pass |
| Session detail | B05-08 | 138.5 / 138.5 | 54.3 / 53.7 | 138.5 / 138.5 | 231.9 / 61.0 | pass |
| Locations | B05-08 | 138.5 / 138.5 | 57.1 / 53.7 | 138.5 / 138.5 | 231.9 / 61.0 | pass |
| Format preview | B05-08 | 138.5 / 138.5 | 54.3 / 53.7 | 138.5 / 138.5 | 231.9 / 61.0 | pass |

I viewed the Settings, Generate and Home captures: a cyan chamfered frame around a left arrow at
the header's right, matching Home's control and no longer the reference's arrow-plus-text.
Physical-iPhone UAT remains pending until observed.

## Failures and corrections during the run

- First run, 7 failed. The pixel bands sampled the `<button>` box, but the package draws the frame
  on the `.clr-bleed` wrapper. Also, `TextAction`'s accessible name includes its CSS chevron, so an
  exact-name lookup missed it. Fixed: the frame is sampled from the wrapper box, and text actions are
  matched by name prefix.
- Second run, 4 failed on luminance against Home. I first suspected Home's glow and switched to a
  hue comparison. The third run then showed a left-edge miss on Generate/History, and the actual
  cause turned out to be the route-entry slide: the box was measured mid-transition, but the
  screenshot settles animations. Fixed: wait for finite animations to end and the box to hold still
  for two frames. Ambient atmosphere loops are infinite, so they are excluded; waiting on all
  animations timed out. With correct boxes the frames match Home's exactly, so the tight luminance
  comparison was restored alongside hue.

## Verification (this workspace, uncommitted tree on `0c9f55b`)

| Command | Result |
| --- | --- |
| `npx playwright test e2e/ui-polish-b05-header-back.spec.ts --project=mobile` | 14/14 passed, 10.1 s, exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint:ds` | exit 0 |
| `npm run lint` | exit 0; 0 errors, 143 existing warnings |
| `npm run build` | exit 0; existing chunk-size advisory |
| `npm run gen:types -- --check` | exit 0; current, nothing written |
| `python3 scripts/gen-issues.py --check` | exit 0; 71 requirements, 136 edges |
| `npm test` | **exit 1: 2 failed / 5,825 passed**, both in `src/test/design-0143-final-audit.test.ts` (see below) |

## Unresolved — 0.14.3 audit source binding (blocks `npm test`)

`design-0143-final-audit.test.ts` binds `docs/design/CLEAR-0.14.3-FINAL-AUDIT.md` and the TASK-034
format-preview evidence group to a hash of runtime `src/`. Any runtime source change makes it stale:
"the audit names the current runtime source hash 2c96960…" and "Task034 AFTER evidence: stale or
missing source/package/origin identity". TASK-002 and TASK-003 cleared the same failure by
re-running the authenticated format-preview collector (`e2e/design-0143/format-preview.spec.ts`)
against an owned loopback backend with disposable auth. They then wrote a new evidence group, a
lineage record and the new audit hash.

That collector could not be run from this worker. The workspace has no `.env` backend
configuration, and the collector creates a disposable auth user on a backend, which this task's
synthetic no-write boundary does not cover. Writing the new hash into the audit without a genuine
recapture would certify evidence that does not exist, so it was not done.

Next safe action: the controller or owner authorizes and runs the existing format-preview
recapture on this frozen source, as TASK-002/003 did. That means a new evidence group, the
`format-preview-evidence.ts` pointer, the lineage TASK-005 / run `fd1c27d1-…` / attempt 1 /
tested base `0c9f55b`, and the audit hash. Then rerun `npm test`. The task's own browser and
other project checks are green. `origin/main` was not fetched or merged here; the controller owns
integration.
