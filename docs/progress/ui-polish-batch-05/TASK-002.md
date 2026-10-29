# TASK-002 — Shared shell repair: header clearance and bottom band

Issue #560 · REQ-001, REQ-002 · completion owner for JOURNEY-001.
Branch `agent-runner/task-002-a1-5b3cef73`, base `deda747` (TASK-001 merged).
This is the task's own progress record. For this body it replaces the shared daily journal, under
the owner-selected task-owned exception.

## Intended outcome

Correct the shared viewport/safe-area relationship once, in the shell, so that:

- titles and header controls clear the retained blur;
- no empty band sits below the last layer;
- routed screens, the independent boot shell and the crash fallback all get the result.

Then turn TASK-001's reproduction into the repair proof.

## Sources read

- Primary sources: DECISIONS ("Global scope" and "Technical work"), GLOBAL-PATTERNS (GLOBAL-01/02
  and the shared architecture), VISUAL-REFERENCE (01.1, 01.4, 02.8, 08.2), and TASK-001's record.
- I opened and viewed the three images. Their SHA-256 values below were computed by the spec from
  the evidence snapshot:

  | Reference | SHA-256 | Regions compared |
  | --- | --- | --- |
  | `sources/source-04-B05-01-home.jpg` | `e0a8762578b19714c7bb8d3385982186cac028227b28b290389115171b16e6f6` | 01.1 header row (TODAY + corner Settings control); 01.4 bottom |
  | `sources/source-05-B05-02-generate.jpg` | `9b9f3796547d20c938d89f6022775d7b57748d13ff47ce489b00b5e8603d24b7` | header title; 02.8 bottom |
  | `sources/source-11-B05-08-settings.jpg` | `b940f3f57130cff2f4ca4123473852d2d44e92723ed8a0d1a25280acce87f097` | header; 08.2 lower boundary (no footer) |

## What the references show (visual reading, no pixel sampling)

- **01.1:** the title glyphs start right at the status-area boundary. The wash covers about their
  upper half, then fades. No app layer sits above the header: TASK-001 showed that in hit-tests,
  and the only app blur in those local cases is the atmosphere *beneath* the content. This does
  not establish what causes the installed device's wash or which layer draws it.
  - Unproven possibility: the wash could involve the installed status-area edge treatment.
  - Either way, the owner's option "move the title down" is the one the page controls.
- **01.4 / 02.8 / 08.2:** the flat, unscanlined reference band is absent from the local captures.
  A device-viewport effect is a possibility, not an established cause. TASK-001's local atmosphere
  fills its measured viewport; this does not establish the installed device's geometry.
  - Directly above the band, 01.4 and 02.8 show an empty atmosphere strip under the action. It
    corresponds to the local baseline's measured 46 CSS px: 34 px of shell padding plus the
    footer's 12 px. The phone image alone does not establish exact CSS measurements.
  - That strip is the reproduced shell-owned part of the "dead area".

## Changes

The fix lives in one shared composition. No route offsets, no fixed heights, no zeroed insets.

- `src/styles/shell.css`: the contained shell now declares the whole relationship:
  - `--shell-gap-top` / `--shell-gap-bottom`: page gaps, `--spacing-500` / `--spacing-300`;
  - `--shell-inset-top: calc(env(safe-area-inset-top) + gap)`: the page gap starts below the
    inset instead of being absorbed by `max()`;
  - `--shell-inset-bottom: max(gap, env(safe-area-inset-bottom))`;
  - `padding-bottom: 0`: the shell reserves nothing at the bottom, and `<main>` reaches the
    viewport bottom.
- The screen's last layer carries the bottom inset:
  - `.clr-scroll-region__foot > .clr-footer` (`PhoneFooter`) pads its bottom by
    `--shell-inset-bottom`;
  - without a foot, `.clr-screen__content` pads its end by the same amount;
  - the home-indicator area is therefore the action's clearance, not an extra strip.
- `src/ui/workout-navigation.css`: the existing short-window workout rule narrows the two *gaps* to
  `--spacing-200`. It no longer restates the shell padding, so it cannot reintroduce the bottom
  strip. Insets are never reduced.
