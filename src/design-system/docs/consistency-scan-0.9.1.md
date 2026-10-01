# Consistency scan: 0.9.1

**Status: resolved in 0.9.2–0.9.6.** Every item below was fixed, decided by comparison, or recorded as product policy (A8, flagged to the workout app owner). Kept as a record.

Scanned: every token in the CSS layers, every component source, every preview card, the README. Visual questions go to the user as comparisons; everything else is listed by kind.

## A · Contradictions (rule vs rule, or rule vs code)

| # | Where | What disagrees | Kind |
|---|---|---|---|
| A1 | README *Borders, corners, shadows* | Says there are two frame implementations and `ChamferedFrame` is an SVG with "a perfectly uniform border". Since 0.9.1 it's a wrapper over `.clr-chamfer`. | Mechanical: rewrite |
| A2 | README *Borders* | "hover → lighter shade of the interaction role" on the border. Decided: hover steps the surface only. | Mechanical |
| A3 | README *Borders* | "Shadows are for emissive glow… use box-shadow / text-shadow with role-coloured transparency." Decided: only the primary action glows (6px), plus the 2px bleed and scroll motion. | Mechanical |
| A4 | README *Design principles* | "timer-low flips the atmosphere… glow intensifies". Glow can't intensify under the glow rule. | **Visual: comparison** |
| A5 | README *Design principles* | "always powered on (micro-pulse)" vs "one interface loop in view". | **Visual: comparison** |
| A6 | `TimerDisplay`, `ScanLoader` | Both run `pulse-micro`. ScanLoader also scans and now shows a cursor, so three loops in one frame. | **Visual: comparison** (with A5) |
| A7 | README *Spacing* | "No hardcoded pixel values" vs 40px control height, 16px icons, 2px bleed, 6px glow written as px in components. | Mechanical: tokenise or state the exceptions |
| A8 | Workout profile *Cards* | Card composition is LeftColumn + accent bar. Decided: cards mark their title with the title alone, no accent column. | Product policy: flag to owner, don't change |
| A9 | `ScrollRegion.jsx` | `16ms` and `200ms` literals in the retry backoff. | Mechanical: name them |
| A10 | Chip | Carries a tick as its non-colour cue; checkbox dropped its tick for a block. | **Visual: comparison** |

## B · Redundant

| # | What | Proposal |
|---|---|---|
| B1 | `--text-color: #FFFFFF` hard-coded, used nowhere | Remove |
| B2 | `--surface-tab-rail` and `--border-tab-rail` both = structure-a300; only one is used | Remove the surface one |
| B3 | Deprecated but defined: `--tracking-data-wide`, `--surface-overlay`, `.clr-load-ticks` (still used 3× in preview pages) | Keep one release, then remove; migrate the 3 preview uses now |
| B4 | ~80 ramp steps and type sizes never referenced (e.g. `--urgency-100/300/400/600/900`, `--label-xl-*`, `--paragraph-xl-*`, `--spacing-1000…1400`) | Keep: a ramp is complete by design. Note as intentional. |
| B5 | `--chamfer-sm/lg/xl` defined but size classes hard-code 8/24/32px | Make the classes read the tokens |
| B6 | Modifier names `--cta`, `--selected`, `--timer`… flagged as unused tokens | False positive (class names). No action. |

## C · Unruled (exists, but nothing says when to use it)

| # | What |
|---|---|
| C1 | `.clr-chamfer--open-left` / `--bottom-only`: when should a frame drop an edge? |
| C2 | `--chamfer-xl` (32px): the calibrated steps are 8/12/24. Is xl used? |
| C3 | Five frame-role surface rungs (quiet / default / strong) per role: only some are used. Which rung when? |
| C4 | Atmosphere modes (Full / Quiet / Operational): no rule for which screen gets which, now that Full is 40%. |
| C5 | Interlace on chip click: a one-shot effect on every toggle. Is that "state changed" or decoration? |
| C6 | 19 preview cards still use non-system controls (raw sliders, pill buttons, white rgba text, left accent bars). |

## Proposed order
1. Mechanical: A1–A3, A7, A9, B1, B2, B5, B3 migration. No decisions.
2. Comparisons, one page: A4/A5/A6 together (pulse and alive-at-rest), A10 (chip mark), C1, C5.
3. Ask in words, no visual: C2, C3, C4 (these are usage rules, but I'll show C4 if the answer isn't obvious).
4. Preview-card sweep (C6), one pass.
5. Flag A8 to the workout app owner.
