> **EXE-04b** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

> **Part of EXE-04.** This is the split the whole `SectionRenderer` architecture exists to enable. The old app handled six structure types in one 652-line component; keeping the three hardest in one ticket would rebuild that coupling in the graph instead of in the file. Each renderer is a separate agent, a separate PR, a separate review.

**Shared, and deliberately not duplicated:** the `block_results` write and the perceived-effort capture belong to **EXE-01**, which owns block completion. Each renderer supplies its outcome fields; none of them writes the row.

**Spec:** `specs/structures/ladder-for-time.md`

## Acceptance
- [ ] Both completion paths reachable and **visually distinct**: finished under cap, and cap reached
- [ ] `elapsed_seconds` and `completed_under_cap` supplied to the block-completion write
- [ ] Finishing under cap stops the clock at the finish, not at the cap
- [ ] Urgency styling appears **only** near the cap, per colour doctrine — red is time pressure here, and the label and pulse carry it too, never hue alone

---

**Depends on:** EXE-01
**Blocks:** FAV-02, OVR-03

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
