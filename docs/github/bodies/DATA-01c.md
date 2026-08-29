> **DATA-01c** · Layer `data` · Milestone `M0` · Carry-over `rebuild`

> **Part of DATA-01.** DATA-02 seeds the exercise library and touches the catalog only; as one node it waited on execution tables it never reads. The migrations apply in order — that is a property of foreign keys, not of the tickets — but a dependent should wait for the domain it uses, not for all four.

**Applies to all four:** single migration each, commented, idempotent on an empty project; RLS verified at authoring time — user A cannot read or write user B's rows on any user table — and re-verified continuously by ENV-07.

**Spec:** `docs/specs/DATA_MODEL.md` §4, §6

Sessions, sections, **blocks**, and exercises — the prescription side, and the domain where D6 is designed out.

## Acceptance
- [ ] `workout_blocks` exists between sections and exercises and **owns every structure attribute** — `structure_type`, `rounds`, timer, `round_rest_seconds`, `rep_scheme`. No exercise carries a timer or a round count, so members of a block cannot disagree
- [ ] CHECK constraints enforce the structure's own rules: a timed structure has a clock, a fixed-round structure has rounds
- [ ] Prescriptions are discriminated: `modality` (reps/time/distance) × `target_kind` (fixed/range/sequence), plus `per_side` and `distance_unit`. **`{8,10}` as a range and as a two-rung sequence are distinguishable**, and a malformed combination is rejected by the database
- [ ] Lineage: `slot_id` threads a slot's history, `replaces_id` points at what was superseded, `UNIQUE (replaces_id)` prevents branching
- [ ] `revision_status` and `execution_status` are **independent columns** — a superseded exercise keeps its own execution state
- [ ] Four unambiguous duration fields on the session: requested, effective target, computed, actual
- [ ] `prompt_version` and `contract_version` columns exist on the session

---

**Depends on:** DATA-01b
**Blocks:** DATA-01d, GEN-01

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
