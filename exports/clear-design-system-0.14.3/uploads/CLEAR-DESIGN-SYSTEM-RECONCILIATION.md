# CLEAR design-system reconciliation

Status: preliminary snapshot audit complete; current-system audit prepared  
Updated: 2026-09-17

## Purpose

Reconcile CLEAR as a cross-product design system without allowing Project Control, the workout
application, or any other single product to define the system alone. Reduce contradictory guidance,
duplicated specimens and obsolete compatibility surface before extending the public API.

This document is evidence and sequencing. It does not authorize a CLEAR change.

## When reconciliation happens

Run the read-only CLEAR audit immediately after the targeted Project Control v3 correction is
exported. Do it before Project Control enters Requirements Builder so any approved system changes
can become implementation inputs rather than later retrofit work.

The sequence is:

1. finish and independently verify the bounded Project Control v3 route/PNQ correction;
2. revise and verify Project Settings so its final model/profile behavior becomes audit evidence;
3. run the read-only CLEAR audit against the current CLEAR Design System working iteration;
4. reconcile the audit report into `CLEAR-DESIGN-SYSTEM-REQUESTS.md`;
5. prepare one bounded CLEAR extension prompt containing only approved reusable changes;
6. verify the changed system against at least the workout application and Project Control;
7. export the updated CLEAR system and then begin Project Control Requirements Builder preflight.

The audit and extension are separate turns. The audit must not edit the system.

## Freshness and authority gate

The current CLEAR Design System working iteration in Claude Design is authoritative. Before an
extension pass, obtain its audit report and a current export or equivalent file inventory. Do not
apply changes to the snapshot below if the working iteration has moved.

The preliminary audit used the dependency snapshot embedded in `Scope of pass zero(1).zip`:

- dependency: `clear-design-system-4ee04496-5d5c-4d1c-ad7f-8d6d0bc746db`;
- bundle date: 2026-09-17;
- 389 manifest tokens;
- 97 public manifest exports, including 75 icons, UI components, `VERSION`, and `SKINS`;
- 38 specimen cards, 3 templates, 7 theme selectors, and 0 starting points;
- CSS layers: foundation, motion, CLEAR skin, alternate skins, and one importing entry point.

This snapshot is sufficient to prepare the audit but not to overwrite a newer working system.

## Preliminary consequential findings

### Cross-product boundary

The architecture is largely cross-product, but the documentation still defines CLEAR primarily as
a workout application. Workout-specific content voice, coaching examples, narrow cockpit layout,
and prohibitions such as no social or sharing behavior are presented as universal system rules.
Those are product policies or product profiles, not safe global constraints for Project Control or
future CLEAR consumers.

The audit should separate:

- universal visual grammar, roles, accessibility, motion, and component contracts;
- optional product or density patterns;
- workout-application content and workflow policy; and
- Project Control evidence that may or may not generalize.

Do not neutralize CLEAR's visual character while making its scope product-neutral.

### Document and source contradictions

The snapshot contains concrete inconsistencies that require current-source confirmation:

1. The README index names removed Magnesium and Sodium skins, while the later family definition and
   source contain Clear, Vapour, Signal, and Mono.
2. Several passages call a skin six hexes; the implemented contract is five semantic hues plus base
   and ink—seven color declarations—plus font families where applicable.
3. One color section says urgency is not danger and is almost exclusively timer-low; another says
   urgency covers time pressure and failure. Foundation source agrees with the broader definition.
4. Foundation is described as hue-agnostic and as knowing no product, but its root fallback slots
   contain CLEAR's concrete role hues before the CLEAR skin repeats them.
5. The documentation says consumers load only `styles.css`. The Project Control artifact loads all
   four layer files and `styles.css`, which imports those layers again. Confirm whether adherence
   guidance should prevent duplicate loading.
6. Motion documentation says components consume semantic duration tokens and that atmospheric
   drift is the only eased exception. The snapshot still contains raw `2s`, `300ms`, and `700ms`
   timings, uses raw 14–22 second atmosphere durations, and eases logo motion. In particular,
   `--dur-scan` exists while the scan class uses a literal `2s`.
7. The README calls the exported dependency self-contained and references `skin.js`, component
   source, patterns, package metadata, and other files that are not included in the dependency
   snapshot. Confirm whether that is expected export packaging or documentation drift.

These findings do not prescribe the correction. Claude Design should verify the current source and
choose the smallest coherent documentation, token, or implementation repair.

### Redundancy and optimization candidates

- Dedicated component specimens coexist with older combined cards such as `Components — Slider &
  Mood` and `Components — Tabs & Streak Bar`. Confirm whether the combined cards still teach a
  distinct pattern or duplicate the canonical component cards.
- Legacy hue and font aliases are intentionally retained, but the snapshot does not establish an
  explicit retirement or compatibility policy. Inventory real consumers before deleting aliases.
- Templates exist while manifest starting points are empty. Confirm whether those concepts are
  intentionally different or whether the discovery surface is incomplete.
- `IconButton` and `TabPanel` are public exports but do not have named standalone specimens. Confirm
  whether their parent component specimens cover their contract sufficiently.
- The foundation exposes an intentional `--ground` fallback hook without defining it. Verify that
  the extension point is documented rather than treating it as an undefined-token defect.

Optimization means fewer competing truths and a smaller justified public surface. It does not mean
removing compatibility aliases or specimens without consumer evidence.

## Project Control evidence to reconcile

Use `CLEAR-DESIGN-SYSTEM-REQUESTS.md` as the living register:

- DS-001 responsive peer destinations: confirmed foundational gap;
- DS-007 constrained Input shrink behavior: confirmed foundational gap;
- DS-008 contained scrolling beside pinned regions: strengthened candidate;
- DS-009 non-destructive text action hierarchy: candidate that must first be compared with the
  existing quiet Button behavior;
- DS-002 and DS-003 remain broader candidates awaiting cross-product evidence.

Neutral portfolio containers and localized semantic condition cues use existing CLEAR roles; they
are usage guidance, not automatically a new component. Project Control motion also reuses existing
duration and step tokens with reduced-motion fallbacks. Its Assist choreography is evidence, not an
automatic motion-system extension.

## Audit exit criteria

The audit is complete when it reports:

- current working-system identity and whether it differs from the snapshot;
- consequential contradictions and redundancies with exact affected locations;
- documentation-only corrections separated from component/token/runtime changes;
- each registered request as confirmed, candidate, resolved by an existing capability, or rejected;
- compatibility and migration consequences for any removal or rename;
- a minimal recommended extension sequence; and
- confirmation that the audit made no design-system changes.

Only then should the bounded extension prompt be finalized.
