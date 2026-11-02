# CLEAR visual library

**Round 4 intake closed, 2 November 2026:** The [single refinement list](WORKOUT-REVIEW-FEEDBACK-2026-10-31.md) retains 24 consolidated items covering 88 source comments. Inline logging and the roomier counter with framed actions are selected; reuse the existing effort faces, remove EMOM minutes entry, and pair Complete/Incomplete in one row. The next visual refinement concerns log-heading hierarchy and wrapping ladder tiles that distinguish round numbers from reps. Ordered ladder progress remains an explicit working assumption to demonstrate, not a newly confirmed selection model. Preserve the pinned reviewed preview and focused-log fallback; the closure in the refinement list governs older intake holds. Broader logging/copy/empty-state work remains retained separately.

Owner clarification, 30 October 2026: this repository and executable gallery are
the design-library source of truth going forward. Claude Design is maintained
for older files. Use [the maintenance prompt](CLAUDE-DESIGN-MAINTENANCE-PROMPT.md)
to send changes back there; do not wait for its export to author approved shared
app components/styles here. The historical 0.14.3 import remains intact.

Use `/gallery` or `/gallery/app` for actual app components. Both use the same
register and styles as the development gallery. The production library is at
https://clear-peach.vercel.app/gallery. Isolated branches remain proposals;
deployment and visual approval are recorded separately in their PRs.

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
  scoped dissolve preview (22.1 CSS pixels after the owner's 15% reduction).
  Both use the same real component
  and content. Eric approved the 22.1px dissolve with the existing visible glow;
  shared app integration remains separate in #600. A gallery-only adapter
  preserves the token's milliseconds when compiled CSS uses seconds (#600).
  Hold glow for inspection shows the existing shared CSS state continuously.
  This preview correction is not a production Home fix.

- Selected visual inputs awaiting scoped integration live in
  [the Phosphor Echo intake](intake/phosphor-echo/README.md): one shared effect,
  owner-selected preset, source/application rules and Augmented UI aesthetic
  reference. Preservation is separate from runtime adoption.

- Start with [the component index](COMPONENTS.md), generated from
  `src/dev/gallery-registry.tsx`. Read the linked implementation for its API.
- App presentation lives in `src/ui/`; screens/state owners live in `src/app/`
  and `src/state/`. Keep related visual parts shared and distinct behavior with
  its owner. Existing private parts are not automatically new public components.
- Track workout refinements in [the running workout refinement list](WORKOUT-REVIEW-FEEDBACK-2026-10-31.md), including accepted, previewed, superseded and open decisions. This is the handoff list for requirements; do not rebuild an older superseded visual.
- Follow [the active three-delivery plan](PLAN.md). The first consolidation and
  comparison targets related Review, History and Favorites presentations.
- Regenerate the index with `node scripts/gallery-index.mjs` after register
  changes; `--check` verifies that the generated file is current.

## Motion on new or changed components

Inherit motion from the shared component first (for example, AppDialog owns
dialog entrance/exit). Use the meanings in `gallery-motion-patterns.ts`, the
shipped timings/keyframes and `src/ui/motion.ts` helpers for app composition.
Availability in the lab does not by itself approve a new use.

In the ordinary issue/PR and requirements, name the canonical component and
motion pattern, its trigger/state change and reduced-motion end state. Show
the relevant interaction in the real-component gallery example and check the
affected consumer. Intentional stillness is valid. If a new moment does not
fit, use the same gap request below before inventing an effect or timing.
Existing adherence/reduced-motion checks cover mechanical rules; review still
checks that the chosen motion communicates the intended state.

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

The generated component index records the registered parts and examples, including
contextual Input and related-context comparison groups. Important live/session
owners still need safe fixtures. Use actual implementations with deterministic data/controllers, no
live account writes and no shipped test harness. Add coverage in useful slices.
Do not copy a historical pattern merely because it has an example.

The 0.14.3 foundation remains an immutable import. Approved additions belong in
the repository's shared app-owned styles/components and real gallery examples.
Claude maintenance is downstream of that work. Replacing the imported dependency
would still require an explicit versioned migration. Historical archive pages
stay at `/dev/gallery/ds` in development.
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

## Shared movement presentation (B05-04, revised owner review)

`src/ui/movement-presentation.tsx` owns `MovementIdentity` and `MovementList`.
Use the same name → prescription → quiet equipment hierarchy, with the action
or counter in its own trailing slot. Names wrap in their own column. Lists
separate peers horizontally; the card supplies the outer frame/accent. Keep
round/rest context at group level, with no internal rail or final-item rule.
ReviewExerciseRow, BlockPanel.Movement and saved-detail rows consume this owner.
Compare the actual owners at `?component=MovementIdentityComparison`; the
MovementIdentity entry also covers a long name and the actual Review Swap.

Compound BlockPanel hosts place one GroupExerciseCoaching at the bottom.
The existing per-movement guidance and notes writers keep their data, draft,
save/error and lazy-read behavior; standard movements keep their own disclosure.
A safe standalone gallery fixture for these live coaching clients remains a
coverage gap; real compound owners are exercised in the workout comparison.

SummaryFacts wraps complete readings across rows. New UI should reuse that
composition rather than create an overflow carousel or drop accepted facts.
The broader preparation/report presentation interfaces remain labeled proposals.

R3 uses MovementGroupHeader plus the shared movement-group rhythm for static Review and live headers. MovementIdentity owns the prescription/load/equipment hierarchy. EquipmentSummary is the candidate read-only equipment pattern. Compact live navigation retains the existing section-jump state and focus path. The generated index and actual gallery examples expose these owners.

General Review/Workout alignment includes all structure families. R38 records the actual per-format reuse gaps and corrected matched examples. An existing shared frame or a passing render does not certify that every private renderer consumes the shared movement/load/equipment roles. Preserve distinct minute, window/score, race/cap and rung behavior while reconciling presentation.


## Timed-work proposal gap (Round 4)

- Need: one end log and consistent clock/action presentation across timed formats.
- Existing parts: TimerFrame, public Button/ChoiceGroup/Input/Checkbox, existing effort vocabulary, BlockPanel/MovementIdentity and format/rung derivations.
- Small addition: shared QuantitySelector/TimedResultLog, active-time pause arithmetic and an isolated timed-flow composition. Registered safe examples use those same owners; no new foundation or persistence schema is implied.
- Consumers: the four timed families in the workout comparison; scheduled-start ladders retain their existing schedule owner. The [single list](WORKOUT-REVIEW-FEEDBACK-2026-10-31.md) records settled intent, alternatives and production-contract follow-through.
