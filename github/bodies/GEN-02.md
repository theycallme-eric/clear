> **GEN-02** · Layer `api` · Milestone `M1` · Carry-over `rebuild`

The pipeline becomes resolve → retrieve → **compose** → validate → hydrate → persist. Claude occupies exactly one step, the one requiring judgment; everything on either side is deterministic. Eligibility resolves in SQL **before** the prompt is built, so rules currently described in prose become constraints applied to Claude's input. It cannot select an ineligible exercise because it never sees one.

**Spec:** `specs/generation/GENERATION_CONTRACT.md`

## Acceptance

- [ ] Candidate retrieval runs per section: focus→pattern join, equipment intersection, user exclusions, section eligibility. `usable_equipment` computed per candidate so Claude only sees equipment it may choose
- [ ] One live run per goal preset returns a contract-valid workout honoring section scaling
- [ ] Claude **cannot** return an exercise or equipment outside the candidate set — validated, and structurally unlikely since candidates are all it receives
- [ ] Facts hydrated by ID after validation: name, equipment display names, cues, regression. Claude returns none of them
- [ ] Claude returns no authoritative duration; its estimate is stored as diagnostic only
- [ ] Hard checks mirror the schema's CHECK constraints; soft checks (ratios, warmup coverage, variety, repetition) are recorded and **never gate**
- [ ] Recorded invalid-response fixture triggers one retry, then a typed `generation` error — never a partial result
- [ ] Active-recovery preset produces warmup/mobility/cooldown only, intensity clamped 1–3
- [ ] `prompt_version` and `contract_version` stamped on every session
- [ ] Prompt is measurably shorter — the library dump and the enforceable rules are gone

---

**Depends on:** GEN-01, DATA-02, CORE-03
**Blocks:** GEN-03, GEN-06, REV-02, OVR-02

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
