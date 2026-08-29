> **EXE-04a** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

> **Part of EXE-04.** This is the split the whole `SectionRenderer` architecture exists to enable. The old app handled six structure types in one 652-line component; keeping the three hardest in one ticket would rebuild that coupling in the graph instead of in the file. Each renderer is a separate agent, a separate PR, a separate review.

**Shared, and deliberately not duplicated:** the `block_results` write and the perceived-effort capture belong to **EXE-01**, which owns block completion. Each renderer supplies its outcome fields; none of them writes the row.

**Spec:** `docs/specs/structures/ladder-for-time.md`, `docs/specs/structures/quickfix-ladder-rung-label.md`

## Acceptance
- [ ] Rungs render from `target_sequence` as ordered targets — **the renderer indexes an int array; nothing parses a string**
- [ ] Rep scheme is shown once, at the block, not repeated per exercise
- [ ] Rung labels follow the quickfix spec — a rung is identified by its target, not by its index
- [ ] Cap-hit prompts rung selection; `highest_rung` is supplied to the block-completion write
- [ ] Read-only and interactive rung states are visually distinct

---

**Depends on:** EXE-01
**Blocks:** FAV-02, OVR-03

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
