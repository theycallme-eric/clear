# CLEAR 0.14.3 — intake baseline (TASK-001, #347)

The coordination audit taken before any 0.14.3 visual edit. It records where the application and
its backend stood, who owns each shared resource during the migration, and what this record could
not confirm. Nothing here changes runtime.

| File | Records |
| ---- | ------- |
| `intake-baseline.json` | Moving main SHA, source package identity and hash, recovery 011 completion proof, PR #287 disposition, the no-overlap boundary |
| `backend-baseline.json` | The deployed backend release identity recovery 011 completed with |
| `route-state-inventory.json` | Every required screen, its source, its suites, and the states and viewports the before-state must cover |
| `shared-file-ownership.json` | The serialized foundation that owns each shared file, and the rules route and evidence tasks follow |

`src/test/design-0143-intake-baseline.test.ts` holds these four files to their shape.

## What was read, and what was not

Read in the workspace on 2026-10-03: main at `f83ddc9770d2f013f65b0e5140ada09ca84b7583` (HEAD and
the local `origin/main` ref agree), the committed recovery 011 release records, the installed
0.9.7 package, the 0.14.3 evidence package, and the router's required-route list.

Not read, because the workspace declined the command each time:

| Check | Command declined | Consequence |
| ----- | ---------------- | ----------- |
| Main is still current | `git fetch origin main` | The SHA is the workspace's, not a fresh remote read |
| PR #287 state, head and changed files | every `gh` read | Disposition is recorded as policy; file-level overlap is unconfirmed |
| Recovery 011 task identities, run state, controller idleness (PRE-001) | `check-readiness.py backend` | Completion rests on the committed, protected-merged release records |
| E2E configuration readiness (PRE-002) | `check-readiness.py e2e` | The focused browser check ran and passed against the owned local server |
| Archive SHA-256 | the archive is not in the evidence snapshot | The hash is the owner brief's declared value |

Each JSON file marks these with `liveRecheck: "not_performed …"`. That marker is not a pass. The
PR #287 and PRE-001 reads are owed before the first visual edit.

## Dispositions

- **Recovery 011** is complete on main: TASK-028's closeout merged as #394, both owner steps are
  recorded pass, every exit criterion is linked. Its state, heartbeat, database and Runner attempts
  were not touched, and no second controller was started. Its TASK-009 to TASK-012 behavior stays.
- **PR #287** is preserved untouched — never auto-merged, closed or discarded. It is not visual
  authority: 0.14.3 components and CSS supersede its 0.9.7-era visuals, resource by resource, by
  the foundation that owns the resource. Behavioral or accessibility work it carries is ported, not
  lost.
- **The historical UI hold** of recovery 011 is closed history. It is not a prerequisite, and no
  passcode gates a 012 task.
- **Approval.** Graph approval made this task executable. It is distinct from design authority
  (the owner's 0.14.3 selection) and from review-only sync.
- **Before-state screenshots** are TASK-040's, captured with its reusable harness before the
  package import. This directory holds the source inventory only.
