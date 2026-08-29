> **REV-03** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `docs/specs/generation/exercise-swap.md`, `docs/specs/generation/exercise-swap-plan.md`

Per-slot swap with up-to-3 history and undo; unit swap for blocks; nudge to regenerate the whole workout after a slot's third swap.

## Acceptance
- [ ] Swap history bounded at 3 per slot; undo restores the exact prior exercise
- [ ] Unit swap replaces the block atomically in review state
- [ ] Third swap on a slot surfaces the regenerate nudge
- [ ] Swap errors use ErrorState — review content never silently changes
- [ ] Every accepted swap is persisted as a revision with lineage before the workout starts (D6)

---

**Depends on:** REV-01, REV-02
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
