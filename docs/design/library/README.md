# CLEAR visual library

Use `/gallery` or `/gallery/app` for actual app components. Both use the same
register and styles as the development gallery. This branch is a source
proposal; deployment and visual approval are recorded separately.

The public navigation separates All components, History and Favorites, and
Movement across workout screens. The comparison views show existing app UI
in related contexts, not before-and-after design proposals. Initial review asks
whether those examples are accurate and useful; it is not approval of every
existing visual choice. Material proposed changes receive their own review.

## Find and reuse

- `/gallery/motion` (Motion and behavior) restores the pinned Motion Lab's nine
  effects with current components. `src/dev/gallery-motion-patterns.ts` records
  each meaning and current consumer examples; reference-only effects are labeled.
  Replay/temporary timings use the actual shared keyframes. Interaction rules,
  interruption, one-loop coordination and reduced motion are demonstrated too.
  Carry the trigger, state sequence and reduced-motion outcome through the
  ordinary visual preview and requirements handoff when motion is involved.
- The Motion view also compares the actual hard-edge ScrollRegion with an
  explicitly scoped 26 CSS pixel dissolve reference. Both use the same real component
  and content. The dissolve is a gallery-only proposal, pending visual choice
  and versioned foundation integration; it is not current Home behavior.

- Selected visual inputs awaiting scoped integration live in
  [the Phosphor Echo intake](intake/phosphor-echo/README.md): one shared effect,
  owner-selected preset, source/application rules and Augmented UI aesthetic
  reference. Preservation is separate from runtime adoption.

- Start with [the component index](COMPONENTS.md), generated from
  `src/dev/gallery-registry.tsx`. Read the linked implementation for its API.
- App presentation lives in `src/ui/`; screens/state owners live in `src/app/`
  and `src/state/`. Keep related visual parts shared and distinct behavior with
  its owner. Existing private parts are not automatically new public components.
- Follow [the active three-delivery plan](PLAN.md). The first consolidation and
  comparison targets related Review, History and Favorites presentations.
- Regenerate the index with `node scripts/gallery-index.mjs` after register
  changes; `--check` verifies that the generated file is current.

## Request a gap

Record four things in the issue/PR before requirements consume a new contract:

1. The user need, screen/state and existing options checked.
2. Why those options do not fit and the smallest proposed extension.
3. The owning source and affected consumers or intentional variants.
4. An actual-component preview and the relevant acceptance checks.

Design experiments use isolated branches. Show source-labeled current/proposed
examples, review material visual changes, then carry the approved component,
source/state and evidence links through requirements and integration. An
appearance-preserving refactor needs verification, not invented design approval.
Use the existing issue/PR for these references; no separate sidecar is required.

## Examples and limits

The current register has 52 entries and 138 initial examples. It covers 49 app
UI exports, contextual Input and two related-context comparison groups; important live/session owners still need safe
fixtures. Use actual implementations with deterministic data/controllers, no
live account writes and no shipped test harness. Add coverage in useful slices.
Do not copy a historical pattern merely because it has an example.

The 0.14.3 foundation remains an immutable import. App-owned styles/components
are editable; revisit foundation authoring when a real foundation edit is
wanted. Historical archive pages stay at `/dev/gallery/ds` in development.
Their FormField/OverflowRail accessibility findings remain reference findings;
public archive delivery is deferred.

[Released-batch UAT guide](REVIEW-GUIDE.md). Shared implementation changes should
update the relevant examples and check actual consumers using existing tests.
Merge and production release remain separate from visual approval.

## Shared metadata text

Use `clr-text-data-xs` from `src/styles/text-roles.css` for the existing compact
data metadata role. It composes font-data, label-xs-size, tracking-data,
text-card-label and zero margin. Add `clr-text-data-xs--upper` for an explicit
uppercase label or `clr-text-data-xs--quiet` for secondary equipment context.
Weight, line height and casing otherwise inherit; owners keep their layout.

| Consumer | Preserved distinction |
| --- | --- |
| Review and `ReviewExerciseRow` | Uppercase equipment label; quiet capitalized equipment; rest header color and ordinal layout |
| History rows | Recent status/date retains its smaller paragraph size and line height |
| Favorites rows | Outdated warning retains negative color and its explanatory text |
| Favorite progression | Larger values and comparison glyphs retain their own roles |
| Load suggestions | Low-confidence weight uses this role; units retain sentence case |
| Saved session detail | Table headings use the uppercase variant; results and status glyphs retain their own roles |

Do not use this recipe for larger prescriptions, titles, numeric readouts or
glyph/status rows that intentionally inherit color and margin differently.
This is one verified shared role, not a universal inline-style ban.

Compare real owners at `/gallery/app?component=WorkoutEntryComparison` and
`/gallery/app?component=MovementIdentityComparison`. The second includes the
actual Review row with an in-memory swap dialog, live movement presentation,
and saved detail with its real disclosure/table. It preserves existing visual
differences for review; it does not certify complete session logging fixtures.
