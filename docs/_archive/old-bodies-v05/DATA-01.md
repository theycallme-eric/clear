> **DATA-01** · Layer `data` · Milestone `M0` · Carry-over `rebuild`

The full baseline, authored against the data model spec rather than ported from the old migrations. Four domains in one Postgres database: catalog, user baseline, workout, execution. Applied to a **new** Supabase project. The structural changes that make D6 impossible and the three-state model real: **blocks** as a first-class level between sections and exercises · **discriminated prescriptions** (modality, target kind, per-side, distance unit) replacing a TEXT `reps` column that held four data types · **temporal lineage** (`slot_id`, `created_at`, `superseded_at`) with revision and execution status kept separate · **typed absence** — a null actual never means zero or skipped.

**Spec:** `specs/DATA_MODEL.md`

## Acceptance

- [ ] Single migration creates the full schema on an empty project
- [ ] RLS verified: authenticated user A cannot read or write user B's rows on any user table
- [ ] Catalog tables are read-only to clients
- [ ] Structure attributes live on `workout_blocks` — **no exercise carries a timer, round count, or shared rest**, so members of a block cannot disagree
- [ ] `block_results` is keyed to a block, not a section — a conditioning section holding an EMOM *and* an AMRAP records both
- [ ] Target CHECK constraints reject a malformed prescription: `{8,10}` as a range and as a two-rung sequence are distinguishable
- [ ] `UNIQUE (replaces_id)` prevents branching lineage; `revision_status` and `execution_status` are independent columns
- [ ] Set logs support reps, duration, and distance with units — not reps alone
- [ ] `weight_unit` on every set-log row plus a profile default; a changed default never reinterprets history
- [ ] Four unambiguous duration fields on the session: requested, effective target, computed, actual
- [ ] Migration commented by domain

---

**Depends on:** ENV-01
**Blocks:** ENV-04, ENV-05, DATA-02, DATA-03, DATA-05, GEN-01, SES-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
