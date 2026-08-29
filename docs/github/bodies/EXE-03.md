> **EXE-03** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `docs/specs/structures/emom-clarity.md`, `docs/specs/structures/superset-circuit-clarity.md`, `docs/specs/structures/quickfix-amrap-round-label.md`

Circuits (3+ exercises × rounds) and EMOM with the clarity spec built in: minute indicators, active/inactive highlighting, ODD/EVEN MIN labels for alternating EMOMs.

## Acceptance
- [ ] Renders from the block: rounds, timer type, timer seconds, and shared rest all read from `workout_blocks`
- [ ] EMOM minute boundary visibly flips active work; remainder reads as rest
- [ ] Alternating EMOMs label ODD/EVEN MIN per spec
- [ ] Circuit tracks current round and position within it; round advance is one tap
- [ ] Shared rest is honored **once per round**, not once per exercise
- [ ] Outcome writes `block_results` — `minutes_completed` for EMOM, `rounds_completed` for circuits
- [ ] Timed structure state survives refresh (via SES-01)

---

**Depends on:** EXE-01
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
