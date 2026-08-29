> **GEN-03** · Layer `state` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `specs/generation/GENERATION_CONTRACT.md` §9 · `specs/IA.md` — Generate and Loading screen contracts

React Query mutation with pending / success / typed-error states. Kills D2's silent fallback: there is no mock workout in this codebase.

## Acceptance
- [ ] Network killed mid-generate → ErrorState with message, requestId, retry — app never shows fabricated content
- [ ] Grep gate: no mock/demo workout fixtures outside test files
- [ ] Double-submit prevented; success hands the validated workout to review
- [ ] Response re-parsed with CORE-03 schema on the client (defense in depth)

---

**Depends on:** GEN-02c, CORE-03, AUTH-03
**Blocks:** GEN-04, GEN-05, REV-01, HOME-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
