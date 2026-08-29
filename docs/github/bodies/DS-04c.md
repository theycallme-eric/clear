> **DS-04c** · Layer `design` · Milestone `M0` · Carry-over `new`

> **Part of DS-04.** Their dependents are disjoint. Card is on nearly every screen; Select is on History alone; CollapsibleSection is on Review and Workout. Bundled, HOME-01 waits on a filter control it never renders.

**Applies to all three:** built from the tokens and classes in ATOMIC.md; passes the adherence lint at `error` (DS-08); ≥44px touch targets on coarse pointers; present in the gallery in every state across all four skins; introduces **no new token**.

Workout and review section disclosure.

## Acceptance
- [ ] Disclosure pattern with `aria-expanded` on a keyboard-operable trigger
- [ ] **Collapsed content stays in the accessibility tree's document order** — collapsed is not removed, so find-in-page and a screen reader's linear read still work
- [ ] The expand/collapse transition uses the motion vocabulary and is inert under `prefers-reduced-motion`
- [ ] Nested disclosure is possible without the inner trigger stealing the outer one's toggle

---

**Depends on:** DS-01
**Blocks:** DS-07, GEN-04

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
