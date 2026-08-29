> **GEN-02c** · Layer `api` · Milestone `M1` · Carry-over `rebuild`

> **Part of GEN-02.** GEN-06 checks duration plausibility — a validation rule. As one node it waited on prompt authoring and a live Claude call it has nothing to do with. Retrieval is also pure SQL and testable against the seeded library with no model in the loop at all, which makes it the piece most worth landing first.

**Spec:** `specs/generation/GENERATION_CONTRACT.md` §6–8 · `specs/generation/WORKED_EXAMPLE.md`

The deterministic half after the model: reject what the database would reject, record what cannot be enforced, fill in the facts, write it down.

## Acceptance
- [ ] **Hard checks mirror the schema's CHECK constraints** — every rule that gates has a constraint it corresponds to, and the correspondence is listed. A hard check with no matching constraint is a bug in one of the two
- [ ] Claude **cannot** return an exercise or equipment outside the candidate set — validated explicitly, not merely made unlikely by the prompt
- [ ] Soft checks (ratios, warmup coverage, variety, repetition) are **recorded and surfaced, never gating**. A soft rule that rejects is a hard rule with a soft name
- [ ] Facts hydrated by ID **after** validation: name, equipment display names, cues, regression
- [ ] Claude's duration estimate is stored as diagnostic only and is never read as authoritative (D5)
- [ ] Persistence writes sessions → sections → blocks → exercises in one transaction; a failure leaves no partial workout
- [ ] `prompt_version` and `contract_version` stamped on every session
- [ ] One live run per goal preset returns a contract-valid workout honouring section scaling

---

**Depends on:** GEN-02b, DATA-01d
**Blocks:** GEN-03, GEN-06, REV-02

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
