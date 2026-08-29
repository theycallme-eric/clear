> **EXE-02** · Layer `ui` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `docs/specs/structures/superset-circuit-clarity.md`

Standard and superset blocks. Per-set logging (weight, reps, RPE, warmup flag) writing `exercise_set_logs` live, and last-time prefill from prior sessions.

## Acceptance
- [ ] Renders from the **structured prescription** — no string parsing anywhere
- [ ] Each target kind displays correctly: fixed (`8`), range (`8–10`), sequence (`15-12-9-6-3` as ordered rungs), per-side, and distance with its unit
- [ ] Each logged set is a row written at log time — not batched at workout end
- [ ] Logs the modality actually prescribed: reps, duration, or distance
- [ ] Prefill shows previous weight/reps when history exists
- [ ] Superset alternation labeled clearly; rest comes from the **block**, prescribed after both movements

---

**Depends on:** EXE-01, DS-04a
**Blocks:** EXE-07, OVR-01a

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
