> **OVR-01c** · Layer `ui` · Milestone `M3` · Carry-over `new`

> **Part of OVR-01.** OVR-02 needs the rules; it does not need the Review surface. And the rule table is a set of pure functions with a test per row — the single most testable thing in the project, and the piece least helped by being bundled with UI.

**Spec:** `specs/OVR-01_progressive-overload.md` §3

## Acceptance
- [ ] Review shows the suggested weight and its session-count confidence per exercise
- [ ] Tapping it opens a **`Dialog`** — last session's actual sets, the RPE recorded, and the rule that fired in plain language ("all reps at RPE 7.5 → +1 increment")
- [ ] A per-session override changes this session only and **never rewrites the anchor**
- [ ] Low confidence reads as low confidence in the interface, not as a number with a footnote
- [ ] No suggestion is shown where there is no anchor — an absent suggestion is a state, not a zero

---

**Depends on:** OVR-01b, REV-01, DS-05
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
