# CLEAR design-system request register

Status: current  
Updated: 2026-09-17

This is a cross-product capability backlog for the CLEAR design system. CLEAR may support Project
Control, the workout application, and other products. Project Control is one evidence source; it
does not own the system, its language, or its component APIs.

The register separates a demonstrated reusable need from a product-local suggestion, workaround,
or approved system change. Product work may supply evidence, but the register is maintained outside
the product-design prompt. No entry authorizes a design-system change until the owner approves a
dedicated design-system refinement pass.

## Scope and naming rules

- Name capabilities for their general interaction, anatomy, accessibility, or semantic purpose—not
  for the product that first exposed the need.
- Keep product concepts and product-specific compositions in the product unless evidence shows that
  the capability should generalize.
- A single product may confirm a foundational responsiveness or accessibility gap. Other extensions
  should normally be compared against more than one product context before becoming system API.
- Evidence may identify a missing capability without prescribing its visual treatment or component
  form.
- Record the product and pass that supplied the evidence so the system request stays traceable
  without inheriting that product's vocabulary.
- Tokens, components, variants, and modes remain governed by the CLEAR design system and require
  explicit owner approval before they are added or changed.

## How the register is used

During ordinary product passes, Claude Design should use the supplied design system and report only
new demonstrated gaps, local workarounds, or actual system changes in product-neutral language. A
maintainer then reconciles that report into this register.

During a dedicated CLEAR design-system refinement pass, this register and the relevant evidence may
be provided to Claude Design to compare use cases, validate reuse, and propose a system-level
capability. It is not a tutorial for designing Project Control screens and is not a required
attachment for every Project Control pass.

## Current requests and candidates

| ID | Product-neutral capability | Evidence source | Status | Current disposition |
|---|---|---|---|---|
| DS-001 | Keep a set of peer destinations reachable when the available width cannot contain them in one row | Project Control, Pass 1 correction through v3 refinement | Confirmed foundational gap; extension not approved | Earlier prototypes used a local wrapping override. Source inspection of the supplied v3 artifact confirms a local non-wrapping horizontal scroller with overflow cues and active-item reveal; an earlier wrap declaration is overridden by the final no-wrap rule. Bring the capability and both product experiments—not either workaround as a predetermined API—to a dedicated system refinement. |
| DS-002 | Represent an ordered set of destinations or steps when position or progress has meaning | Project Control, Passes 1–2 | Strengthened candidate | Two independent product contexts—the setup sequence and Build Flow destinations—now use similar local composition. This is stronger evidence but still comes from one product. Seek a third stable use or evidence from another CLEAR consumer before proposing system API. |
| DS-003 | Associate a region heading with its content and an optional contextual caption | Project Control, Pass 0–1 | Candidate | Fourteen uses survived product content cleanup. Compare anatomy and accessibility needs in another CLEAR consumer before proposing system API. |
| DS-004 | Compact, non-interactive semantic-state indicator | Project Control, Pass 0–1 | Not justified | Do not create a generic status component. Current product state text does not demonstrate a stable cross-product need. |
| DS-005 | Repeated label-and-value metadata pair | Project Control, Pass 0–1 | Not justified | Only two uses survived product cleanup; keep composed locally. |
| DS-006 | Reusable graph or node primitives | Project Control, Pass 0 | Product-local candidate | Revisit only after the graph use case is designed and compared with other CLEAR consumers. Do not generalize the product's DAG vocabulary into the system. |
| DS-007 | Allow a text-entry control to shrink safely inside constrained flex and grid parents | Project Control, Conversation + Workboard extension | Confirmed foundational gap; extension not approved | The current Input internal wrapper retains `min-width: auto`, causing reproducible overflow in a narrow composer. Project Control uses a local `min-width: 0` release. Bring the component constraint and reproduction—not the composer layout—to a dedicated system refinement. |
| DS-008 | Define scroll ownership and a perceivable boundary for independently scrolling content beside pinned controls or regions | Project Control, Pass 4A through v3 visual refinement | Strengthened candidate; system API not approved | Assist containment survived several passes, and v3 now reports two contained-scroll consumers plus a bounded pinned layer, reserved composer space, terminating rule, and overflow-dependent edge treatment. Preserve the product behavior locally; compare with another CLEAR consumer before deciding whether this belongs in a component, layout pattern, or guidance. |
| DS-009 | Offer a non-destructive text-action presentation within the action hierarchy without overriding component internals | Project Control, v3 visual refinement | Candidate | `Open evidence` requires a product-local class with `!important` plus surface and chamfer pseudo-element suppression because Button paints color and base treatment internally. Confirm the need in another CLEAR consumer and compare existing link/button semantics before proposing a variant or component change. |

## Pass history

### Pass 0

Claude Design initially proposed SectionHeading, StatusTag, MetaPair, secondary navigation, and
graph/node primitives. Owner review reclassified all as unapproved candidates pending content
cleanup, surviving-use inventory, and confirmation that no existing system capability fit.

Design-system changes made: none.

### Pass 1

- Section heading survived as a candidate with fourteen uses.
- StatusTag and MetaPair were not justified.
- Ordered destination navigation became a deferred gap for later Build Flow progression.
- No new primitive was built.

Design-system changes made: none.

### Pass 1 correction

- Responsive testing demonstrated DS-001: `TabBar` cannot keep peer destinations reachable under
  width pressure.
