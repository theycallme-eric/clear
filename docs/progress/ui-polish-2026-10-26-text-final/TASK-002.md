# TASK-002 — Installed-PWA atmosphere behind the status icons, content safe

Issue #522 · REQ-002 · role: completion-owner for JOURNEY-002.
This is the task's own progress record. It replaces the shared daily journal for this task.

## Outcome intended

In the installed iOS PWA, the CLEAR atmosphere (gradient blobs, dim overlay and scanlines) should
draw behind the system status icons. It must not be replaced by a solid `theme-color` bar. All
content and controls must stay inside the safe areas. Only the markup and safe-area CSS boundary
is checked automatically. **Installed-iPhone status-area, keyboard, launch/resume and safe-area
behaviour is not proven on a device.** It is deferred to owner UAT outside the DAG
(POST-LAUNCH-MANUAL-UAT.md).

## Baseline, as found (HEAD `c082f3b`, contains `7f0a367`)

- `index.html` had `width=device-width, initial-scale=1.0` with no `viewport-fit`. That means
  iOS letterboxes the page below the status bar, even with `black-translucent` set.
- `apple-mobile-web-app-status-bar-style` was already `black-translucent`.
- `AtmosphereLayer` (`src/ui/atmosphere.tsx`) already renders the package's
  `.clr-atmosphere.clr-atmosphere--fixed` at `position: fixed; inset: 0`, with no safe-area
  offset.
- `src/styles/shell.css` already pads the contained shell content by
  `max(token, env(safe-area-inset-*))` on all four sides. The shell is `100dvh`, and
  `html, body, #root` use `overflow: hidden`.
- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` passed. PRE-002: the design system
  declares 0.14.3, and `git diff 7f0a367 HEAD -- src/design-system` is empty.
- `gh issue view` was not used, so the approved task body was the contract.

## What changed (local, unpublished)

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
- No CSS change was needed: the safe-area padding and the full-bleed fixed atmosphere were
  already correct and only waited on `viewport-fit=cover`.
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
