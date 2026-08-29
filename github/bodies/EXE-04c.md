> **EXE-04c** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

> **Part of EXE-04.** This is the split the whole `SectionRenderer` architecture exists to enable. The old app handled six structure types in one 652-line component; keeping the three hardest in one ticket would rebuild that coupling in the graph instead of in the file. Each renderer is a separate agent, a separate PR, a separate review.

**Shared, and deliberately not duplicated:** the `block_results` write and the perceived-effort capture belong to **EXE-01**, which owns block completion. Each renderer supplies its outcome fields; none of them writes the row.

**Spec:** `specs/structures/amrap-logging.md`, `specs/structures/quickfix-amrap-round-label.md`

## Acceptance
- [ ] Completed rounds increment without leaving the screen or opening a dialog — this is the highest-frequency interaction in the app
- [ ] Partial-round reps captured at the cap, per the logging spec
- [ ] Round labels follow the quickfix spec
- [ ] `rounds_completed` and `partial_round_reps` supplied to the block-completion write
- [ ] A partial round with zero reps is distinguishable from no partial round at all (typed absence, DATA-01d)

---

**Depends on:** EXE-01
**Blocks:** FAV-02, OVR-03

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
