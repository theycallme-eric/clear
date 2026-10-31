# CLEAR project instructions

Before material work, read `docs/process/AGENT_PLAYBOOK.md` and `PROJECT_MAP.md`. Select work from
the GitHub ready queue; use one issue, one branch, and one pull request. Do not implement a blocked
issue or silently widen an issue's scope.

Run `python3 scripts/dag-ready.py` instead of choosing from the issue list manually. When the user
asks to run the DAG, automate the build, work unattended, or continue the rebuild, use the project
skill `clear-dag-runner` and its canonical loop in `docs/process/DAG_RUNNER.md`.

An approved ready issue authorizes routine implementation through a tested, pushed pull request.
Do not repeatedly ask for permission to branch, edit, verify, commit, push, or open that PR.

## UI work

Before UI work, read `docs/design/library/README.md`. Search the generated
`docs/design/library/COMPONENTS.md`, `src/dev/gallery-registry.tsx` and `src/ui/`
for an existing pattern before building one. Reuse shared owners and variables;
record a gap using the README when they do not fit. Render real components in
the gallery and check affected screens. Update the register and regenerate its
index when examples change. `docs/design/library/PLAN.md` is the active delivery
checklist; older detailed research is reference, not extra shipping gates.
For motion, follow the README's motion rule: inherit shared behavior, name the
trigger and reduced-motion result, and preview a missing pattern before building it.
The CLEAR repository/gallery is the current authoring authority. Claude Design
maintains older files; its export is not a gate for new app-owned shared work.
Keep the historical 0.14.3 import intact. See ATOMIC.md §1.2 for this boundary.

## Process journal

For every material work session, maintain `docs/journal/YYYY-MM-DD.md` at meaningful checkpoints
and before handoff. A question-only or read-only orientation session does not require an entry.

Record:

- the intended outcome and issue, branch, or pull request;
- local changes and changes made in GitHub or another external service;
- failures, misleading signals, and their actual causes;
- corrections made, especially prevention of recurrence;
- verification performed and exact results;
- unresolved questions, assumptions, and the next safe action.

Prefer concise facts over a transcript. Never record secrets, tokens, one-time codes, private email
contents, or personal data. Commit relevant journal updates with the work they describe. The full
policy is in `docs/process/AGENT_PLAYBOOK.md` §10.
