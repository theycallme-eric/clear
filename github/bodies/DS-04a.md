> **DS-04a** · Layer `design` · Milestone `M0` · Carry-over `new`

> **Part of DS-04.** Their dependents are disjoint. Card is on nearly every screen; Select is on History alone; CollapsibleSection is on Review and Workout. Bundled, HOME-01 waits on a filter control it never renders.

**Applies to all three:** built from the tokens and classes in ATOMIC.md; passes the adherence lint at `error` (DS-08); ≥44px touch targets on coarse pointers; present in the gallery in every state across all four skins; introduces **no new token**.

`.clr-card` ships as CSS — accent bar plus chamfered body. This is the React wrapper.

## Acceptance
- [ ] Composes `.clr-card__bar` + `.clr-card__body`; the bar owns the left edge and the body carries the chamfer
- [ ] `barWidth` selects the 8px and 12px variants via `--accent-bar-width` / `-lg` — no hardcoded width
- [ ] Accepts `className` and spreads native attributes, matching the export's component conventions
- [ ] A card containing a heading does not impose a heading level (CORE-05)

---

**Depends on:** DS-01
**Blocks:** DS-07, REV-01, EXE-01, EXE-02, SUM-01, HIST-01, HOME-01, SET-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
