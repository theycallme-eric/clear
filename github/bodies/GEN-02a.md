> **GEN-02a** · Layer `api` · Milestone `M1` · Carry-over `rebuild`

> **Part of GEN-02.** GEN-06 checks duration plausibility — a validation rule. As one node it waited on prompt authoring and a live Claude call it has nothing to do with. Retrieval is also pure SQL and testable against the seeded library with no model in the loop at all, which makes it the piece most worth landing first.

**Spec:** `specs/generation/GENERATION_CONTRACT.md` §2–3

Eligibility resolves in SQL **before** any prompt exists. Rules currently written as prose become constraints applied to Claude's input, so it cannot select an ineligible exercise because it never sees one.

## Acceptance
- [ ] Candidate retrieval runs per section: focus→pattern join via `exercise_patterns`, equipment intersection with the resolved location, user exclusions, section eligibility
- [ ] `usable_equipment` computed per candidate, so a candidate arrives with the equipment it may actually be performed with
- [ ] Runs as SQL with **no model call** — testable, deterministic, and fast enough to be inside the request rather than cached around it
- [ ] Every goal preset produces a non-empty candidate set for a realistically-equipped location, and an empty set is a typed error rather than an empty workout
- [ ] Active recovery resolves to warmup/mobility/cooldown candidates only

---

**Depends on:** DATA-02, DATA-03
**Blocks:** GEN-02b

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