- `src/app/RootLayout.tsx`: a new `ContainedShell` holds the atmosphere plus the shell markup.
  RootLayout, `BootSequence` and `ErrorBoundary` all render it, so the boot copy and its divergence
  are gone.
- `src/app/ErrorBoundary.tsx`: the crash fallback now renders inside `ContainedShell` with a `Screen`
  (CLEAR mark as h1, as boot does). It uses a **still** atmosphere: `AtmosphereGround still`, which
  reads no preference store, because that store may be what failed.
- `src/ui/atmosphere.tsx`: `AtmosphereLayer` is split into the preference read plus
  `AtmosphereGround` (identical markup).
- `Screen.tsx` and `AppHeader` (vendor) needed no change. The header stays an in-flow sibling, and the
  top clearance comes from the shell.
- Tests:
  - `e2e/ui-polish-b05-shell.spec.ts` now asserts the repaired geometry and the wider matrix.
  - `contained-shell.test.tsx` gains a crash-fallback-in-shell check.
  - `app-shell-frame.test.tsx` gains B05 declaration and wiring checks.
  - Stale declaration assertions in `pwa-viewport.test.tsx` and `workout-footer-nav.test.tsx` were
    updated.
  - `gallery-registry.test.tsx` records `AtmosphereGround` as framed through `AtmosphereLayer`.

## Repair proof (local Chromium mobile emulation, deviceScaleFactor 3)

The source is `deda747` plus this task's uncommitted changes, so captures record `dirty: true`. Data
is synthetic and intercepted; writes are asserted to be 0, and no model call is made. Each case's
PNG and JSON (source identity, origin, viewport, insets, family, consumer, state, capture SHA-256,
rendered boxes and hit-tests) are written to its test output directory and attached to the report.

At phone 390×844 with insets 47/34, every shell family measured:

- `<main>` gap to the bottom: 0;
- atmosphere: unpainted 0;
- shell padding: top 67 (47 + 20), bottom 0;
- title and controls: y ≥ 67, clear at all five hit points.

| Case (capture id) | Family / state | Last layer → bottom | Capture SHA-256 (prefix) | Result |
| --- | --- | --- | --- | --- |
| routed-home-phone | Home, footer | action 34 (was 46) | `5c16fa9d0b87` | pass |
| routed-generate-phone | Generate, footer | action 34 (was 46) | `d857f4f33d5c` | pass |
| routed-settings-phone / -end | Settings, long, no footer | scroller to edge; content end pad 34 | `4c8989a8d590` / `3a355e84dc14` | pass |
| routed-locations-phone | Locations, footer | action 34 | `8a825be786a2` | pass |
| routed-history-phone / -end | History, no footer | content end pad 34 | `d1f07ea90d73` / `e3449e7e031f` | pass |
| routed-session-detail-phone | Session detail, error state, footer | action 34 | `586bea948537` | pass |
| routed-review-…-phone | Review, empty, no header controls (intentional) | action 34 | `bdc6f495bd25` | pass |
| routed-not-found-phone | Not found, no header/footer, short | content end pad 34 | `1c3752e7f562` | pass |
| routed-login-phone | Login, footer | action 34 | `788641fe3157` | pass |
| guard-signed-out-phone | guard → Welcome | content end pad 34 | `5fda6ef003ff` | pass |
| guard-onboarding-phone | guard → /onboarding | action 34 | `768d4f7b1d2a` | pass |
| boot-checking-phone | boot, loading | content end pad 34 | `be4416ac69bf` | pass |
| boot-failed-phone | boot, error, Retry footer | action 34 | `d90b88624003` | pass |
| crash-fallback-phone | ErrorBoundary, still atmosphere | content end pad 34; alert below 67 | `51575880ad6d` | pass |
| routed-home-narrow 320×568, 20/0 | Home | action 12 (was 32) | `8acf48329c04` | pass |
| routed-home-short 390×480, 47/0 (keyboard stand-in) | Home | action 12 | `d03cab1abac8` | pass |
| routed-home-restored 390×844 | Home after short | action 34 | `43c201467a8d` | pass |
| routed-home-zero-inset | Home, 0/0 | action 12 (was 32) | `c62bed9349ec` | pass |
| routed-home before/after frozen→active | Home, lifecycle | identical boxes and capture | `5c16fa9d0b87` (both) | pass |
| routed-settings narrow / short / zero / resume | Settings, no footer | content pad 12 / 12 / 12 / 34 | `645369c04a1b` / `a6bf83efe7db` / `04974ce84735` / `4c8989a8d590` | pass |

