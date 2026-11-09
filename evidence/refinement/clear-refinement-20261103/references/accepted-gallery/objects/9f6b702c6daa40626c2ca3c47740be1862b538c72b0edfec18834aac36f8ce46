# Reuse the accepted refinements

Eric's November 4 instruction authorizes the direct gallery update while the
application build stays paused. The gallery records the accepted target; a state
shown here does not certify that Workout, History or the database has adopted it.

## Tokens, components and behavior have different owners

Do not turn every decision into a new primitive token. Foundation 0.14.3 already
owns type, skin roles, spacing steps, control sizes, frame strokes and chamfers.
Those bytes remain unchanged. The app-owned recipes below compose those tokens.

| Accepted decision | Canonical reusable owner | Variables / contract |
| --- | --- | --- |
| Movement hierarchy, compact equipment, peer grouping | `src/ui/refinements/movement.tsx` | Existing heading, label, text, spacing and rule tokens; ordinal/equipment/action slots remain separate. C01–C11. |
| Simple results, label/control rhythm, separate movement groups and completion count | `src/ui/refinements/timed-result-log.tsx`, `presentation.css`, existing `SetEffortChoice` | `--logging-section-gap`, `--logging-label-gap`, `--logging-movement-gap`, `--logging-count-gap`; existing categorical effort faces. C27–C30, C37, C40, C42, C47. |
| Balanced focused dialog, top-aligned X, one stationary frame and inner scroll | `src/ui/refinements/logging-overlay.tsx` | `--logging-dialog-width`, `--logging-viewport-gap`, `--logging-inline-padding`, `--logging-backdrop-*`; native modal focus/inertness, hidden scrollbar, safe-area-aware height. C41–C45, C57–C59 / P01–P03. |
| Rep-first wrapping ladder prescription and ordered progress | `src/ui/refinements/ladder.tsx` | Existing frame/control/spacing/label/heading tokens; actual target sequences and companion movement values are data, not theme variables. C33–C36. |
| Quiet Undo placement/alignment | `TimedResultLog.completionAction`, `.clr-timed-undo` | Zero horizontal button inset, existing quiet button height, same content column and rhythm as completion count. C38–C39, C60 / P04. Restoration controller remains with its consumer. |
| Whole timer body and meaningful soft deadline warning | `src/ui/refinements/deadline-timer.tsx`, `countdown-warning.ts` | `--countdown-warning-edge-softness`, `--countdown-warning-period`, `--countdown-warning-easing`, `--countdown-warning-opacity-*`; existing timer and urgency skin roles. C19–C26, C61 / P05. |
| Existing Echo / CRT Glass appearance | Existing `phosphor-echo-preset.ts`, `crt-field/config.ts`, effects policy/root host | Presets remain single-owned and unchanged. Do not restate their numbers in gallery styles. The logging frame uses the same Echo kernel; nested content remains excluded. |
| Review versus Workout actions, preparation and format-card composition | `src/ui/refinements/workout-card.tsx` | Existing shared Button/Card/CollapsibleSection owners and existing tokens. `src/dev` supplies synthetic data/controllers; application owners must supply actual behavior. |
| Overview/Summary and Generate/Setup/History compositions | Named examples in `src/dev/gallery-refinement-scenes.tsx` | Composition reference over real shared primitives. This is not route adoption. Preserve native data/flow contracts during later integration. |
| Numeric targets, actuals, dates, rounds, cap time, equipment IDs | State/data owners and controlled props | These are domain values. Do not make them decorative tokens or silently replace blank with zero. |
| Persistence, History, reload, authoritative cap recovery, copy/content definitions | Native revision 6 tasks | Gallery fixtures do not implement or close these obligations. Full criteria and explicit limits remain in the coverage manifest. |

The new semantic variables live once in
[`src/ui/refinements/tokens.css`](../../../../src/ui/refinements/tokens.css).
The timer/aura share the same keyframe and document-timeline epoch, independent
of numeric second changes. The exact accepted values are 70 CSS px, 1.5 seconds,
ease-in-out, opacity .2 → .8 → .2, static .5 under reduced motion. Eligibility
is separately named behavior: low color at 10 seconds; pulse while running with
0 < remaining <= 5; count-up caps pass cap minus elapsed; elapsed-only clocks
never claim an edge cue. One active edge is deduplicated across owners.

See [logging field ownership](LOGGING-FIELDS.md) for the per-context field contracts. Shared styles add no new fields, reasons or data writes.

## Stable entry points

- `/gallery/refinements?state=cards` — movement/card hierarchy and context slots.
- `?state=ladder-4`, `?state=ladder-12` — compact prescription, live check-off,
  Finish handoff and quiet Undo. Memory-only interaction controllers.
- `?state=ladder-long` — final long dialog viewport/focus/scrollbar contract.
- `?state=urgency` — actual countdown, count-up cap, portal placement and
  reduced-motion demonstration using the shared cue owner.
- All 16 contexts have stable named query values in
  `src/dev/gallery-refinement-data.ts`. The gallery Skin control provides all
  four skins without changing the reviewer's saved preference.

## Requirement handoff

`src/dev/gallery-refinement-coverage.json` preserves all 40 revision-6 requirements
and all 162 exact criteria, qualified by body/revision, with resolvable gallery
state IDs or explicit non-gallery dispositions. The `authority/` folder preserves
the 145-note register, latest current authority, exact P01–P05, visual contracts,
equipment wanted list and visual asset handoff. `references/` preserves the
15 captures and five diagrams; their feature-specific authority still applies.
The complete independent audit and frozen input are retained beside this file.

When reconciling Builder/DAG, pin this gallery's delivered commit and state ID,
name the shared owner and criterion, and distinguish reference verification from
actual-route adoption. Reuse these owners or deliberately consolidate them with
an existing owner; do not create a separate look-alike inside a route. Do not
silently edit approved revision 6 or mark its implementation tasks complete merely
because a gallery interaction works.

Open definition work (progress-report placement, guide content/durations, load
read model/ranges, broad copy and missing-coaching rules) is preserved explicitly.
No approved answers were invented to fill those gaps.
