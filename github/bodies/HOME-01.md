> **HOME-01** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `specs/IA.md` — Home screen contract; all four states load-bearing

The daily entry point: Generate + Quick Start actions, recent 3 workouts, incomplete-session resumption prompt, 7-day week strip (rendering session data; full streak logic is HOME-02).

## Acceptance
- [ ] Incomplete session → resumption prompt → resumes execution at the right position
- [ ] Quick Start generates immediately using the last session's goal/anchor/intensity/location
- [ ] Quick Start is **hidden entirely until at least one completed workout exists** — never shown disabled, never shown falling back to defaults
- [ ] Recent 3 link to history detail
- [ ] Week strip renders workout/rest/upcoming states from data

---

## 11. M2 — Parity + planned near-term

The gate: the old app is fully retired. Everything it did, this does — plus the near-term specs (favorites v2) that were designed but never shipped.

---

**Depends on:** HIST-01, SES-01c, GEN-03, DS-04a
**Blocks:** FAV-01, HOME-02, HOME-03

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
