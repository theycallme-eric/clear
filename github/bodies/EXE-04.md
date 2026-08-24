> **EXE-04** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

The restructure specs built in: rep scheme shown once; ladder rung selector on cap-hit; distinct completion paths (finished under cap vs cap reached); AMRAP partial-round capture. Outcomes write `block_results`.

**Spec:** `specs/structures/amrap-logging.md`, `specs/structures/ladder-for-time.md`, `specs/structures/quickfix-ladder-rung-label.md`

## Acceptance

- [ ] Ladder rungs render from `target_sequence` as ordered targets — the renderer indexes them, nothing parses a string
- [ ] For Time: finish-under-cap and cap-reached paths both reachable, visually distinct
- [ ] Cap-hit on a ladder prompts rung selection; `highest_rung` persisted
- [ ] AMRAP logs completed rounds + partial round reps
- [ ] `block_results` row correct for each outcome: `elapsed_seconds` and `completed_under_cap` for For Time, `rounds_completed` and `partial_round_reps` for AMRAP
- [ ] Section perceived effort (1–10) captured at block completion
- [ ] Red/urgency styling only near time cap — per color doctrine
- [ ] Section completion also captures perceived effort (1–10), AMRAP partial reps, and EMOM minutes completed — DATA-01 provides the columns; this builds OVR-03's history from day one

---

**Depends on:** EXE-01
**Blocks:** FAV-02, OVR-03

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
