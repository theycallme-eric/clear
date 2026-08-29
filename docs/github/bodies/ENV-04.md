> **ENV-04** · Layer `infra` · Milestone `M0` · Carry-over `new`

**Spec:** — self-contained; acceptance criteria are the full specification

Kills D4. Development runs against the hosted Supabase project — Docker appears nowhere in the loop. `npm run dev` preflights the database and explains problems in English.

## Acceptance
- [ ] Preflight pings Supabase before starting; on failure prints "project paused or unreachable — resume at <dashboard URL>" and exits — no stack trace
- [ ] Fresh clone → running app: clone, `cp .env.example .env` (+ fill), `npm run dev`
- [ ] The string "docker" appears nowhere in scripts or setup docs
- [ ] DEVELOPMENT.md covers the full flow including the paused-project recovery

---

**Depends on:** ENV-01, DATA-01b
**Blocks:** —

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
