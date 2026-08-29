> **REV-02** · Layer `api` · Milestone `M1` · Carry-over `rebuild`

Single-slot regeneration on the same contract as GEN-02 — the same candidate retrieval, the same validation, narrower scope.

**Spec:** `specs/generation/exercise-swap.md`, `specs/generation/GENERATION_CONTRACT.md`

## Acceptance

- [ ] A swap draws from the same candidate query as generation, scoped to the slot's section and constraints
- [ ] Unit swap regenerates a whole block as a unit, preserving the block's structure and timer
- [ ] The result is persisted as a revision with lineage — **never a mutation in place** (D6)
- [ ] Envelope guarantees inherited: typed errors, requestId echo, no header logging

---

**Depends on:** GEN-02
**Blocks:** REV-03

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
