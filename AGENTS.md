# CLEAR project instructions

Before material work, read `docs/process/AGENT_PLAYBOOK.md` and `PROJECT_MAP.md`. Select work from
the GitHub ready queue; use one issue, one branch, and one pull request. Do not implement a blocked
issue or silently widen an issue's scope.

Run `python3 scripts/dag-ready.py` instead of choosing from the issue list manually. When the user
asks to run the DAG, automate the build, work unattended, or continue the rebuild, use the project
skill `clear-dag-runner` and its canonical loop in `docs/process/DAG_RUNNER.md`.

An approved ready issue authorizes routine implementation through a tested, pushed pull request.
Do not repeatedly ask for permission to branch, edit, verify, commit, push, or open that PR.

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
