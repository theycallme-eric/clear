# TASK-003 — Shared scroll-boundary contracts

Issue #561; REQ-003; JOURNEY-002 completion owner. Obligations AC-007–010, AC-046, AC-058.
Task-owned progress record under the approved journal exception.

## Scope and current native state

Implement axis-appropriate public scroll contracts across page, card, swap, sheet and capped
workout viewports. Keep vertical hard clipping, measured pinned layers, drawn 2px bar/transient
streaks, horizontal overflow-availability rules/chevrons and genuine active/focus reveal. Preserve
intentional non-scroll/decorative cases and Task002's safe-area geometry. Use app-owned seams and
the pinned public design-system API; vendor bytes remain unchanged.

Native run `fda3e2de-9448-4855-a2f6-41237bd879d2`, source workspace/branch
`agent-runner/task-003-a2-fda3e2de`, tested base
`ec99341250b31bbd5bc0ab99fab71c8012c3d3dd`. Both configured native attempts are used. Attempt1 was
interrupted by exec-server transport loss; no final report or worker usage is available, and its
unverified work/history remains preserved. Attempt2 reached `error_max_turns` after101turns
(1027716ms, reported estimateUSD5.8575598, not a billing claim), then failed the focused task check.
No PR or native completion exists. Neither attempt contains `criterion-evidence-reported`.

The owner-authorized product corrections below do not invent that missing worker claim. Native
acceptance still needs a complete genuine worker evidence report. No-model recovery refuses without
it. One additional native attempt would require explicit owner authority; none has been granted or
launched while preparing this candidate. The existing retry-failed path can preserve this corrected
turn-ended a2 workspace/branch, including new descendant commits, while recording a bounded a3.
No Runner, profile, state, approval or attempt-limit change was made for these corrections.

## Shared implementation and corrections

- App Screen puts its AppHeader into the public ScrollRegion pinned head, preserving its own rule
  and headRule semantics. The same owner reaches all routed consumers.
- Absent footers include null/undefined/false. An actually overflowing no-action screen gets the
  public lower rule over its genuine safe-area inset, without inventing actions. Fitting content
  keeps its content-owned inset and no added edge.
- Overflow classification accounts for temporary reserved edge geometry, so borders cannot create
  or sustain the overflow they measure.
- FittedScrollRegion composes the pinned public region for capped workout/sheet content and swap.
  The public component owns scrolling, measurement, bar, streaks and settling; no new scroll timer,
  fake fade/blur, route offset or vendor copy was introduced. Both head and foot cues are present
  only for genuine overflow. Swaps retain their existing measured cap.
- The selectable ladder label now positions its own absolutely hidden native radio. This fixes a
  real focus bug: before correction, the outer page shifted sideways and only a sliver of the rail
  remained visible despite relative element containment. The fix is a containing block at the
  shared consumer, not an ancestor reset or assigned scroll offset.
- NEW B05 synthetic fixtures are local-only in existing target selection. Standing browser coverage
  is retained. The test also blocks and counts unknown/outbound writes/model requests rather than
  forwarding them.

## Verification performed before native acceptance

- Focused Screen/swap/contained-shell/workout-footer unit checks:4files,62tests passed.
- Existing ladder checks after the containing-block correction:39tests passed.
- Target-selection tests:18passed; external-target discovery yields0selected tests.
- Exact approved task command `npx playwright test e2e/ui-polish-b05-scroll-boundaries.spec.ts --project=mobile`:
  final12/12passed, exit0,9.0s. Owned-file ESLint and diff check passed.
- Existing shell regression command `npx playwright test e2e/ui-polish-b05-shell.spec.ts --project=mobile`:
  22/22passed, exit0,15.9s. Selectors follow the intentional pinned-head/edge composition while
  genuine title/control, viewport, action-inset, narrow/short and resume checks remain.
- Genuine source-bound format collector:4/4skin cases passed,8PNGs,20.2s,exit0, foreground78589.
  Captured clean source`60b4d84c8046d47cec56e0f17f91baf822e4de41`; runtime`a06c0026093939e83a543846268070ff1ede6457f487a04c0be757e20c60b371`;
  driver`5acfaa6039c0354248461a83102f877d12641392e0826e88926c3634a5874026`. All generation/write counters0. Existing v1 source-only
  provenance uses actual producer attempt2 and payload`edd9cf6392d6d3183eff7ee485d33a118e68df6b8739e367ef5ad0e2ccee5757`.
  Full project checks remain pending. No local result is a native criterion receipt.

## Actual reference and render correspondence

The reviewer opened the immutable Home/Settings images and the final renders. References:
- `sources/source-04-B05-01-home.jpg`: `e0a8762578b19714c7bb8d3385982186cac028227b28b290389115171b16e6f6`.
- `sources/source-11-B05-08-settings.jpg`: `b940f3f57130cff2f4ca4123473852d2d44e92723ed8a0d1a25280acce87f097`.

Selected regions: B05-01.2, content passing under the header rule; B05-08.2, lower content boundary
without footer actions. Final Home visibly clips flush at the header rule and lights the transient
streak there while scrolling. Settings shows the proper persistent2px lower divider without an
action. Nested swap and genuinely capped entry show actual top/bottom pixel brightening, visible
bar, hard clipping and settled invisibility. Natural swap fitting removes both added pinned edges.

