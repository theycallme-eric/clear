# CLEAR DAG runner

This is the canonical operating loop for a coding agent working CLEAR. Claude Code and Codex have
thin project-local skills that point here so the behavior does not drift between tools.

## Default autonomy

Once Eric selects an approved, dependency-ready issue—or asks the runner to select one—the issue's
acceptance criteria authorize the normal implementation loop. Proceed without asking again for each
reversible step: create the branch, edit in scope, install locked dependencies, run checks, update the
journal and issue, commit, push, and open the pull request. A tool may still display a platform
permission prompt, but that is not a new product decision.

Ask Eric only at a stop gate below. In particular, do not turn synchronization, ordinary GitHub
reads/writes, or “which ready issue is next?” into repeated handoffs. Pull-request merge remains a
review gate unless Eric establishes an explicit protected auto-merge policy.

## Start

1. Read `CLAUDE.md` or `AGENTS.md`, `PROJECT_MAP.md`, and this document.
2. Confirm the working tree is clean. Preserve and report work you did not create.
3. Synchronize safely: fetch, switch to `main`, and fast-forward only. Never reset or discard local
   work to make synchronization succeed.
4. Run `python3 scripts/dag-ready.py`. It cross-checks two live GitHub readiness signals, ranks the
   queue, and excludes ready issues already tied to an open pull request.
5. Take the recommendation unless the user named another **available ready** issue. If the command
   refuses to recommend work, fix or report the graph/query problem; do not choose by intuition.

## Load one issue

1. Read the issue **and its comments**. Comments can contain owner decisions made after the frozen
   requirements baseline.
2. Read only the issue's `Spec:` references, then `PROJECT_MAP.md`.
3. For any UI issue, also read `docs/specs/design/ATOMIC.md`; for a screen, read `docs/specs/IA.md`.
4. Convert every acceptance box into a verification checklist before editing.
5. Create a branch named from the issue ID and intent. One issue gets one branch and one pull request.

## Build and verify

- Implement only the selected issue. If another issue's output is required, treat that as a graph
  defect: comment on the issue, stop that issue, and select another available ready issue.
- Test at the narrowest useful level while working, then run every repository gate relevant to the
  changed surface. Record exact commands and results in the process journal.
- Update `PROJECT_MAP.md` when a directory boundary or data flow changes.
- Update `docs/journal/YYYY-MM-DD.md` at meaningful checkpoints and before handoff. Include failures,
  causes, corrections, external changes, verification, unresolved items, and the next safe action.
- Never put tokens, secret values, one-time codes, personal data, or private contents in code, logs,
  issue comments, pull requests, or the journal.

## Publish and continue

1. Review the complete diff and confirm every acceptance box is demonstrably satisfied.
2. Commit and push the issue branch.
3. Open one pull request whose body contains `Closes #N`, the acceptance evidence, verification
   results, and any human checks still needed.
4. Do not mark criteria complete without evidence. Do not close the issue manually; the merge does it.
5. Do not auto-merge by default. A user must explicitly authorize an auto-merge policy, and CI must
   already protect the branch before an agent may use it.
6. In **single-issue mode**, hand off the pull request and stop.
7. In **runway mode**, once the branch is clean and pushed, return to synchronized `main`, rerun the
   ready command, and take another available issue that does not depend on the unmerged work. Continue
   until no available issue remains or a gate needs the user.

## Stop gates

Pause that issue and clearly tell the user what is needed when any of these occurs:

- a browser login, external-service authorization, project creation, billing choice, or secret entry;
- a destructive or irreversible operation that was not explicitly authorized;
- acceptance criteria conflict with reality or require widening scope;
- required access, professional content judgment, or product judgment is missing;
- CI/review/merge is the only remaining action and no explicit auto-merge policy exists.

When one issue hits a gate, runway mode may continue on a different available ready issue. Never route
around a gate by weakening the acceptance criteria, inventing data, exposing a secret, or implementing
a blocked dependent.

See `docs/process/HUMAN_GATES.md` for known service and credential gates.
