> **OVR-01a** · Layer `state` · Milestone `M3` · Carry-over `new`

> **Part of OVR-01.** OVR-02 needs the rules; it does not need the Review surface. And the rule table is a set of pure functions with a test per row — the single most testable thing in the project, and the piece least helped by being bundled with UI.

**Spec:** `specs/OVR-01_progressive-overload.md` §1

The anchor table and its computation. No prescriptions are changed by this issue — it only learns.

## Acceptance
- [ ] `load_anchors` recomputed on session completion, **working sets only** — warmup sets never move an anchor
- [ ] Active-recovery and deload sessions excluded; a deliberately light day is not evidence you got weaker
- [ ] Rep completion is **computed, not parsed** — a set log joins to its immutable prescription row for the prescribed target
- [ ] Bodyweight movements are excluded from load anchors entirely; they progress by reps
- [ ] Recomputation is idempotent and derives from set logs — re-running against the same history produces the same anchors

---

**Depends on:** EXE-02, SES-01b
**Blocks:** OVR-01b, OVR-04

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