Sheet390x480 and390x844 actually fit. At320x360, actual content292px exceeds scroller allowance226px
by66px; this is genuine viewport geometry, not injected height or forced offsets. Navigation remains
visible. Active/fitting cases were classified from real measurements, not assumed from viewport names.

Horizontal radio proof uses native keys with the target initially genuinely offscreen. Last rung
starts558–606 and is revealed236–291.59 inside rail38–292, pageclip0–320 and pageScrollLeft0. Native
wrap reveals the first radio from-284..-236 to38..86. The initial nominal-green PNG was rejected
because the whole rail was offscreen; strengthened actual page/viewport containment now passes,
and the final PNGs were visually inspected. Endpoint availability and fitting tab cues remain tested.

Final scroll evidence: execution-body `runner/reports/task-003-scroll-browser-evidence`, all19PNG
hashes match the recorded JSON. Shell regression evidence is preserved separately under
`runner/reports/task-003-shell-regression-evidence`, with a hash manifest. Captures identify source
`ec99341250b31bbd5bc0ab99fab71c8012c3d3dd` plus explicit dirty operator-corrected changes; no clean
commit or installed-device identity is falsely inferred.

| Final render | SHA-256 |
| --- | --- |
| Home scrolling | `70795c90495ce3af8c438e362cbe120308573c1592ec4dfba3ad317c7dc4bdbb` |
| Settings end | `8520006dfe718b839f419618cd59f67a017f8be9fb2fdbb08c4061308f2167d5` |
| Swap scrolling | `9a91c607cb60f5868f7e938f24f2b9a1a93bfc5c6d1f8d528735501b0a28545e` |
| Capped sheet scrolling | `e673c6800b83e5f91f22d46be98bd7664ed460f938df5d8de20b3d81aa0a787a` |
| Last radio revealed | `f8daf19c86b1261a3c25b44f60cb02ac0831912a2d74adaaf591cadb85e698bc` |
| First radio wrap | `cae324529f1f9be43502553e22aeecc3841940aa8085dd8594b9e2723edbe115` |

Task002 regression: phoneheader y67, main-bottom gap0, Workout short header y55/action gap8,
narrow header y40/action gap12, restored/resumed action gap34 with matching boxes. Settings no-action
overflow has scroller end808, public foot808–844, inset-owning edge810–844(height34), ordinary12px
content padding; last-content gap47.78px includes rule/gutter, not a second34px inset. The new lower
rule is visible, with no action added. Generate Vapour PNG remains byte-identical to Task002.

## Failures retained and corrections

The original native focused check had9cases,3passed/6failed: wrong pixel coordinates, a guessed1px
rule rather than the public2px rule, invalid ladder snapshot and subsequent swap/sheet/ladder timeouts.
The unchanged native logger retained its normal bounded output; no earlier failure became a pass.

Operator verification initially encountered macOS temporary-directory sandbox EPERM (no tests ran);
scoped host/temporary-directory checks then actually executed. Subsequent meaningful fixture fixes
included CSS-scale PNG sampling (device scale3 had sampled wrong coordinates), persisting the exact
lit PNG rather than recapturing after settling, schema-valid for_time/ladder_up input, explicit
validated reconstruction without any performed observations, real native autofocus settling,
frame-polling of transient feedback without changing its duration/threshold, no completion/save
navigation for a read-only ladder setup, and current positive-width boxes after UI expansion.
Unknown RPC/model/write attempts were blocked and corrected explicitly, never forwarded or ignored.
The nominal12/12 run with an offscreen rail was explicitly rejected; only the final strengthened
12/12 plus visually inspected images is the accepted local browser evidence.

## Next action and boundary

Freeze the reviewed source, genuinely recapture the existing four-skin/eight-PNG format proof and
source-only lineage on this source branch, then run every unchanged project check locally. Once
concrete, present the exact one-additional-attempt authority request for native completion. If
approved, normal retry-failed +1 then run-once can preserve this corrected workspace and obtain the
missing current-attempt worker report. The worker must review and report all six actual obligations;
no claim, receipt or SQLite event may be manually invented. All ordinary independent native checks,
required GitHub CI, exact-head build-branch merge and issue completion remain mandatory.

Physical installed-iPhone UAT stays outside the DAG. These are local Chromium results; no hosted
mutation, new migration, generator/distance change, paid canary, main merge or production deployment
was performed. Other approved polish tasks remain separate and are not claimed complete here.

## Full-check checkpoint before final source recapture

The first full unit run passed237files/5827tests,56.06s,exit0. Required build and general lint
exposed two corrections: the browser init script now explicitly uses window.history rather than
its fixture-array namesake, and the overflow hook derives watch&&overflowing rather than
synchronously resetting state in the no-watch effect branch. Measurement/ResizeObserver behavior
and cleanup are retained. Neither assertion nor lint rule was disabled. The first genuine Task003
format group remains immutable history at its original source; active proof moves to the fresh
task034-format-preview-batch05-task003-checked group before recapturing corrected source. Full
checks will be rerun on that source. All native attempt/criterion-report restrictions still apply.
