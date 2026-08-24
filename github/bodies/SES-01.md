> **SES-01** · Layer `state` · Milestone `M1` · Carry-over `rebuild`

The workout state machine, and the requirement that closes D6. Accept → persist atomically → active → complete, with prescribed, revised, and performed all independently reconstructable.

**Spec:** `specs/DATA_MODEL.md` §7

## Acceptance

- [ ] **D6 regression test:** generate a workout, swap an exercise in review, start, log sets, complete. Assert the set logs attach to the *substitute* and the original is still reconstructable with lineage. This test must exist and must fail against the old behavior
- [ ] Accepting persists the full structure — sessions, sections, blocks, exercises
- [ ] A swap inserts a new row in the same `slot_id` with `replaces_id` set; the superseded row keeps its own `execution_status`
- [ ] "As intended at start" resolves temporally — rows active at `started_at`, not merely active now
- [ ] "As performed" includes skipped exercises with no logs, block results, and partially-logged exercises — not a bare join to set logs
- [ ] Hard refresh mid-workout → resumable at the correct section with logged sets intact
- [ ] Completion writes `completed_at` and `actual_duration_mins`; **the streak function returns the correct value afterward** (streak is derived from sessions, not stored — see HOME-02)
- [ ] Machine transitions unit-tested, including the abandon path

---

**Depends on:** DATA-01, DATA-03, CORE-03, AUTH-03
**Blocks:** EXE-01, SUM-01, HOME-01, FAV-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
