> **CORE-03** · Layer `state` · Milestone `M0` · Carry-over `new`

**Spec:** `specs/generation/GENERATION_CONTRACT.md` §5

Kills the unvalidated half of D2. Zod schemas for every payload that crosses a boundary, mirroring the database's CHECK constraints so **anything that validates can be persisted** — failing at the boundary beats failing at the INSERT.

Covers the generation output contract v4.1 (blocks, discriminated targets, timer contracts), request/response envelopes, `Profile`, `Location`, and `user_constraints`. One source file consumed by client and edge functions alike.

## Acceptance
- [ ] A real contract-v4.1 sample round-trips, including a ladder (`target_kind: sequence`), a rep range, a per-side prescription, and a distance prescription
- [ ] Discriminated union on `target_kind` rejects a payload with the wrong fields populated
- [ ] `modality` accepts reps, time, distance — and **rejects `rounds`**, which belongs to the block
- [ ] Timed block types without `timer_seconds` are rejected; `circuit` without `rounds` is rejected
- [ ] An invalid sample fails with path-level issues (which field, why)
- [ ] Client and edge import the same schema source — no duplicated definitions
- [ ] Types are inferred (`z.infer`), never written twice

---

**Depends on:** ENV-01, DATA-03
**Blocks:** AUTH-03, GEN-01, GEN-02b, GEN-03, GEN-06, SES-01a

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
