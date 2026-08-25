> **CORE-01** · Layer `state` · Milestone `M0` · Carry-over `new`

**Spec:** — self-contained; acceptance criteria are the full specification

Kills the stringly-typed half of D2. A typed `AppError` union (auth / network / validation / generation / persistence), Result helpers, a request-ID generator attached to every edge-function call, and an error→user-message map.

## Acceptance
- [ ] Every `AppError` carries `code`, `requestId` (where applicable), and a user-safe message
- [ ] Unit tests cover the error→message mapping
- [ ] No `throw "string"` / `catch (e) { e.message }` patterns — enforced by convention doc + review checklist
- [ ] `requestId` format documented; the same ID is sent to and returned by edge functions

---

**Depends on:** ENV-01
**Blocks:** CORE-02, CORE-04, AUTH-03, GEN-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
