> **ENV-01** · Layer `infra` · Milestone `M0` · Carry-over `new`

**Spec:** — self-contained; acceptance criteria are the full specification

New repo `clear`. Vite + React 19 + TypeScript strict, ESLint, Vitest, router shell with 404, folder skeleton, README quickstart.

## Acceptance
- [ ] `npm run dev` serves the app shell; `npm test`, `npm run lint`, `tsc --noEmit` all pass on a fresh clone
- [ ] Router renders a shell route and a 404 fallback
- [ ] No CSS frameworks or component libraries in `package.json`
- [ ] README documents the 3-command start
- [ ] **`PROJECT_MAP.md` exists** — directory layout, the boundaries (data layer, state, UI, design system), and where a new file of each kind belongs. It is short and it is honest about being a stub. Every subsequent issue reads it before writing a file and updates it when the architecture changes (`docs/process/AGENT_PLAYBOOK.md` §3, §4)
- [ ] `docs/process/AGENT_PLAYBOOK.md` and `docs/DAG.md` are carried into the repo alongside the specs — the graph directs the build, so it ships with it

---

**Depends on:** —
**Blocks:** ENV-02, ENV-03, ENV-04, ENV-06, DATA-01a, DATA-03, CORE-01, CORE-02, CORE-03, CORE-05, AUTH-01, DS-01

<sub>Generated from `docs/requirements/REQUIREMENTS.md` v0.7 by `scripts/gen-issues.py` — edit the requirement, not the issue.</sub>
