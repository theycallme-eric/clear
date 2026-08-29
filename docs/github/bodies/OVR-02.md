> **OVR-02** · Layer `api` · Milestone `M3` · Carry-over `new`

**Spec:** `docs/specs/OVR-01_progressive-overload.md` (Generation Impact, slice b)

The AI never does arithmetic: code injects a TRAINING HISTORY block pre-generation, code fills suggested weights post-generation.

## Acceptance
- [ ] TRAINING HISTORY block injected (≤40 most-recent anchored exercises) with SESSION DIRECTIVE and CONDITIONING TREND
- [ ] Prompt forbids the model from computing weights; post-generation fill writes `weight_suggested`; model-narrated weights in cues are caught by validation
- [ ] `deload` / `re_entry` directives change set counts and cue language per spec
- [ ] Spec open-question 6 decided and recorded (anchor numbers in prompt vs labels-only) — implementation matches the decision
- [ ] `prompt_version` bumped; `contract_version` unchanged unless the output shape moves

---

**Depends on:** OVR-01b, GEN-02b
**Blocks:** OVR-04

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
