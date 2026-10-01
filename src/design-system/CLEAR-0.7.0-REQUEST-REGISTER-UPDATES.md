# Proposed register update: CLEAR 0.7.0

For maintainer review. The register itself was not edited.

## DS-008: replace the row

| ID | Product-neutral capability | Evidence source | Status | Current disposition |
|---|---|---|---|---|
| DS-008 | Keep a vertically scrolling region readable beside pinned layers inside a fixed shell | Project Control (single consumer) | **Resolved in CLEAR 0.7.0: promoted by owner decision** | Implemented as `ScrollRegion` + `.clr-scroll-region`, with `.clr-shell--fixed` for viewport ownership. Hard edge with no fade; edge streaks while scrolling; layer heights measured. Product-local scrollers, pinned-heading observers and sticky-header workarounds may be removed. |

## Pass entry

### CLEAR 0.7.0: contained vertical scrolling

- DS-008 promoted **by owner decision** on single-product evidence. It did not meet the cross-product bar recorded under *Scope and naming rules*, and the promotion should not be cited as precedent that it did.
- The consumer's accepted behaviour was adopted except in three places, each an owner decision: no dissolve mask (hard edge instead), timer retry demoted to a bounded fallback, and viewport ownership moved to a separate shell primitive using `dvh`.
- Named in CLEAR's terms. No consumer vocabulary entered the API.

Confirmed requests awaiting refinement: none. DS-002, DS-003, DS-004, DS-005, DS-006 and DS-009 unchanged.
