> **REV-01** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `docs/specs/IA.md` — Review screen contract; three entry paths

Pre-workout briefing: sections and exercises, estimated duration, intensity/anchor/goal header, Start Workout, Regenerate (with discard confirm).

## Acceptance
- [ ] Renders every structure type and rep scheme correctly from a schema-valid sample
- [ ] Regenerate confirms before discarding; Start hands off to SES-01
- [ ] Duration shown to the user is the **effective target** — the number generation was asked to hit. The computed plausibility estimate and Claude's diagnostic estimate are internal and never surfaced

---

**Depends on:** GEN-03, DS-04a, DS-05
**Blocks:** REV-03, OVR-01c

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
