> **SES-01a** · Layer `state` · Milestone `M1` · Carry-over `rebuild`

> **Part of SES-01.** Streak derivation was folded in here because it is a query over completed sessions — but HOME-01 and HOME-02 need *only* that query, and as one node they waited on the whole state machine, the resume path and the reconstruction queries. That is the clearest case of false serialization in the graph.

**Spec:** `specs/DATA_MODEL.md` §7 · `specs/generation/WORKED_EXAMPLE.md`

Accept → persist atomically → active → complete, plus abandon and resume.

## Acceptance
- [ ] Accepting persists the **full** structure in one transaction — sessions, sections, blocks, exercises. A failure leaves nothing behind
- [ ] A swap inserts a new row in the same `slot_id` with `replaces_id` set; the superseded row keeps its own `execution_status`
- [ ] Hard refresh mid-workout → resumable at the correct section with logged sets intact
- [ ] Completion writes `completed_at` and `actual_duration_mins`
- [ ] Machine transitions unit-tested, **including the abandon path** — abandoning is a state, not a delete
- [ ] Exactly one active session per user is possible; starting a second is a typed error, not a race

---

**Depends on:** DATA-01d, DATA-03, CORE-03, AUTH-03
**Blocks:** SES-01b, SES-01c, EXE-01, EXE-07, SUM-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
