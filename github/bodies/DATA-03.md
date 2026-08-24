> **DATA-03** · Layer `data` · Milestone `M0` · Carry-over `rebuild`

`supabase gen types` output committed with a regen script; thin typed client in `lib/supabase.ts`. No `any` escapes the data layer.

## Acceptance

- [ ] `npm run gen:types` regenerates types against the new enums (`session_focus`, `movement_pattern`, `target_kind`, `revision_status`, `execution_status`, `distance_unit`); drift fails CI note in DEVELOPMENT.md
- [ ] Client exports typed table/RPC helpers only — no raw untyped calls elsewhere in `src/`
- [ ] A sample typed query and RPC call compile and run in a test

---

**Depends on:** ENV-01, DATA-01
**Blocks:** CORE-03, AUTH-01, AUTH-03, SES-01, HIST-01

<sub>Generated from `requirements/REQUIREMENTS.md` v0.4 — edit the requirement, not the issue.</sub>
