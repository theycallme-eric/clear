> **DATA-01b** · Layer `data` · Milestone `M0` · Carry-over `rebuild`

> **Part of DATA-01.** DATA-02 seeds the exercise library and touches the catalog only; as one node it waited on execution tables it never reads. The migrations apply in order — that is a property of foreign keys, not of the tickets — but a dependent should wait for the domain it uses, not for all four.

**Applies to all four:** single migration each, commented, idempotent on an empty project; RLS verified at authoring time — user A cannot read or write user B's rows on any user table — and re-verified continuously by ENV-07.

**Spec:** `specs/DATA_MODEL.md` §2

Profiles, locations, location equipment, enabled sections, and the profile's `weight_unit` default.

## Acceptance
- [ ] A profile row is created on first authenticated visit and never partially written — the D1 failure mode has no schema to live in
- [ ] Locations carry an equipment tier and an explicit equipment list; exactly one default per user, enforced by constraint rather than convention
- [ ] `weight_unit` default lives on the profile; **changing it never reinterprets history** — the unit is stamped per set log in DATA-01d
- [ ] RLS: a user reads and writes only their own profile, locations and equipment. Proven with a second user, not asserted

---

**Depends on:** DATA-01a
**Blocks:** ENV-04, DATA-01c, DATA-05

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
