> **DATA-01a** · Layer `data` · Milestone `M0` · Carry-over `rebuild`

> **Part of DATA-01.** DATA-02 seeds the exercise library and touches the catalog only; as one node it waited on execution tables it never reads. The migrations apply in order — that is a property of foreign keys, not of the tickets — but a dependent should wait for the domain it uses, not for all four.

**Applies to all four:** single migration each, commented, idempotent on an empty project; RLS verified at authoring time — user A cannot read or write user B's rows on any user table — and re-verified continuously by ENV-07.

**Spec:** `docs/specs/DATA_MODEL.md` §3

Exercise definitions, `component_movements`, the component→pattern map, equipment, and the derived `exercise_patterns` view. Read-only to clients — this is where that convention is established.

## Acceptance
- [ ] `exercise_definitions` carries `component_movements` and `exercise_role`; `component_pattern_map` is a real table, not a CASE expression
- [ ] `exercise_patterns` view derives movement pattern from components — **zero re-tagging**, and a new component is one row, not a migration
- [ ] `session_focus` and `movement_pattern` exist as enums, and the focus→patterns mapping is data
- [ ] Catalog tables are readable by any authenticated user and writable by none
- [ ] `exercise_pattern_weights` exists to receive DATA-02's migrated weighting; `exercise_anchors` is **not** created — it is a thing being retired, not rebuilt

---

**Depends on:** ENV-01
**Blocks:** ENV-05, DATA-01b, DATA-02

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
