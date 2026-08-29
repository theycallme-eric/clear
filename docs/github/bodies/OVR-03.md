> **OVR-03** · Layer `ui` · Milestone `M3` · Carry-over `new`

**Spec:** `docs/specs/OVR-01_progressive-overload.md` (§3, slice c)

Normalized conditioning scores, like-for-like comparison only on identical repeats, and the density nudge for freshly generated conditioning.

## Acceptance
- [ ] Normalized score stored per timed section (reps/min for AMRAP + For Time, completion ratio for EMOM, rung for ladders)
- [ ] Comparison UI appears only on identical repeats (favorites); never across differently-generated pieces
- [ ] Density nudge (ready / hold / backing_off over last 3 conditioning sections at intensity ≥5) feeds generation
- [ ] Consumes the section-effort capture EXE-04 has been writing since M1

---

**Depends on:** OVR-01b, EXE-04a, EXE-04b, EXE-04c
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
