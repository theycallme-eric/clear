> **ENV-02** · Layer `infra` · Milestone `M0` · Carry-over `new`

GitHub Actions on every PR: typecheck, lint, test, build. Branch protection makes green checks a merge requirement on `main`.

## Acceptance

- [ ] A PR containing a type error cannot be merged
- [ ] A clean PR shows all four checks green in <5 min
- [ ] CI also greps and fails on raw `console.*` usage in `src/` (see CORE-02)

---

**Depends on:** ENV-01
**Blocks:** ENV-05

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
