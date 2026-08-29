> **DATA-03** · Layer `data` · Milestone `M0` · Carry-over `rebuild`

**Spec:** `docs/specs/DATA_MODEL.md` §10 enums

`supabase gen types` output committed with a regen script; thin typed client in `lib/supabase.ts`. No `any` escapes the data layer.

## Acceptance
- [ ] `npm run gen:types` regenerates types against the new enums (`session_focus`, `movement_pattern`, `target_kind`, `revision_status`, `execution_status`, `distance_unit`); drift fails CI note in DEVELOPMENT.md
- [ ] Client exports typed table/RPC helpers only — no raw untyped calls elsewhere in `src/`
- [ ] A sample typed query and RPC call compile and run in a test

---

**Depends on:** ENV-01, DATA-01d
**Blocks:** CORE-03, AUTH-01, AUTH-03, GEN-02a, SES-01a, HIST-01

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
