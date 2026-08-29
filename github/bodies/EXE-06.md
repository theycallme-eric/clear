> **EXE-06** · Layer `ui` · Milestone `M3` · Carry-over `new`

**Spec:** `specs/DATA_MODEL.md` §4 lineage · `specs/generation/exercise-swap.md`

The rack is taken, the shoulder is complaining, the plan changes at minute 12. Same
append-and-supersede lineage REV-02 uses in review, applied during execution.

**No new schema.** The three-state model already separates prescribed from revised from
performed, and `slot_id` already threads a slot's history across substitutions.

## Acceptance
- [ ] Swapping mid-workout supersedes the active row and inserts the replacement in the same `slot_id`, with `replaces_id` set
- [ ] **Sets already logged stay attached to the superseded row** — the session reconstructs as "3×8 Deadlift, then switched to RDL", never as if the whole slot had always been RDL
- [ ] The swap candidate list respects the same equipment and limitation filters generation used, evaluated against the *current* location
- [ ] Undo restores the prior exercise and re-activates it; already-logged sets are untouched by the undo
- [ ] A swapped slot is excluded from load-anchor updates for the superseded exercise — you did not get weaker at deadlift, you stopped doing it

---

**Depends on:** EXE-01, REV-02
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