How the captures compare with the references (I viewed home, settings-end and the crash fallback):

- **Header (01.1):** TODAY and the Settings control sit a full 20 px page gap below the top inset,
  with the atmosphere (blur) still behind the status area. The reference's title sits *on* the
  inset boundary.
- **Bottom (01.4 / 02.8):** Generate workout ends exactly at the bottom inset, with atmosphere
  under it and no extra strip.
- **Lower boundary (08.2):** Settings content scrolls to the viewport edge, and its last card
  clears the inset.
- **Crash fallback:** now shows the shell, the gutter and a still atmosphere. Before, it had a bare
  alert at y 0.

Summary and Workout without a session redirect to Home (landed `/`). Their own layouts were **not**
rendered locally. They are wired to the same owner, because both are routes under RootLayout's
`ContainedShell`, use `Screen` and use `PhoneFooter`. The workout short-window variant is covered by the
declaration test. Format preview is likewise wired but was not rendered in this spec.

## Failures and corrections

1. **First repaired run: 3 of 18 failed, all fixture expectations.**
   - Locations has a footer action.
   - Empty Review intentionally has no header controls.
   - Session detail issues read-only RPCs (`session_*`) that the fixture counted as writes. They now
     answer as a synthetic failed read, which renders the error state.
   - The failure message now names the request.
2. **Full suite failures in the original worker candidate.**
   - Gallery coverage required an account for the new `src/ui` export; it is recorded.
   - Two `src/test/design-0143-final-audit.test.ts` tests rejected stale proof. See the genuine root
     recovery below; final native acceptance remains pending.
3. **Tool approvals.** Ad-hoc `shasum`, filtered Playwright and single-file vitest runs were not
   approved. Hashes were therefore computed inside the spec, and only the exact controller commands
   were run.

## Verification (worker's tree before proof recovery)

- `npx playwright test e2e/ui-polish-b05-shell.spec.ts --project=mobile`: 18 passed.
- `npx vitest run src/app/contained-shell.test.tsx src/app/app-shell-frame.test.tsx`: 40 passed.
- `npm test`: **2 failed**, 5812 passed (237 files). Both failures are in
  `design-0143-final-audit.test.ts`.
- `npm run lint:ds`: exit 0.
- `npm run build`: exit 0 (existing chunk-size warning only).
- `npm run lint`: 0 errors, 143 pre-existing warnings, none in touched files.
- `npm run typecheck`: exit 0.
- `npm run gen:types -- --check`: current.
- `python3 scripts/gen-issues.py --check`: exit 0.

## Original blocker and remaining verification

- **Original blocker: the 0.14.3 final-audit binding.** `design-0143-final-audit.test.ts` binds the audit and
  TASK-034's format-preview evidence records to the exact runtime-source hash of `index.html` + `src`.
  Any runtime change, including this required shell repair, makes both fail until two things happen:
  - TASK-034's format-preview group is genuinely recaptured against an isolated disposable local
    backend using the existing committed schema and catalog seeds.
  - The audit is rebound to the new hash.

  The worker did not weaken the test or fabricate a binding. Its initial reading that a disposable
  local backend was prohibited was incorrect: the approved boundaries prohibit hosted/schema and
  generation changes, while disposable local verification is expressly allowed. Root selected the
  existing genuine recapture/rebind procedure, preserving every check and earlier evidence group.
  Fresh collection and the unchanged offline audit/source-lineage consumers subsequently passed
  (4/4 collector cases, eight PNGs; 67/67 consumer tests). Native final verification and delivery
  remain pending; the earlier worker's stale-proof failure is preserved as history.
- **Device-only, pending outside the DAG:** the cause of the installed iPhone's flat bottom band,
  and whether the shared page gap fully clears the status-area wash on the
  pictured device. Physical installed-iPhone UAT has not been observed. Local results are Chromium
  emulation only.

## Next safe action

