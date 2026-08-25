> **OVR-01** · Layer `api` · Milestone `M3` · Carry-over `new`

**Spec:** `specs/OVR-01_progressive-overload.md` (§1–2, §5, slice a)

e1RM load anchors computed from set logs; RPE-driven next-prescription rules; sparse/stale handling; weight suggestion with "why this number" on Review. The spec's ~80%-of-value slice.

## Acceptance
- [ ] `load_anchors` table recomputed on session completion — working sets only; active-recovery and deload sessions excluded
- [ ] Suggested weight = inverted anchor → rounded to equipment increment → clamped to 110% of the 8-week logged max
- [ ] The RPE rule table implemented as pure functions with unit tests covering every row (incl. overshoot and first-set ≥9)
- [ ] Sparse/stale ladder enforced: 0/1/2/3+ session confidence tiers; 3/6/12-week decay; >12 weeks discards the anchor
- [ ] Rep completion is **computed**, not parsed — a set log joins to its immutable prescription row for the prescribed target
- [ ] Review shows suggestion + session-count confidence + tappable "why this number" `Dialog`; per-session override never rewrites the anchor
- [ ] Bodyweight movements excluded from load anchors — rep progression only

---

**Depends on:** EXE-02, DATA-01
**Blocks:** OVR-02

<sub>Generated from `requirements/REQUIREMENTS.md` v0.5 — edit the requirement, not the issue.</sub>
