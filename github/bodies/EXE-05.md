> **EXE-05** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `specs/IA.md` — Workout screen contract · `specs/DATA_MODEL.md` §6 rest fields

Rest countdown bar (auto-start where prescribed, skip, +time) and the expandable per-exercise panel: coaching cues, regression suggestion, notes.

## Acceptance
- [ ] Rest auto-starts after set completion when the prescription specifies it — read from `rest_seconds` on the exercise, or `round_rest_seconds` on the block; skip and extend work
- [ ] Cues and regression pulled from the library definition
- [ ] Exercise notes persist to the exercise row
- [ ] Timer accurate after backgrounding (wall-clock)

---

**Depends on:** EXE-01, DS-05
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
