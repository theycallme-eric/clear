# CLEAR rebuild status

This file previously preserved a pre-migration checkpoint and had become stale: it described the
repository as private, the GitHub migration as pending, and ENV-01 as unmerged.

Use the following sources instead:

- [`docs/process/IMPLEMENTATION_PLAN.md`](process/IMPLEMENTATION_PLAN.md) — reconciled human-readable
  roadmap, current snapshot, PWA distance, backend/key gates, and complete issue inventory;
- GitHub Issues — live work and dependency truth;
- `python3 scripts/dag-ready.py` — current verified ready queue;
- [`docs/DAG.md`](DAG.md) — generated structural graph for the frozen 71-node baseline;
- [`docs/journal/`](journal/) — chronological decisions, failures, and corrections.

Do not turn this file back into a manually maintained second backlog.
