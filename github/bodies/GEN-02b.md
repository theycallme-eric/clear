> **GEN-02b** · Layer `api` · Milestone `M1` · Carry-over `rebuild`

> **Part of GEN-02.** GEN-06 checks duration plausibility — a validation rule. As one node it waited on prompt authoring and a live Claude call it has nothing to do with. Retrieval is also pure SQL and testable against the seeded library with no model in the loop at all, which makes it the piece most worth landing first.

**Spec:** `specs/generation/GENERATION_CONTRACT.md` §4–5 · `specs/generation/PROMPT_v4.md`

Assemble the prompt from resolved candidates, call Claude, retry once on a malformed response.

## Acceptance
- [ ] The prompt contains the candidate set and the structural contract — **not** the exercise library and not rules already enforced upstream
- [ ] Prompt is measurably shorter than the old app's, and the measurement is recorded
- [ ] Claude returns structure and selection only — **no names, no equipment display strings, no cues, no regressions**, and no authoritative duration
- [ ] A recorded invalid-response fixture triggers exactly one retry, then a typed `generation` error — **never a partial result and never a mock workout** (D2)
- [ ] Intensity clamped 1–3 for active recovery before the prompt is built, not after
- [ ] `ANTHROPIC_API_KEY` is read from Supabase secrets and appears in no log line (CORE-02)

---

**Depends on:** GEN-02a, GEN-01, CORE-03
**Blocks:** GEN-02c, OVR-02

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
