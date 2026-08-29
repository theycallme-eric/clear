> **GEN-06** · Layer `api` · Milestone `M1` · Carry-over `new`

**Spec:** `docs/specs/generation/GENERATION_CONTRACT.md` §7

Closes D5. The backend computes a rough duration estimate from the structured prescription, independently of Claude. **Purpose: reject workouts that clearly cannot fit — not predict completion time.**

Crude on purpose. Today's check compares a number Claude was told the answer to against the request, so it cannot fail; any independent computation is strictly better.

## Acceptance
- [ ] Estimate computed from blocks and prescriptions — Claude's `estimated_duration_mins` is **never** consulted for validation
- [ ] Allowances are **code constants**: fixed work-per-set, fixed transition. No metadata table, no per-exercise override, no tempo parsing
- [ ] Per-block rules: standard sums members; superset and circuit count shared rest **once per round**; EMOM and AMRAP use declared duration; For Time budgets the **full cap**
- [ ] Tolerance ~15–20%, generous by design
- [ ] A workout whose prescribed work and required rest clearly cannot fit is **rejected**, triggering one targeted retry that names the overrunning block. **Not trimmed** — deciding what to cut is composition judgment, which belongs to the model, not the validator
- [ ] Failure names the **block** that overran and by how much, so the retry is specific rather than a blind re-roll
- [ ] `computed_duration_mins` persisted alongside Claude's estimate, so the two can be compared later

---

**Depends on:** GEN-02c, CORE-03
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
