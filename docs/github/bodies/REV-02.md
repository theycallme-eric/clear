> **REV-02** · Layer `api` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `docs/specs/generation/exercise-swap.md`, `docs/specs/generation/GENERATION_CONTRACT.md`

Single-slot regeneration on the same contract as GEN-02 — the same candidate retrieval, the same validation, narrower scope.

## Acceptance
- [ ] A swap draws from the same candidate query as generation, scoped to the slot's section and constraints
- [ ] Unit swap regenerates a whole block as a unit, preserving the block's structure and timer
- [ ] The result is persisted as a revision with lineage — **never a mutation in place** (D6)
- [ ] Envelope guarantees inherited: typed errors, requestId echo, no header logging

---

**Depends on:** GEN-02c
**Blocks:** REV-03, EXE-06

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
