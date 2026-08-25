> **GEN-01** · Layer `api` · Milestone `M1` · Carry-over `rebuild`

**Spec:** `specs/generation/GENERATION_CONTRACT.md` §9 errors

The shared shell for all AI functions: auth verification, zod request parsing, CORS, typed error responses `{ code, message, requestId }`, structured logging. Kills D3 at the function level.

## Acceptance
- [ ] Unauthenticated → 401 typed; malformed body → 400 with zod issue paths
- [ ] Every response (success or error) echoes the client's requestId
- [ ] A test asserts the words `authorization`/`apikey` never appear in log output
- [ ] Envelope is a reusable module — `generate-section` (REV-02) adopts it unchanged

---

**Depends on:** DATA-01c, CORE-01, CORE-03
**Blocks:** GEN-02b

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
