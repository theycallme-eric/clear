# CLEAR rebuild

Planning and control plane for the ground-up CLEAR workout app rebuild: approved requirements,
deep specs, the versioned design system, the dependency graph, and the process that directs build
agents. Application code begins with `ENV-01`; this repository deliberately starts with the plan.

**Repository:** `theycallme-eric/clear` (private)

**Baseline:** requirements v0.7 · 71 issues · 136 dependency edges · no cycles

**First ready issue:** `ENV-01`

## Start here

1. `CLAUDE.md` — repository instructions.
2. `process/AGENT_PLAYBOOK.md` — how work is selected, scoped, reviewed, and merged.
3. The assigned GitHub issue — the live unit of work after migration.
4. The issue's referenced specs, then `PROJECT_MAP.md`, `specs/design/ATOMIC.md` for UI work,
   and the relevant screen contract in `specs/IA.md`.

## Repository map

| Path | Purpose |
|---|---|
| `requirements/REQUIREMENTS.md` | Frozen v0.7 issue baseline; one requirement per GitHub issue |
| `specs/` | Product, data, generation, screen, and structure contracts |
| `design/exports/clear-design-system-0.5.0/` | Approved unpacked design-system artifact |
| `design/CHANGELOG.md` | Design import history and rationale |
| `DAG.md` | Generated dependency graph and critical-path analysis |
| `process/AGENT_PLAYBOOK.md` | Operational build loop |
| `github/` | Re-runnable label, milestone, issue, and dependency migration scripts |
| `journal/` | Dated decisions and audit notes |
| `reference/` | Preserved historical material; read-only orientation, never a dependency |

## Source-of-truth handoff

Before issue migration, `requirements/REQUIREMENTS.md` is authoritative. After migration, GitHub
issues are the live build truth and v0.7 remains the frozen baseline. If implementation proves a
requirement wrong, comment on its issue and open a deliberate follow-up; do not silently widen the
current ticket or edit the baseline to conceal the change.

## Graph checks

```sh
python3 scripts/gen-issues.py --check
python3 scripts/gen-dag.py
```

Expected baseline: 71 requirements, 136 edges, no cycles, and only `ENV-01` ready.

## Product direction

The M1 gate is the complete phone-sized loop:

`Home → Generate → Loading → Review → Workout → Summary → Home`

Installability is `PWA-01` in M2 after the deployed shell and design substrate exist. It adds the
manifest, icons, theme metadata, iOS metadata, and a minimal shell service worker. True offline
data and generation are intentionally separate M3 work.
