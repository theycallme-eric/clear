> **CORE-02** · Layer `state` · Milestone `M0` · Carry-over `rebuild`

**Spec:** — self-contained; acceptance criteria are the full specification

Kills D3 at the tooling level. Leveled logger with scoped children for client and edge runtimes. Redaction is structural: headers, tokens, and emails cannot be logged.

## Acceptance
- [ ] Logger API accepts objects, never raw header maps; a denylist test proves `authorization`/`apikey` values never appear in output
- [ ] Edge variant emits one structured line per request: requestId, route, status, duration — and nothing from headers
- [ ] Raw `console.*` in `src/` fails CI (grep gate from ENV-02)

---

**Depends on:** ENV-01, CORE-01
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
