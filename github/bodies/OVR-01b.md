> **OVR-01b** · Layer `state` · Milestone `M3` · Carry-over `new`

> **Part of OVR-01.** OVR-02 needs the rules; it does not need the Review surface. And the rule table is a set of pure functions with a test per row — the single most testable thing in the project, and the piece least helped by being bundled with UI.

**Spec:** `specs/OVR-01_progressive-overload.md` §2, §5

The RPE rule table and the confidence ladder, as pure functions.

## Acceptance
- [ ] **Every row of the RPE rule table has a unit test**, including overshoot and first-set ≥9. The table in the spec and the tests are the same list
- [ ] Suggested weight = inverted anchor → rounded to the equipment increment → clamped to 110% of the 8-week logged max
- [ ] Sparse/stale ladder enforced: 0/1/2/3+ session confidence tiers; 3/6/12-week decay; **>12 weeks discards the anchor** rather than trusting it quietly
- [ ] Pure functions with no database access — the rules take history and return a suggestion, so they are testable without a session
- [ ] A suggestion always carries its confidence tier; there is no unqualified number

---

**Depends on:** OVR-01a
**Blocks:** OVR-01c, OVR-02, OVR-03

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
