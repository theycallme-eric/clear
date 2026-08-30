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

Before launching a long or unattended run, record the coding tool/vendor, exact model, visible or
headless execution mode, starting issue, allowed authority, merge policy, and how the user can
observe progress. Default to a user-visible interactive session. A headless session is acceptable
only when its lack of an attachable transcript is stated before launch.

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

1. Immediately before final verification or handoff, fetch current `origin/main` and integrate it
   into the issue branch. Rebase only unpublished local work; once a branch is pushed or has an open
   pull request, merge current `main` into it and never force-push. Resolve ordinary text conflicts by
   preserving both intents. If the behaviors conflict, treat that as a graph or requirement defect.
2. Rerun the issue's acceptance checks and every relevant repository gate against the **combined
   final tree**. Earlier green results from before synchronization are not final evidence. Recheck
   explicit invariants such as byte-identical vendor directories after all tests and support files
   are in their final locations.
3. Review the complete diff and confirm every acceptance box is demonstrably satisfied.
4. Commit and push the issue branch.
5. Open or update one pull request whose body contains `Closes #N`, the acceptance evidence,
   verification results, and any human checks still needed.
6. Monitor the pull request checks to a terminal result. A pushed branch is not a completed issue.
   If CI fails, repair it within the approved scope or record the requirement conflict on the issue
   with evidence and a recommendation before moving to independent work. Never leave a red PR
   unexplained or report local checks as though they were the complete GitHub job.
7. Take a fresh GitHub status snapshot after checks finish. "Ready" means the current head commit is
   mergeable, required checks are green, and active review threads are triaged—not merely that an
   earlier commit passed.
8. Do not mark criteria complete without evidence. Do not close the issue manually; the merge does it.
9. Do not auto-merge by default. A user must explicitly authorize an auto-merge policy, and CI must
   already protect the branch before an agent may use it.
10. In **single-issue mode**, hand off the pull request and stop.
11. In **runway mode**, once the branch is clean, pushed, and its live CI result is known, return to
   synchronized `main`, rerun the ready command, and take another available issue that does not depend
   on the unmerged work. Continue until no available issue remains or a gate needs the user.

Shared coordination files such as the daily journal, status document, and project map are merge
hotspots even when two issues are dependency-independent. If another pull request that touches one
of those files merges first, repeat steps 1–7 before handing off the remaining pull request.

At each handoff state four facts: what exists, what is actually running, what is blocked and why,
and the next action with its owner. Do not call a queue, instruction file, or idle session an
automation that is actively watching external state.

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
