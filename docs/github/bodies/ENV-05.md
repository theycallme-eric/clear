> **ENV-05** · Layer `infra` · Milestone `M0` · Carry-over `new`

**Spec:** — self-contained; acceptance criteria are the full specification

Scheduled GitHub Action pings the database twice weekly so the free-tier project never pauses. Delete if the project moves to a paid plan.

## Acceptance
- [ ] Action runs green on schedule and via manual dispatch
- [ ] Ping is a harmless read (no writes, no auth secrets in logs)
- [ ] README notes the action and when to remove it

---

**Depends on:** ENV-02, DATA-01a
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