Complete the fresh local proof and actual audit/lineage derivation, then run the existing native
same-workspace recovery on attempt 1 with every approved criterion/task/project check. Publication,
required CI, protected build-branch merge and native completion remain mandatory before TASK-003.
Installed-iPhone UAT for 01.1 / 01.4 / 02.8 / 08.2 remains outside the DAG after launch.

## Root recovery checkpoint

The original worker and controller failure remain preserved. No second coding attempt, Runner
change, state edit, requirement revision, hosted mutation or release exception was used.

The existing focused shell command now passes **22/22** cases after adding actual synthetic active
Workout normal/narrow/short/restored/resume coverage and bounded Vapour Home/Generate/Settings
reference cases. A first 21/22 run identified a test measurement issue: an intentionally hidden
Abandon menu item had a zero-size box. The fixture now records hidden controls separately and
asserts the visible Actions control; no product control was removed. The corrected command passed
once (14.9 seconds). Its spawned test servers were collected and stopped normally.

Actual shell captures and JSON were preserved outside the product under the execution body's
`runner/reports/task-002-shell-browser-evidence`, with a file-hash manifest alongside, before the
separate authenticated collector could clear test-results. The reviewer opened B05-01/02/08 and
the new Vapour Home/Generate/Settings-end and actual Workout-short renders. Titles and controls
are crisp with atmosphere retained; Generate has 34px inset clearance, Settings content ends with
34px clearance, and compact Workout keeps both navigation cells visible with 8px clearance.
These are local rendered observations, not installed-device cause or UAT proof.

| Additional actual capture | SHA-256 |
| --- | --- |
| vapour-home-phone | `b0442f57969706f3845649c85da3fe9e08e25eeecbe71f75c3a2f0a588941d80` |
| vapour-generate-phone | `26d03f67b0a8b0754863c01ac26d95eecea616274ccd964c38787f34b5a3a9f5` |
| vapour-settings-phone | `b699ad3223caa9aa391136485b6d1b136104cad507fe9d8b38ca38410f2fcd0f` |
| vapour-settings-phone-end | `e248ad56940f1018b47a003a088cf691511a3ba9fb735d7fe7e4e0111694f9db` |
| routed-workout-active-phone | `6b81761eaf0fd31612bbbbd925a3d6ed6c19354fdf81a8227b9bc46ac2dda8e7` |
| routed-workout-active-narrow | `2236b78f068d5dff0f886af63e0dd80abbcde4bd37afaecb0057a34b3bcfe79a` |
| routed-workout-active-short | `57a1b91c24e0ef75732bed0814300d2ebb9476b5607e9a9e38e7803780ff2b2e` |
| routed-workout-active-restored / after-resume | `b9831350963019d9b61a9f45074b94354fb02e08203e97cb6838e64873cebe7d` |

These records identify runtime source `deda747b41bf9d690bedbba6c27a5fd2e362428a` plus the
uncommitted TASK-002 changes (`dirty: true`). No installed or deployed identity is inferred.

An owned disposable Postgres 17/auth/REST project uses isolated loopback API 55631/database 55632
with only the current 29 committed migrations and three catalog seed files. Existing local services
are untouched; runtime connection data is private and excluded from Git. The cached CLI remains
2.117.0. The actual four-skin/eight-PNG format collector subsequently passed in 23.6 seconds on
committed source `3652e246bfbf03f1a3c047ed9f7d36066e9c0bbc` (session 43703, exit 0).
Fresh group: `docs/design/evidence-0143/task034-format-preview-batch05-task002`.
Runtime `abcf73e6e0450c55a58b8c3a3eb4a4472d07ef2b779bd2ed5a23cee594994bba`, driver
`083baa314ddec0d70482758f1e41459d18f938dd1a23c2d4f7536fdb7cfb00b9`.
All four cases passed, all eight phone/short PNGs are real new captures, and every recorded
generation/write counter is zero. The existing source-only v1 lineage record uses the actual
current task/run/base/revision and payload hash
`1a53ce4230f9d88de4ae44fe1fd8cb73b8d4a5bf6524bdf89a6e9a4630801af8`.
All earlier groups remain unchanged. The final audit was derived from these records; the unchanged
offline audit/source-lineage consumer command passed **67/67** tests (10.44 seconds, exit 0,
session 41320). Every approved native criterion/task/project check and protected delivery remain
pending until actually observed on the final candidate.
