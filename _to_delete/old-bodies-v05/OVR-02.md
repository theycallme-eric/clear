> **OVR-02** · Layer `api` · Milestone `M3` · Carry-over `new`

The AI never does arithmetic: code injects a TRAINING HISTORY block pre-generation, code fills suggested weights post-generation.

**Spec:** `specs/OVR-01_progressive-overload.md` (Generation Impact, slice b)

## Acceptance

- [ ] TRAINING HISTORY block injected (≤40 most-recent anchored exercises) with SESSION DIRECTIVE and CONDITIONING TREND
- [ ] Prompt forbids the model from computing weights; post-generation fill writes `weight_suggested`; model-narrated weights in cues are caught by validation
- [ ] `deload` / `re_entry` directives change set counts and cue language per spec
- [ ] Spec open-question 6 decided and recorded (anchor numbers in prompt vs labels-only) — implementation matches the decision
- [ ] `prompt_version` bumped; `contract_version` unchanged unless the output shape moves

---

**Depends on:** OVR-01, GEN-02
**Blocks:** OVR-04

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
