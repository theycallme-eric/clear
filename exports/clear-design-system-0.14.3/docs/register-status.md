# Request register: what to copy into `CLEAR-DESIGN-SYSTEM-REQUESTS.md`

For the maintainer. The register lives outside this project and **was not edited**. The only copy seen here (`uploads/CLEAR-DESIGN-SYSTEM-REQUESTS.md`) predates CLEAR 0.6.0, so it can't show whether these updates were applied. This file replaces the 0.6.0 and 0.7.0 proposal files. Status is as of CLEAR 0.10.1.

## Status by request

| ID | Capability | Status | Where |
|---|---|---|---|
| DS-001 | Keep peer destinations reachable when the width can't hold them in one row | **Resolved in 0.6.0** | `OverflowRail`; `TabBar` composes it |
| DS-002 | An ordered set of destinations or steps | Strengthened candidate | |
| DS-003 | A region heading with its content and an optional caption | Candidate | |
| DS-004 | A compact, non-interactive state indicator | Not justified | |
| DS-005 | A repeated label-and-value pair | Not justified | |
| DS-006 | Graph or node primitives | Product-local candidate | |
| DS-007 | A text field that shrinks inside constrained flex and grid parents | **Resolved in 0.6.0** | `Input` shrink contract |
| DS-008 | A scrolling region beside pinned layers in a fixed shell | **Resolved in 0.7.0, by owner decision** | `ScrollRegion`, `.clr-scroll-region` |
| DS-009 | A non-destructive text action | **Resolved in 0.14.0, by owner decision** | `TextAction`, `.clr-text-action` |

## Notes to carry into the register

- **DS-001 and DS-007** were accepted on one product's evidence because each was a failure of the existing contract under ordinary conditions (content became unreachable; a component forced its parent wide). That's the bar for single-product promotion.
- **DS-008** didn't meet that bar. It was promoted by owner decision, and **shouldn't be cited as precedent**. Three owner decisions departed from the consumer's version: a hard edge instead of a fade, the timer retry demoted to a bounded fallback, and the shell owns the viewport.
- **DS-009** was promoted **by owner decision** on single-product evidence, like DS-008, and shouldn't be cited as precedent. Picked from a comparison: a label in the action colour ending in ›, no frame. Brackets were rejected because they'd read as focus brackets.
- **No consumer vocabulary entered the API** in any of these.
