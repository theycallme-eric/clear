> **GEN-04** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

Inputs: goal selector (first, no default, per v3 delta), intensity slider with goal-driven clamp cascade, anchor, location/equipment override, time target (default 45), optional notes.

**Spec:** `specs/generation/generation-prompt-v3-notes.md` Part 2 (goal selector delta)

## Acceptance

- [ ] Generate CTA disabled until goal + anchor selected
- [ ] Selecting a goal clamps the intensity slider to its valid range
- [ ] Payload validates against the CORE-03 request schema before send
- [ ] Defaults prefill from profile (goal, default location); mobile-first layout

---

**Depends on:** GEN-03, DS-04, AUTH-03
**Blocks:** HOME-03, OVR-04

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
