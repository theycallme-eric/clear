> **SES-01b** · Layer `state` · Milestone `M1` · Carry-over `rebuild`

> **Part of SES-01.** Streak derivation was folded in here because it is a query over completed sessions — but HOME-01 and HOME-02 need *only* that query, and as one node they waited on the whole state machine, the resume path and the reconstruction queries. That is the clearest case of false serialization in the graph.

**Spec:** `specs/DATA_MODEL.md` §7

The queries that make prescribed, revised and performed independently reconstructable — and the test that proves the old behaviour is gone.

## Acceptance
- [ ] **D6 regression test:** generate a workout, swap an exercise in review, start, log sets, complete. Assert the set logs attach to the *substitute* and the original is still reconstructable with lineage. **This test must exist and must fail against the old behaviour** — a test that passes both ways proves nothing
- [ ] "As intended at start" resolves **temporally** — rows active at `started_at`, not merely active now. A swap made after starting does not rewrite what was intended
- [ ] "As performed" includes skipped exercises with no logs, block results, and partially-logged exercises — **not a bare join to set logs**, which silently drops everything that was not done
- [ ] The three reconstructions are three named functions with tests, not three variations someone assembles per screen

---

**Depends on:** SES-01a
**Blocks:** FAV-01, OVR-01a

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
