> **OVR-03** · Layer `ui` · Milestone `M3` · Carry-over `new`

Normalized conditioning scores, like-for-like comparison only on identical repeats, and the density nudge for freshly generated conditioning.

**Spec:** `specs/OVR-01_progressive-overload.md` (§3, slice c)

## Acceptance

- [ ] Normalized score stored per timed section (reps/min for AMRAP + For Time, completion ratio for EMOM, rung for ladders)
- [ ] Comparison UI appears only on identical repeats (favorites); never across differently-generated pieces
- [ ] Density nudge (ready / hold / backing_off over last 3 conditioning sections at intensity ≥5) feeds generation
- [ ] Consumes the section-effort capture EXE-04 has been writing since M1

---

**Depends on:** OVR-01, EXE-04
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
