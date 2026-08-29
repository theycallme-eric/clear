> **HIST-01** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `specs/IA.md` — History and Session Detail screen contracts

Chronological history with rest days marked; detail view shows sections, exercises, logged sets, structure results, mood, and notes. Query layer built for reuse (HOME-01 consumes it).

## Acceptance
- [ ] Detail renders all six structure types with their logged outcomes
- [ ] Set logs display weight/reps/RPE per set
- [ ] List bounded/paginated; rest days visually distinct
- [ ] Queries exported from a shared module, not screen-local

---

**Depends on:** DATA-03, AUTH-03, DS-04a
**Blocks:** HOME-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
