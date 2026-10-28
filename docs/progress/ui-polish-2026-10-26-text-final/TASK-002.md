# TASK-002 — Installed-PWA atmosphere behind the status icons, content safe

Issue #522 · REQ-002 · role: completion-owner for JOURNEY-002.
This is the task's own progress record. It replaces the shared daily journal for this task.

## Outcome intended

In the installed iOS PWA, the CLEAR atmosphere (gradient blobs, dim overlay and scanlines) should
draw behind the system status icons. It must not be replaced by a solid `theme-color` bar. All
content and controls must stay inside the safe areas. Automated checks cover markup/CSS boundaries plus local simulated mobile layout; they do not
establish installed-device behavior. **Installed-iPhone status-area, keyboard, launch/resume and safe-area
behaviour is not proven on a device.** It is deferred to owner UAT outside the DAG
(POST-LAUNCH-MANUAL-UAT.md).

## Baseline, as found (HEAD `c082f3b`, contains `7f0a367`)

- `index.html` had `width=device-width, initial-scale=1.0` with no `viewport-fit`. That means
  edge-to-edge layout was not requested. Actual installed-device behavior was not observed.
- `apple-mobile-web-app-status-bar-style` was already `black-translucent`.
- `AtmosphereLayer` (`src/ui/atmosphere.tsx`) already renders the package's
  `.clr-atmosphere.clr-atmosphere--fixed`, with no safe-area offset. The later vendor base rule
  overrides the fixed modifier with `position: absolute`; the class alone was not computed proof.