- The Project Control prototype uses one external wrapping rule as a local workaround.
- The design system itself was not modified.

Design-system changes made: none. Confirmed requests awaiting owner-approved refinement: DS-001.

### Pass 2

- DS-001 remains unchanged; the existing product-local wrapping rule is still the workaround.
- DS-002 now has two independent ordered-sequence contexts within Project Control. Its evidence is
  stronger, but it remains a candidate rather than an approved request because it has not yet been
  demonstrated across CLEAR consumers.
- No new primitive, component, variant, token, or mode was built.

Design-system changes made: none.

### Pass 3

- The connected Build Flow, immutable revisions, graph review, exact approval, Runner records,
  consolidation, and queue reconciliation composed existing CLEAR capabilities.
- Prototype-only controls remained locally identified and did not create system API.
- DS-001 and DS-002 remained unchanged.

Design-system changes made: none.

### Pass 4A

- Continuity, project conversations, evening-audit results, model routing, provider fallback, and
  connection/capacity views composed existing capabilities.
- No new reusable gap was demonstrated by the project-scoped conversation or routing surfaces.
- DS-001 and DS-002 remained unchanged.

Design-system changes made: none.

### Pass 4B

- Tool Registration, validation evidence, exact-version approval, Tool Catalog availability,
  disablement, and deprecation composed existing capabilities.
- A local border-binding defect was corrected by supplying the existing semantic color value rather
  than a border shorthand; it did not indicate a missing token or component.
- DS-001 and DS-002 remained unchanged.

Design-system changes made: none.

### Pass 5

- The content audit removed redundant labels, scope markers, status text, counts, and vague actions
  without changing the system.
- Neutral project containers and compact semantic condition cues use existing structure and
  frame-role capabilities across Clear, Vapour, Signal, and Mono.
- The embedded conversation surface composes existing capabilities and did not demonstrate a new
  cross-product gap.
- DS-001 remains the only confirmed foundational gap. DS-002 remains a strengthened candidate;
  DS-003 and DS-006 retain their existing dispositions.

Design-system changes made: none.

### Pass 6

- Final verification confirmed the responsive peer-navigation workaround remains necessary at
  constrained widths. DS-001 is still a confirmed foundational gap and remains unapproved for
  system implementation.
- The prototype uses a local wrapping/border override for `TabBar`; this workaround must not be
  mistaken for the future cross-product system API.
- A global inherited-button-font reset is a browser normalization detail, not a design-system gap.
- No other reusable gap was demonstrated during final route, state, chat, capability, appearance,
  or responsive verification.

Design-system changes made: none.

### Conversation + Workboard extension

- Seven project destinations reconfirmed DS-001. Source inspection of the supplied v3 artifact
  verifies that the current product workaround is a non-wrapping horizontal scroller with overflow
  cues and active-item reveal.
- A constrained composer demonstrated DS-007: the existing Input cannot shrink as a flex/grid item
  because its internal wrapper retains `min-width: auto`.
- The product uses local `min-width: 0` release rules. This is evidence for a reusable Input fix,
  not a request to generalize the Project Control composer.
- An invalid empty Chip used as a thinking indicator was corrected to the existing Loader2 icon;
  that misuse was not a design-system gap.
- Contained scrolling, pinned adjacent regions, and the unresolved Assist clipping boundary now
  strengthen DS-008. The evidence demonstrates a reusable question, but not yet the correct CLEAR
  API or visual treatment.
- Motion accounting is now explicit. The v3 artifact loads CLEAR's existing motion stylesheet,
  reuses its duration and stepped-timing tokens, uses the existing destination-entry animation,
  and supplies reduced-motion fallbacks. Assist entrance/exit and the scroll-boundary response are
  composed locally with those system values. This demonstrates accepted product behavior, but it
  does not yet demonstrate a missing cross-product motion primitive; compare another persistent
  adjacent panel before proposing a CLEAR motion component or pattern.
- The later v3 refinement adds DS-009 as a candidate after a text action required component-internal
  overrides. The final v3 source confirms that DS-001's current product treatment is horizontal
  scrolling; this is evidence, not an approved CLEAR implementation.

Design-system changes made: none. Confirmed requests awaiting owner-approved refinement: DS-001
and DS-007.

### v3 route, reconciliation, and Settings closeout

- The named-destination route correction, PNQ reconciliation paths, provider/model Settings
  semantics, and cold-load verification composed existing CLEAR capabilities.
- The constrained-width verification again confirms DS-001 and DS-007, with the existing local
  peer-navigation and Input-shrink workarounds unchanged.
- A late-mounted pinned heading required a product-local measurement observer so its containing
  scroll region could reserve the correct space on a cold load. This strengthens DS-008's evidence
  about measured pinned regions and scroll ownership, but does not establish a cross-product API.
- The product-local `.pc-action` treatment remains unchanged evidence for DS-009.
- No component, variant, token, variable, mode, or motion primitive was created or modified.

Design-system changes made: none. No new request was added.

## Evidence intake from product passes

A product-pass report should state:

1. new demonstrated gaps;
2. local workarounds introduced or removed;
3. design-system components, variants, tokens, or modes actually changed; and
4. whether a gap blocks the next product pass.

The product pass does not edit this register. If nothing changed, it should report `No
design-system delta` rather than inventing a request. The maintainer decides whether the evidence
creates, changes, reaffirms, or resolves a register entry.
