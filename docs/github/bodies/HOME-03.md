> **HOME-03** · Layer `state` · Milestone `M2` · Carry-over `port`

**Spec:** `docs/specs/DATA_MODEL.md` §3 — pattern-level staleness

Surface `suggest_session_focus` (least-recently-trained) plus an intensity suggestion from recent history; prefill the generation screen, dismissible.

## Acceptance
- [ ] Suggestion matches least-recent-focus logic against fixture history
- [ ] Pattern-level staleness available — *"no hinge in 11 days"*, not only *"no lower body"*
- [ ] Tapping the suggestion opens generation prefilled; dismissing it leaves defaults
- [ ] No suggestion shown with insufficient history (empty state, not a guess)

---

**Depends on:** HOME-01, GEN-04
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
