> **HOME-01** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

The daily entry point: Generate + Quick Start actions, recent 3 workouts, incomplete-session resumption prompt, 7-day week strip (rendering session data; full streak logic is HOME-02).

## Acceptance

- [ ] Incomplete session → resumption prompt → resumes execution at the right position
- [ ] Quick Start generates immediately using the last session's goal/anchor/intensity/location
- [ ] Quick Start is **hidden entirely until at least one completed workout exists** — never shown disabled, never shown falling back to defaults
- [ ] Recent 3 link to history detail
- [ ] Week strip renders workout/rest/upcoming states from data

---

**Depends on:** HIST-01, SES-01, GEN-03, DS-03
**Blocks:** FAV-01, HOME-02, HOME-03

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