- `src/styles/shell.css` already pads the contained shell content by
  `max(token, env(safe-area-inset-*))` on all four sides. The shell is `100dvh`, and
  `html, body, #root` use `overflow: hidden`.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` passed. PRE-002: the design system
  declares 0.14.3, and `git diff 7f0a367 HEAD -- src/design-system` is empty.
- `gh issue view` was not used, so the approved task body was the contract.

## Initial worker candidate (retained at `7487f82`)

- `index.html`: added `viewport-fit=cover` to the viewport meta, kept on one line so the existing
  `document-shell` and `pwa-manifest` matchers still apply. The zoom policy is unchanged.
  `theme-color` stays the skin `--base` as the fallback ground.
- New `src/test/pwa-viewport.test.tsx`, 10 cases:
  - AC-008: `viewport-fit=cover` is present. The viewport is still device-width and zoomable.
    The status bar style is `black-translucent`.
  - AC-007: the rendered layer has 3 blobs, an overlay and scanlines, and is fixed. The package
    rules pin it with `position: fixed; inset: 0`, and the scanlines are a repeating gradient.
    The app never offsets the atmosphere by a safe-area inset or gives it or the document a flat
    background. `theme-color` equals the skin base.
  - AC-075: the shell content pads all four `env(safe-area-inset-*)`. The header is in normal
    flow inside that padding. The shell follows `100dvh`, and the document is never a second
    scroll owner.
- The worker initially inferred fixed coverage from the modifier declaration. Controller review
  found that inference insufficient; the correction and actual browser proof are recorded below.
- Nothing changed in GitHub or any external service.

## Failures and corrections

- The first focused run had 2 expected failures before the markup change, plus one test bug. The
  CSS rule helper matched the indented `@media print { .clr-atmosphere { display: none } }`. The
  helper now matches top-level rules only.

## Worker verification

| Command | Result |
| --- | --- |
| `npm test -- pwa-viewport` | pass, 1 file / 10 tests |
| `npm test` | **fail**: 2 of 5765, both in `src/test/design-0143-final-audit.test.ts` (blocker below); 232 of 233 files pass |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only); `dist/index.html` carries `viewport-fit=cover` |
| `npm run lint` | pass, 0 errors (143 warnings, unchanged) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

## Verification stop: runtime-source-bound audit evidence

This is the same blocker as TASK-006/007/009/011–016. `index.html` is an input to the runtime
source hash, so changing it fails two checks:

- *proof labels › bound to the package and runtime source of this tree*
- *TASK-034 AFTER evidence (eight-cell mobile group)*

Fixing them means committing the tree and re-capturing the format-preview evidence against a
disposable authenticated backend. This worker cannot do that. No record, hash or audit text was
edited, because that would fabricate evidence.

## Not proven / next safe action

- Not device-verified: the installed iPhone status area, keyboard, scroll, launch/resume and
  notch/home-indicator behaviour. jsdom resolves no `env()`, and emulated status icons are not
  proof. Owner UAT, outside the DAG.
- Next: the controller reads issue #522's comments, commits the tree, re-captures the
  source-bound evidence, then runs native verification.

## Controller verification recovery — in progress

Native61261 collected terminal exit1: worker succeeded, focused criterion/task checks each passed
10 cases; full suite stopped only on two source-bound audit checks. The complete initial candidate
is retained at7487f82. Root read live issue522/comments0; attempt1/max2 and all limits are unchanged.

The fixed-atmosphere CSS-string assertion was a false-positive: a later vendor base rule wins.
The app-owned atmosphere stylesheet now explicitly restores its viewport attachment to
position:fixed after the vendor CSS; public gradients, scanlines, sizing and motion are unchanged
and vendor files remain byte-identical. The unit test checks that declaration/load order without
an inline override, and labels its shell/viewport assertions as declaration-only. Markup comments and baseline notes no longer promise an observed
iPhone outcome. Actual local browser bounds, safe-area env simulation, scroll and viewport-resize
checks are being added, including relevant controls outside the shell. No device success is claimed.

Root will commit clean source before browser execution/capture, preserve any real failures, collect
genuine current-source format evidence, and use native same-attempt full verification/protected
build-only delivery. No extra model/native attempt, Runner repair or hosted mutation is involved.

The additive browser driver is ready: four Home sizes with actual CDP CSS env inset overrides,
actual atmosphere/scanline and control bounds, real touch scrolling, focused Reason selection
through resize/cancel, and zero-inset fallback. Separate cases cover a real Generate Notes draft
through viewport resizing without generation and the shared swap toast/dismiss outside the shell.
All API calls are intercepted; no service-role key or real-account write is used. Browser outcomes
are pending. Focused controller66292 passed54 cases/two files plus design lint. Owned backend
start63633/reset58988/status collected exit0 with matching29migrations; status values remain private.

First actual browser5728 (clean source97e1b8d) passed five cases: all four Home sizes and focused
Generate draft resize. The shared-toast case failed: its frame began at x16 while the simulated
left safe inset was28. Original log/trace/screenshot are preserved externally. ToastHost sits outside
the padded shell, so its existing ordinary spacing did not honor that inset. Its app-owned fixed
placement now uses max(token, env safe-area) at both sides and bottom, retaining auto centering and
the existing440px maximum. It still reserves no footer space and keeps the same queue, animation,
dismissal and focus semantics; no vendor change is involved. Existing placement assertions were
updated while preserving the no-footer-measurement contract. The original actual geometry assertion
remains unchanged. Corrected browser verification follows; no success is assumed.

The first correction's75 focused cases passed, while design lint rejected literal0px env fallbacks.
Those fallbacks now use the shipped --spacing-0 token. Independent review also found that an inline
fixed attachment would defeat the gallery's existing bounded-specimen override. The attachment
therefore lives in the already-post-vendor app-owned atmosphere stylesheet, preserving the more
specific gallery rule and unchanged package bytes. Unit declarations check this precedence without
claiming computed geometry; the six browser cases retain actual fixed-position/bounds assertions.
These corrections remain local until fresh verification; no gate or assertion was weakened.

Final controller-focused3233 passed75 cases/three files and design lint. Independent final source
review found no remaining concrete blocker. The six browser assertions are unchanged; corrected
execution and genuine same-source format capture remain pending.

## Observed controller proof

Corrected browser43458 on3b0fdbd passed four Home cases and the corrected shared-toast case.
Generate failed before interaction, during initial Home/Axe scan, with destroyed execution context.
The retained trace shows two same-frame Home document GETs about0.57s apart; its cause remains
unknown. Original log/trace/screenshot are preserved externally. One bounded confirmation62447 on
UNCHANGED source `3b0fdbd5ac8f69766ac334a21d14f7f23b9c2b68` passed all six cases (17.8s), with no app,
assertion or harness workaround. The existing API interception prevented forwarded writes/model calls.

Same clean source capture57906 passed four skin cases/eight PNGs (24.6s). Runtime
`47667b8d5b41dcccc923d91983da9415ef6c33ffc16f93e45196be379c75c7b6`, driver
`9248941bff595baf34804ba725ec31412064e21f7f2625dc9273e1ad6109089b`, actual payload
`b892cf24c424b2880f02d6bd3e7ee4cd6437784862746bab32bfff895810e823`. Actual run/a1/base input provenance is retained;
prior groups are unchanged. The first record truthfully reports a clean checkout; later dirty
records reflect collector-created evidence. Owned backend start63633/reset58988/status/stop23471
all collected exit0; separate clear-app and hosted schemas are untouched. Existing evidence consumer
and native exact-head verification follow. Publication/merge are not yet claimed; installed-iPhone
status/keyboard/launch/resume/scroll outcomes remain unproven outside-DAG post-launch UAT.

Existing source/record/PNG consumer33054 passed all38 cases. Diff checks passed; vendored design
system, workflows, migrations and prior tracked evidence groups are unchanged. Native same-attempt
full verification is next.
