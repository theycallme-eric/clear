> **ENV-05** · Layer `infra` · Milestone `M0` · Carry-over `new`

Scheduled GitHub Action pings the database twice weekly so the free-tier project never pauses. Delete if the project moves to a paid plan.

## Acceptance

- [ ] Action runs green on schedule and via manual dispatch
- [ ] Ping is a harmless read (no writes, no auth secrets in logs)
- [ ] README notes the action and when to remove it

---

**Depends on:** ENV-02, DATA-01
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
