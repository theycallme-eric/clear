> **GEN-03** · Layer `state` · Milestone `M1` · Carry-over `rebuild`

React Query mutation with pending / success / typed-error states. Kills D2's silent fallback: there is no mock workout in this codebase.

## Acceptance

- [ ] Network killed mid-generate → ErrorState with message, requestId, retry — app never shows fabricated content
- [ ] Grep gate: no mock/demo workout fixtures outside test files
- [ ] Double-submit prevented; success hands the validated workout to review
- [ ] Response re-parsed with CORE-03 schema on the client (defense in depth)

---

**Depends on:** GEN-02, CORE-03, AUTH-03
**Blocks:** GEN-04, GEN-05, REV-01, HOME-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
