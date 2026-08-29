> **DATA-01d** · Layer `data` · Milestone `M0` · Carry-over `rebuild`

> **Part of DATA-01.** DATA-02 seeds the exercise library and touches the catalog only; as one node it waited on execution tables it never reads. The migrations apply in order — that is a property of foreign keys, not of the tickets — but a dependent should wait for the domain it uses, not for all four.

**Applies to all four:** single migration each, commented, idempotent on an empty project; RLS verified at authoring time — user A cannot read or write user B's rows on any user table — and re-verified continuously by ENV-07.

**Spec:** `specs/DATA_MODEL.md` §5

Set logs and block results — the performed side, and the home of typed absence.

## Acceptance
- [ ] Set logs support reps, duration **and** distance with units — not reps alone
- [ ] `weight_unit` on **every** set-log row, stamped at write time
- [ ] **A null actual means *not recorded*.** It is never zero and never skipped; skipped is a status, zero is a measurement. The columns and constraints make the three distinguishable without a comment explaining which is which
- [ ] `block_results` is keyed to a **block**, not a section — a conditioning section holding an EMOM *and* an AMRAP records both
- [ ] `block_results` holds every timed outcome: `elapsed_seconds`, `completed_under_cap`, `rounds_completed`, `partial_round_reps`, `highest_rung`, `minutes_completed`, and perceived effort
- [ ] A set log references the exercise row **actually performed**, and the FK makes attaching it to a superseded prescription impossible
- [ ] Set logs carry a client-generated id so EXE-07's retry is idempotent by construction

---

**Depends on:** DATA-01c
**Blocks:** DATA-03, GEN-02c, SES-01a

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
