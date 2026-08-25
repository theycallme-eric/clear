> **FAV-02** · Layer `ui` · Milestone `M2` · Carry-over `new`

**Spec:** `specs/favorites-v2.md`

Per the v2 spec: personal bests (min completion time for For Time, max rounds for AMRAP), "last time" weight display on repeats, completion history per favorite.

## Acceptance
- [ ] PB updates only when the new result beats the stored best; PB badge on the favorite
- [ ] Repeating a favorite pre-fills each exercise with last-completion weights
- [ ] Completion history lists date + headline result per run
- [ ] **Comparison surface across completions of the same favorite** — this run against previous runs, with the delta made obvious (time faster/slower, rounds up/down, weight moved). Each completion remains its own session; the card is the thread between them
- [ ] Comparison suppresses competitive framing during a deload (per OVR-04) — show the history, drop the "beat your time" language
- [ ] Spec'd v2 behaviors all present or explicitly deferred with a note

---

**Depends on:** FAV-01, EXE-04a, EXE-04b, EXE-04c
**Blocks:** —

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
