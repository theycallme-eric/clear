> **SES-01c** · Layer `state` · Milestone `M1` · Carry-over `rebuild`

> **Part of SES-01.** Streak derivation was folded in here because it is a query over completed sessions — but HOME-01 and HOME-02 need *only* that query, and as one node they waited on the whole state machine, the resume path and the reconstruction queries. That is the clearest case of false serialization in the graph.

**Spec:** `specs/DATA_MODEL.md` §7

Consecutive days with a completed, streak-counting session, computed from `workout_sessions`. **Never stored** — the old app kept six columns of derived state and they drifted.

## Acceptance
- [ ] Streak is a pure function of session rows; **no streak column exists anywhere in the schema**
- [ ] A deleted or abandoned session changes the streak with no repair step
- [ ] Deload and active-recovery sessions count as training days
- [ ] Timezone is the user's, resolved once — a session at 11pm and one at 1am are different days for the user, whatever UTC thinks
- [ ] HOME-02's pause states, rest-day allowances and week strip **extend this function** rather than replacing it; the extension point is named in the code

---

**Depends on:** SES-01a
**Blocks:** HOME-01, HOME-02

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
