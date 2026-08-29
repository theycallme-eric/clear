> **DS-04b** · Layer `design` · Milestone `M0` · Carry-over `new`

> **Part of DS-04.** Their dependents are disjoint. Card is on nearly every screen; Select is on History alone; CollapsibleSection is on Review and Workout. Bundled, HOME-01 waits on a filter control it never renders.

**Applies to all three:** built from the tokens and classes in ATOMIC.md; passes the adherence lint at `error` (DS-08); ≥44px touch targets on coarse pointers; present in the gallery in every state across all four skins; introduces **no new token**.

Absent from the export entirely. Needed for history and library filtering.

## Acceptance
- [ ] A **real `<select>`** styled to CLEAR — keyboard behaviour, type-ahead, and the platform's mobile picker come free and are not reimplemented
- [ ] Label, helper and error wiring through `FormField`, matching `Input`'s aria contract
- [ ] Sharp corners, 2px structure border, surface brightens on focus — visually a sibling of `Input`, not a foreign control
- [ ] The native dropdown is left alone; no custom listbox

---

**Depends on:** DS-01
**Blocks:** DS-07

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
