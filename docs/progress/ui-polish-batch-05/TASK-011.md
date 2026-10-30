# TASK-011 — Roomy swap selection for every ExerciseSwapControls invocation

Issue #569 · REQ-010 · AC-030 / AC-031 / AC-049 / AC-065 · JOURNEY-008 (completion owner, ENTRY-011 Review).
Run `89097d5c-2de1-47ef-8a42-efaa7339e6bd`, attempt 1, branch `agent-runner/task-011-a1-89097d5c`,
base `0f4ee60` (TASK-010 merge #584). This task-owned record satisfies the shared daily-journal
instruction under the approved body exception.

## Intended outcome and reference

I opened B05-05 (`sources/source-08-B05-05-swap.jpg`, SHA-256
`dc30dd507a73027355d21e5f158ba2f55769945be49ef74b105b046c424def99`, 2674 × 1776). I also read
DECISIONS, GLOBAL-PATTERNS (GLOBAL-03 and the "Roomy swap selection — 05" row), VISUAL-REFERENCE
§B05-05, the CODE-REFERENCES "Roomy swap view" row and the `SwapList`/`SwapScreen` and
`.swap-list`/`.swap-label` excerpts. These were supporting sources only, and their exclusions were kept.

- **Selected region (05.2):** the right pane, phone x 1210–1988 in source pixels. The list is at
  y 488–1537 and the return at y 1545–1665. The pane shows:
  - full-width framed choices with a shared leading edge;
  - a bold name over a smaller, quieter equipment line;
  - a list that scrolls;
  - a full-width return below and separate from the list.
- **Rejected region (05.1):** the left pane, phone x 20–932. The list is at y 227–1578 and the
  return at y 1600–1710. The pane shows:
  - a narrow central panel;
  - content-width ragged rows;
  - name and equipment in the same style;
  - a narrow Keep action.

**Not copied:**
- "Choose a movement" and the "Demo candidates…" helper;
- the demo names and the "Replace Mountain climbers" card;
- the left-pane geometry;
- any candidate logic.

No owner conflict was found.

**Root cause of 05.1.** Two things combined:
- The vendor `<dialog>` is fit-content.
- Every vendor `Button` sits in an `inline-flex` `.clr-bleed` wrapper. The `width: 100%` on the
  button therefore resolved against a wrapper that had shrunk to its own label.

Together they gave a panel as narrow as the longest label, and ragged rows.

## Viewport / overlay / route choice (explicit)

The swap selection stays a **native modal overlay (AppDialog) above the owning Review route**:
- No route is added.
- Review's state, scroll position and focus return are preserved.
- Esc and Keep stay the safe return.

The overlay spans the screen's content width with the contained shell's gutters:
`max(--spacing-400, safe-area inset)` on each side. The package panel's own 440px cap is preserved
(pinned vendor), so the panel is full content width on every phone width up to 472px.

The list stays in the existing public `ScrollRegion` via `FittedScrollRegion`, from the TASK-003
boundary contract. Its frame cap now also subtracts the top and bottom safe-area insets. The title and
Keep return sit outside the scroller.

## Change

- **`src/ui/exercise-swap.tsx`.** The shared `SwapDialog` / option-list composition, used by every
  `ExerciseSwapControls` invocation. The caller API is unchanged.
  - `className="clr-swap-dialog"` on `AppDialog`. This scopes the change to swap selection only.
  - Keep gets the public `ChevronLeft` icon, as a return. Its label is unchanged: `Keep {name}`.
  - Choices are default-size `Button`s (the target's ~58px row).
    - **Name:** `--label-md`, bold.
    - **Equipment:** `--label-xs`, regular weight, `--text-secondary`.

    The list carries `clr-swap-dialog__options`.
  - The list frame cap subtracts `env(safe-area-inset-top/bottom)`.
- **`src/ui/exercise-swap.css` (new).**
  - `.clr-dialog.clr-swap-dialog`: `width: 100%`, with gutter padding.
  - `.clr-swap-dialog__options > li > .clr-bleed { display: flex }`, so each choice fills the list
    width.
- **`e2e/ui-polish-b05-swap.spec.ts` (new).** The focused browser proof, described below.

**Unchanged:**
- vendor files;
- `AppDialog`;
- confirmation/feedback dialogs, including the Regenerate `ConfirmDialog`;
- the swap provider, candidate logic and toast behaviour.

## Failures and corrections

1. **First run: lists never appeared (product correct, fixture wrong).** My warmup candidates used
   `exercise_role: 'warmup'`. That is not a catalog role, so the data layer rejected the read and the
   dialog correctly showed its ErrorView. **Fix:** use `mobility`.
2. **Name and equipment both computed to 14px (real product finding).** The swap dialog renders
   inside Review's `ScrollRegion` scroller. Shell rule U06 lifts `--label-xs` to `--label-sm` there.
   The top layer does not change CSS inheritance, so shell.css's note that dialogs sit outside Screen
   does not hold for this one. **Fix:** set the name to `--label-md` and leave the shared U06 token
   untouched. The result is 16/14, against the reference's ~13/11.
3. **The hierarchy pixel reading did not discriminate (spec fault).** Brightness contrast alone gave
   63 for the selected pane and 50 for the rejected one.
   - **Fix:** a glyph-height ratio (selected 1.20, rejected 1.04, threshold ≥ 1.08) AND brightness
     contrast ≥ 20.
   - Captures are read at device pixels (×3) for resolution.
4. **The empty fixture returned empty sections (fixture wrong).** The data layer treats an empty
   section as an error, which the product correctly shows. **Fix:** a real empty slot, where every
   candidate is already in the workout.
5. **Spec bugs:**
   - The list-versus-return check measured the whole `<ul>` instead of its scroller.
   - After a swap, the replacement's Swap label comes from `exerciseName(id)`.
   - A reopen clicked during the previous dialog's 200ms modal exit. **Fix:** wait for native closure.
   - The wait for the infinite loader animation never finished. **Fix:** finite animations only.
   - A capture was taken with the scrollbar still lit from a programmatic reset. **Fix:** wait for rest.

## Verification (final tree: base `0f4ee60` plus this task's uncommitted change)

**`npx playwright test e2e/ui-polish-b05-swap.spec.ts --project=mobile` → 18 passed (17.5 s), exit 0.**

- **Proof mode.** The production `/review` route runs on its own local Vite origin
  (`*.supabase.invalid` placeholders). Reads are intercepted and synthetic. Every case asserts:
  - zero writes;
  - zero function or model calls;
  - zero outbound requests;
  - zero blocked generations.

  Axe runs on entry through `visit`. The mobile project is Chromium with DSF 3.
- **Consumers.** All three Review invocations: Swap air squat (warmup), and Swap back squat and kb
  swing (primary lift).
- **Viewports.** 390×844, 320×568 and 390×480.
- **Matrix and results:**

| Case | Viewports | Result |
| --- | --- | --- |
| Long list (24, including long names) × 3 invocations | all 3 | Roomy frame (panel 16px each side); full-width rows; name above equipment (larger, heavier, different colour); hard-clipped measured region that scrolls under wheel input; title and Keep outside the scroller; Keep fully on screen, ≥ 40px tall, below the list; no demo copy. Pixel comparison passes. |
| Short list plus 3 long names | all 3 | As above; long names wrap inside their row with no horizontal overflow. Pixel comparison passes. |
| Three-choice list | 390×844 | Fits: no overflow and no pinned edges. Pixel comparison passes. |
| CLEAR skin, long list | 320×568 | Same verdicts. Pixel comparison passes. |
| Selection | 320×568 | The last long-named choice is scrolled into view inside the scroller and chosen. The dialog closes; URL `/review`; Review heading present; the existing toast reads "Swapped in …"; the replacement's Swap and Undo are enabled. |
| Cancel / return | 390×480 | Keep returns: focus goes back to the trigger, nothing is swapped, no toast. Esc also returns. |
| Loading (held read) | 390, 320 | The existing `LoadingView` (status, aria-busy) shows inside the roomy frame. |
| Error, then retry | 390, 320 | The existing `ErrorView` shows inside the roomy frame. Try again re-reads (2 reads) and the roomy rows appear. |
| Empty | 390, 320 | The existing `EmptyState` shows inside the roomy frame, with Keep. |
| Regenerate confirmation | 390×844 | Still the package dialog: no `clr-swap-dialog`, no padding, no list or region. |

**Visual comparison (AC-065).**
- **Method.** One in-browser pixel reading runs on the reference regions and on each actual capture.
  - Choice rows are found as top/bottom runs of the skin's action-accent rule. The live token is
    resolved for captures; the reference uses teal `60,222,190`.
  - For each run it measures:
    - median row width as a fraction of the phone width;
    - row-width spread and leading-edge spread;
    - the name/equipment glyph-height ratio and brightness;
    - the widest return rule.
- **Discrimination.**
  - The selected pane passes all five verdicts: width 0.826, spread 0, height ratio 1.20, contrast
    63, return 0.914.
  - The rejected pane fails fullWidthRows (0.368), equalRows (0.104), nameOverEquipment (1.04) and
    roomyReturn (0).
- **Pass rule.** Every capture must equal the selected pane's verdicts, and its row width must be
  within 0.10 of 0.826. Actual examples:

| Capture | Row width | Height ratio |
| --- | --- | --- |
| 390 short list | 0.794 | 1.38 |
| 320 long list | 0.749 | 1.14 |

**Capture identity.**
- Source head `0f4ee60…`, `dirty: true` (this task's uncommitted change).
- Each record also holds:
  - SHA-256 of the working `src/ui/exercise-swap.tsx` and `.css`;
  - viewport, route, consumer, state and skin;
  - the reference file, hash and regions;
  - the readings, verdicts and the device-scale capture hash.
- Records are written beside each test's output (`*.json`, `*.comparison.json`, `*.png`,
  `*.device.png`).

CSS-scale capture SHA-256s from the final passing run:

| Capture | SHA-256 |
| --- | --- |
| swap-long-phone-air-squat | `d4438e98…d23d5b` |
| swap-long-phone-back-squat | `47f1e7de…fac544` |
| swap-long-phone-kb-swing | `3ed87a03…ae84c` |
| swap-long-narrow-air-squat | `27bfc9d3…398b4` |
| swap-long-narrow-back-squat | `e038d8df…e3a6e` |
| swap-long-narrow-kb-swing | `1f044c46…a5abc` |
| swap-long-short-air-squat | `ac8f7437…2fc13` |
| swap-long-short-back-squat | `112b57e9…96fad8` |
| swap-long-short-kb-swing | `a79d4e2a…0a6` |
| swap-short-long-names-phone / narrow / short | `ab844e5e…c99d` / `7e96296d…bbc2` / `4a573424…c86` |
| swap-short-phone | `365c27fd…38e3` |
| swap-long-narrow-clear | `1478419d…40f9` |
| swap-select-narrow-before / after | `8c2f7516…e909` / `f00dbec2…6f5f` |
| swap-cancel-short-after | `d7b41a68…51a2` |
| swap-loading-phone / narrow | `a33c85cc…11cf` / `f7120e35…eee5` |
| swap-error-phone / narrow | `f17512be…5b50` / `4d9b4718…8472` |
| swap-empty-phone / narrow | `68321b69…a4fe` / `9384fd01…291a` |

I also opened and reviewed captures by eye:
- **320 long list:** roomy, full-width rows, name over equipment, Keep below the list.
- **Selection result:** Review with Undo and the toast.
- **320 empty state:** the EmptyState inside the roomy frame.

### Other commands

| Command | Result |
| --- | --- |
| `npm run lint:ds` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (existing chunk-size warning) |
| `npm run lint` | exit 0: 0 errors, 149 warnings, the same count as TASK-010. The one in `exercise-swap.tsx` is the existing `equipmentText` export. |
| `npm run gen:types -- --check` | exit 0, types current |
| `python3 scripts/gen-issues.py --check` | exit 0 (71 requirements, 136 edges) |
| `npm test` | **exit 1:** 2 failed, both in `src/test/design-0143-final-audit.test.ts` (see below). The current runtime hash is `a0c0e7117d71b9e41fd922d9da7b8a72e39910c46f694d1ef41aa9330c696315`. All swap unit tests pass unchanged: `exercise-swap.test.tsx`, `swap-selection.test.tsx` and gallery registry. |

One of three full runs also failed `amrap-block.test.tsx` › "stays hands-off through the low-time
cue". It passed in the run before and the run after, and this task does not touch AMRAP. I recorded it
as an intermittent timing failure, not investigated further.

**Not run.** The neighbouring browser specs that touch the swap dialog:
- `ui-polish-b05-scroll-boundaries` (TASK-003);
- `ui-polish-swap-selection`;
- `ui-polish-b05-review-groups`.

The sandbox did not approve that command. Their selectors (`.clr-scroll-region`, `[data-swap-list-frame]`,
`[data-swap-option-label]`, "Keep …") and the fitted-region mechanism are unchanged, but this is unverified
in a browser here.

## Unresolved: the 0.14.3 final-audit binding (same as TASK-004 … TASK-010)

`design-0143-final-audit.test.ts` binds the audit and the TASK-034 format-preview group to a hash of
runtime `src/`. This task's runtime change therefore fails two checks:

- "is bound to the package and runtime source of this tree…";
- "requires the complete actual eight-cell mobile group…".

Clearing them needs the existing authenticated collector (`e2e/design-0143/format-preview.spec.ts`)
against an owned disposable local backend. That is not available inside this worker boundary. Writing a
new hash without a genuine recapture would certify evidence that does not exist, so I did not do it.

**Next safe action:** the controller freezes this source and runs the existing recapture, as for earlier
batch tasks. This creates:
- the `task034-format-preview-batch05-task011` group;
- the evidence pointer;
- lineage (TASK-011 / run `89097d5c-…` / attempt 1 / tested base `0f4ee60`);
- the audit rebind.

Then rerun `npm test`.

## Still pending

- Physical-iPhone UAT of the roomy swap selection (safe areas, touch scrolling) has not been observed.
- Native controller verification, the recapture/rebind and delivery have not happened.

## Offline proof supplement after the first native attempt

The controller reports the first native attempt terminal with worker success, both focused browser
phases passing all 18 cases (18.6s and 18.1s), then `npm test` failing only the two existing final-audit
source-binding assertions. Original source and browser artifacts were preserved externally before
checkpoint `e227f73d0bb0e2d73f11f3b3c4caf854dfe1d260`. This supplement retains that worker history;
it does not turn the failed native attempt into acceptance.

Only `e2e/ui-polish-b05-swap.spec.ts` and this task-owned note changed in the offline supplement:

- Capture identity now uses the actual checkout's `git rev-parse --verify HEAD` and status through
  the existing Task10 `execFileSync`/10-second-bound pattern. Git or source-read failure throws;
  there is no `GITHUB_SHA`, `unknown` or null-dirty fallback. Interim dirty evidence remains honestly
  identified; final clean proof remains the controller's next step.
- The original 18 passing cases and their assertions remain. An optional composition/candidate
  response seam leaves their defaults intact, while two additional cases use Task10's real-shaped
  Superset and Circuit factory recipe at normal and narrow phone sizes. Each opens the actual
  grouped Review's selection, compares its long-list composition with the selected reference, picks
  an actual intercepted candidate in the intended member, observes the existing toast/full Undo,
  then undoes it. Group readings, other members and the other group must remain unchanged; route,
  focus, accessibility and the original no-write/model/outbound guards are preserved.
- One additional 390×320 case uses Task10's long current-movement ID plus long candidate names.
  It requires the full title/Keep label, list containment, last-choice reachability and independently
  reachable return before and after scrolling, then verifies unchanged Review on return. It retains
  full labels and existing geometry assertions; no product height cap, font or CSS changed.

**These additions have NOT been run.** Task13 owns the sole local browser/test lane. No test, build,
browser/server, Git, database, Runner or GitHub operation was run for this supplement. In particular,
the new shortest-view proof may expose the existing guessed list-cap floor; no speculative product
fix or pass claim is made. After that lane is available, the controller must run the actual cases,
inspect their new pictures, address any concrete in-scope failure, then perform genuine source-bound
recapture/native verification and normal protected-build delivery. Physical-iPhone UAT stays pending.


### Controller preparation of the existing source-bound proof

The controller selected the unused `task034-format-preview-batch05-task011` destination and changed
only active lineage inputs to this actual TASK-011 / approved graph revision / run89097d5c / attempt1 /
tested base0f4ee603. The unchanged helper derives the real retained branch from that identity. Old
groups, validators, package constants and photographs remain untouched. The destination has no
new captures yet. This is preparation for genuine collection after the final browser proof; no audit
pass, runtime hash, provenance or native acceptance is inferred. Product TSX/CSS match the preserved
original worker checkpoint byte-for-byte. Added21-case browser candidate remains unexecuted while
Task13 owns the local lane.


## Explicit Undo focus correction — 2026-10-30T02:43:26.973925+00:00

The first run of the three supplementary browser cases on clean `41420613` ended exit1:
390×320 long-title/full-Keep passed (2.2s), while both grouped cases reached the same failed
`original Swap.toBeFocused()` assertion after Undo. Real selection, replacement focus, toast and
unchanged group readings had passed first. The controller retained those original failures in
`task011-grouped-supplement-diagnostic-20261030`; the raw pre-fix output was also copied to
`task011-before-undo-focus-targeted-20261030` before the corrected run.

**Cause.** Explicit Undo removes its own focused TextAction. Task10 deliberately renders Swap and
Undo in separate `ExerciseSwapControls` instances, so the Undo-only instance returns null after
restoration. There is no dialog close at this point to restore native focus; focus was left on
the document instead of the movement's restored Swap control. This was an actual accessibility
gap exposed by the added grouped journey, not a reason to remove or force the assertion.

**Local correction.** `src/ui/exercise-swap.tsx` marks the existing Swap button with its slot. On
explicit Undo only, it records the nearest shared ancestor containing that same-slot Swap plus
the expected restored exercise ID, then invokes the unchanged provider once. A layout effect
after the composition commit restores focus to the current enabled Swap button in that local
scope, including when the Undo-only instance now renders null. No global document lookup, timer,
new component/provider/caller API, label, product CSS, height cap or data behavior changed.

`src/ui/exercise-swap.test.tsx` now exercises real keyboard-triggered state replacement in both
paired and split controls, with another movement present to prove focus stays with its owning
slot. A separate case proves a composition change that was not explicit Undo does not steal focus.

**Observed verification.**
- `TMPDIR=/tmp npx vitest run src/ui/exercise-swap.test.tsx`: foreground24039 terminal0,
  **25/25 passed**,1.13s.
- `npx playwright test e2e/ui-polish-b05-swap.spec.ts --project=mobile --workers=1 --retries=0
  --grep 'Superset and Circuit|390x320'`: foreground59333 terminal0, **3/3 passed**,18.2s.
  Grouped phone8.0s and narrow6.7s both traverse Superset and Circuit choose/Undo with the actual
  focus assertions retained; long-current-title390×320/full-Keep passed2.1s. Whitelisted local
  environment omitted E2E_BASE_URL and real/provider credentials; existing synthetic-origin and
  no-write/model/outbound guards remained.
- Actual targeted output retained in `task011-undo-focus-targeted-passed-20261030` with SHA-256
  retention manifest: 38 files, 18 PNGs. Its captures honestly record
  the actual `41420613` head with dirty source during this correction; they are not relabelled
  final clean-source/native acceptance evidence.

Both commands were fully collected and the browser lane released. The full21-case browser run,
combined-tree build/full verification, genuine format recapture and native recovery/delivery are
still the controller's next steps. No Git, Runner/state or GitHub operation was run for this
correction. Physical-iPhone UAT remains unobserved.


## Combined clean-source proof and real format recapture

The controller froze the reviewed candidate at `cdd5044b177baa8a4ea55d35d522688df175a9ce`. Full focused browser foreground2921 passed **21/21 in 1.4 minutes** on this clean source. All 38 source-bearing records name that exact head with dirty=false; 115 artifacts / 56 PNGs plus the retention manifest are preserved externally in `task011-full-browser-clean-evidence-20261030`. This includes the added grouped choose/Undo and long-current-title390×320 checks with the genuine focus assertions preserved. Existing swap-regression foreground60811 passed **5/5 in 41.4 seconds** on the same source; ten artifacts / four PNGs plus manifest are preserved in `task011-existing-swap-regressions-passed-20261030`. Earlier dirty targeted and failed outputs remain honest separate history.

Existing authenticated format collector foreground52834 ended terminal0, **4/4 skin cases in 21.5 seconds**. It generated eight genuine phone390×844 / short390×320 PNGs in `docs/design/evidence-0143/task034-format-preview-batch05-task011`, observed 2026-10-30T02:55:15.525Z through 2026-10-30T02:55:29.991Z, process16064. Four passed records, the complete derived eight-cell manifest and each actual PNG's bytes, SHA-256 and IHDR dimensions were checked. Actual source/runtime/driver/package identity is:

- captured source: `cdd5044b177baa8a4ea55d35d522688df175a9ce`
- runtime: `c245a873f78437d10837ecd41b12cabc0b5053f3935a6839cbb3096cbed23f92`
- driver: `6a91f60cdf4da1714887cce9bd3786e038ff154c18a2ea1b65bc36b2f02e3ae7`
- package0.14.3: `e09aa5dfaf7a5e9536e9ffd7b8a00624e38c7702d484dc1e820153e22864a1a8`
- payload: `65d1fbead06540b2491b2132618bbb5b265a190ec7d3be4bc8e9f1ed8dae4a96`

Runtime/driver/package were independently reproduced from current source bytes. Preview generation, blocked generation, attempted write and forwarded write counters are all0, including session generation; owned local auth setup/cleanup remains separate. The first record is clean; later dirty status reflects newly generated collector evidence. Existing v1 source-only provenance derives the actual payload with unchanged `capturePayloadSha256()`, using Task11 revision `183640643cde2e984abe8e52393a336ff9516279c4d0a42ccfb5c44bda86a2e5:TASK-011`, run`89097d5c-2de1-47ef-8a42-efaa7339e6bd`/attempt1, branch`agent-runner/task-011-a1-89097d5c` and actual tested base`0f4ee603516be9ab477c0a109549be3063975fce`. No old image or hash was relabelled; previous rows/groups/assertions remain.

Only generated provenance, this note and the audit entry were changed during derivation. No product/runtime/driver/helper/test, Runner/state or Git change, test/browser run or private configuration access occurred. Native exact-head criterion/task/project acceptance, receipt, required CI and build-branch-only delivery are still pending; physical-iPhone UAT remains unobserved. Root owns final picture review, commit, independent native verification and delivery.
