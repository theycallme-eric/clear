# Proposed updates to `CLEAR-DESIGN-SYSTEM-REQUESTS.md`

For maintainer review. **The register itself was not edited.** This file proposes the changes a maintainer would reconcile into it after CLEAR `0.6.0`.

Source: CLEAR `0.6.0`, released 2026-09-19. Detail in `CLEAR-0.6.0-RECONCILIATION-REPORT.md`.

---

## 1 · Header

```
Status: current
Updated: 2026-09-19
```

## 2 · Request table — two rows change, seven do not

Replace the DS-001 row:

| ID | Product-neutral capability | Evidence source | Status | Current disposition |
|---|---|---|---|---|
| DS-001 | Keep a set of peer destinations reachable when the available width cannot contain them in one row | Project Control, Pass 1 correction through v3 refinement | **Resolved in CLEAR 0.6.0** | Implemented as `OverflowRail`: a product-neutral primitive owning containment, horizontal scrolling, directional overflow cues and active-item reveal, imposing no tab or navigation semantics. `TabBar` composes it and retains full tablist semantics. Default on, no opt-in. Cue is a structural edge rule plus a stepped chevron, never a fade. Product-local wrapping and scrolling overrides may be removed. |

Replace the DS-007 row:

| ID | Product-neutral capability | Evidence source | Status | Current disposition |
|---|---|---|---|---|
| DS-007 | Allow a text-entry control to shrink safely inside constrained flex and grid parents | Project Control, Conversation + Workboard extension | **Resolved in CLEAR 0.6.0** | `Input` releases its internal minimum width and takes the width it is given; height, focus, label, validation and affordances preserved, standalone sizing unchanged. Product-local `min-width: 0` releases may be removed. |

**DS-002, DS-003, DS-004, DS-005, DS-006, DS-008: no change.** Status and disposition text stand as written.

**DS-009: no change to status or disposition.** Suggested addition to its disposition cell, recording that the register's precondition was met:

> The prior comparison the register asks for was performed during the 0.6.0 pass: `Button` does paint surface and chamfer pseudo-elements internally, so a text-only action cannot be expressed by prop alone and the reported override is the available workaround. The *need* is reproduced; the cross-product evidence is not. Still a candidate.

## 3 · New pass entry

Append after *v3 route, reconciliation, and Settings closeout*:

### CLEAR 0.6.0 design-system refinement

- First owner-approved refinement pass. Previous entries all record `Design-system changes made: none`; this one does not.
- **DS-001 resolved.** `OverflowRail` added as public API — named for its interaction, not for the product that surfaced it, and explicitly not `NavRail`. `TabBar` composes it without gaining navigation semantics.
- **DS-007 resolved.** `Input` shrink contract corrected.
- Neither product's workaround was adopted as the API. The product experiments supplied the behavioural requirement; the anatomy, naming and cue treatment came from CLEAR's own conventions.
- **DS-009's precondition discharged** — existing quiet Button tested, need reproduced, disposition unchanged for want of a second consumer.
- **Structural containers and localized semantic condition cues** (Pass 5 evidence) were reconciled as product-neutral guidance in `docs/patterns.md`. No Project Control card component and no generic status component was created, consistent with DS-004.
- **No motion primitive was created** from Project Control's motion evidence, consistent with the Conversation + Workboard extension entry.
- Documentation reconciliation: workout-application voice, card composition, layout policy and product prohibitions moved into a labelled product profile; export packaging described accurately; skin family and colour contract corrected; duplicate stylesheet loading fixed in all three shipped templates.
- Verification: direct testing against the workout consumer is **no-regression only** — it composes local primitives against CLEAR tokens and uses neither `TabBar` nor `Input`. Project Control was **not** regression-tested; its compatibility is evidence-based against this register.

Design-system changes made: `OverflowRail` added; `TabBar` and `Input` behaviour corrected; 7 tokens and 3 CSS classes added; 2 duplicate specimen cards removed. Confirmed requests awaiting owner-approved refinement: **none**.

## 4 · Suggested note under *Scope and naming rules*

The register's rule that one product may confirm a foundational gap was exercised twice and held. Worth recording what distinguished those two from the seven that did not qualify, so the line stays legible:

> DS-001 and DS-007 were accepted on single-product evidence because each described a **failure of the existing contract under ordinary conditions** — content becoming unreachable, a component forcing its parent to overflow — rather than a missing convenience. Both were reproducible against the system in isolation, without the product present. Candidates that describe a composition a product would like to reuse still require a second consumer.

## 5 · Deferred requests — unchanged, restated for the maintainer's convenience

DS-002 strengthened candidate · DS-003 candidate · DS-004 not justified · DS-005 not justified · DS-006 product-local candidate · DS-008 strengthened candidate, API not approved · DS-009 candidate.

No entry was weakened, promoted or removed. No new request is proposed: the 0.6.0 pass demonstrated no new reusable gap.
