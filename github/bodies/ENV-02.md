> **ENV-02** · Layer `infra` · Milestone `M0` · Carry-over `new`

**Spec:** — self-contained; acceptance criteria are the full specification

GitHub Actions on every PR: typecheck, lint, test, build. Branch protection makes green checks a merge requirement on `main`.

## Acceptance
- [ ] A PR containing a type error cannot be merged
- [ ] A clean PR shows all four checks green in <5 min
- [ ] CI also greps and fails on raw `console.*` usage in `src/` (see CORE-02)
- [ ] CI runs `python3 scripts/gen-issues.py --check` against the docs and fails on a dangling dependency or a cycle — the requirements graph is verified by the same pipeline as the code

---

**Depends on:** ENV-01
**Blocks:** ENV-05, ENV-07

<sub>Generated from `requirements/REQUIREMENTS.md` v0.6 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
