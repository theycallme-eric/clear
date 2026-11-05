# Gallery verification evidence

This is local gallery/reference verification, not production or backend acceptance.
No account client, live write, generation call, Runner execution or deployment
was used. The native revision-6 approval remains unchanged.

## Current checks

- `build.log`: TypeScript and production Vite build pass.
- `tests.log`: 158 focused tests in nine files pass, including criterion/state
  coverage, all 16 modal contexts, draft-preserving Finish/Undo, explicit failed
  save/retry with zero retained, warning boundaries and existing shared-owner
  regressions. No failures or skipped cases.
- `design-lint.log`: design-system adherence passes without warnings.
- `lint.log`: affected-source lint has zero errors; 137 existing-style Fast
  Refresh warnings remain in the established registry/constant-export pattern.
- Generated component index: 67 entries, verified by its existing check.

## Browser evidence

All browser interaction used the local in-app browser. Its viewport override
was reset after responsive checks. This is browser engineering evidence, not a
claim of physical-phone touch/keyboard testing or exhaustive route integration.

- `browser-logging-final.json`: final 64-case matrix, 16 logging contexts × four
  skins at 390×844. Native modal, opening focus on X, no structural outline,
  hidden scrollbar, no horizontal overflow and 2px (actual border) lower clip
  boundary all pass. No blank inset strip or secondary crossing frame.
- `browser-narrow.json`, `ladder-12-320-undo.png`, `ladder-12-320-lower.png`:
  320px 12-rung form, equal Undo/count left start, stationary frame and reachable
  lower Notes/Save. `browser-undo.json` records four-rung selected-prefix/draft
  preservation without resetting elapsed time. This is memory-only recovery.
- `browser-multiple-cycles.json`: 900 opacity samples spanning numeric values
  00:05 through 00:02. Timer/aura opacity difference is zero; observed range
  .200033–.799968 on the shared smooth 1.5s cycle.
- `browser-motion.json`: 400 supplemental samples, one deduplicated edge, edge
  inside the open native dialog; reduced motion yields no animation and static
  .5 on timer and aura.
- `browser-clock-boundaries.json`: pause and expiry remove all urgency; count-up
  cap at elapsed 00:55 / remaining 5 owns one edge; elapsed-only timer owns none.
- `browser-header-final.json`: title/timer/menu boxes share identical top/bottom
  and 40px height. `browser-overview-final.json`: both Summary frames have the
  same top, bottom, width and height, with no page horizontal overflow.
- `cards-signal-desktop-final.png` and `overview-signal-desktop-final.png` are
  final composition captures. Phone captures show the accepted form treatment.

`browser-logging.json`, `browser-pulse.json`, `browser-overview.json` and captures
without the `-final` suffix include earlier diagnostic passes. In particular,
the earlier desktop card/Overview captures preceded the header/width corrections;
the explicitly final counterparts supersede them. They are retained to avoid
losing the investigation record, not offered as competing target designs.
The long-form phone geometry was rechecked by the final matrix after shared
variable consolidation. A subsequent timer role-class opt-in preserves the
measured pulse settings while allowing the existing Echo observer to remeasure
its semantic low-color change; no effects preset was copied or changed.

## Limits to carry into application tasks

Source/fixture presence is not actual route adoption. No real save/read/History,
reload/reconnect, original-cap persistence, actual save/rest collapse or physical
mobile input journey was certified here. See every requirement's explicit limit
in the coverage map and Builder handoff.

## Local verification correction

The first reused R7 dependency path resolved through an archived preview to a
dataless iCloud file and stalled TypeScript/lint/Vite startup. Only this pass's
six stalled processes were stopped. The gallery then used the existing fully
local `gallery-implementation/node_modules`, whose package-lock hash exactly
matches this branch. No dependency installation or new preview framework was
needed. Localhost binding required the normal sandbox escalation. An early
registry check correctly rejected one-state additions; meaningful alternate
contexts were added, retaining the gate. Three stale R7 APIs were reconciled
against current main before checks passed.

The source whitespace check passes. A whole-package whitespace check reports
extra EOF blank lines in byte-preserved authority/audit inputs and captured
command logs; those originals are intentionally retained unchanged.
