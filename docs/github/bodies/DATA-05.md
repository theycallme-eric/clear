> **DATA-05** · Layer `data` · Milestone `M0` · Carry-over `new`

**Spec:** `docs/specs/DATA_MODEL.md` §5

Explicit exclusions the user sets for themselves. **CLEAR does not model injuries** — three scopes, all enforceable against catalog data that already exists.

## Acceptance
- [ ] Three scopes supported: exercise, movement pattern, equipment. **No impact scope** until the catalog can enforce it
- [ ] `exclude` filters deterministically in the eligibility query, before Claude composes
- [ ] `applies_to_session_id` enforced — a session-scoped exclusion **does not** apply to later sessions
- [ ] Equipment exclusion removes only the excluded option; an exercise usable with dumbbells survives a barbell exclusion, and the candidate passed to Claude offers dumbbells only
- [ ] Free text is stored and never parsed — no constraint is ever inferred from a note
- [ ] `avoid` and `prefer_not` persist and reach Claude as context; **the UI exposes `exclude` only** until a ranking layer consumes them

---

**Depends on:** DATA-01b
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
