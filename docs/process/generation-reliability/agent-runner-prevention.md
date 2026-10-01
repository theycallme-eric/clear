# Agent Runner prevention — no partial closure

**Requirement:** REQ-030 (GR-08 in `docs/process/CLEAR-GENERATION-RELIABILITY-RECOVERY.md`,
guardrail 7).
**Implementation target:** `/Users/eric/Documents/Projects/support-tooling/agent-runner`
**Status:** handoff. Nothing here is implemented yet. This repository carries the rules, the replay
scenario and the check that keeps both; the runner change is separate work in the target project.

The target project was not readable from the workspace this was written in. Module names, the
state store and the command wiring inside it are therefore the implementer's to decide; what is
fixed is the behaviour below and the replay outcome.

---

## Why

TASK-032's journal (`docs/journal/2026-09-22.md`) recorded that the seed tags no exercise for
`skill_power`, `carries` or `stability_balance`, and that a profile enabling one of them would fail
with `GENERATION_NO_CANDIDATES`. It labelled the finding out of scope and the task closed. Onboarding
went on offering those sections, generation went on refusing them, and every dependent completed on
top of it. The runner checked that the scoped task's own commands passed. Nothing read the journal.

`docs/process/AGENT_PLAYBOOK.md` §5 and §6 now state the rules for an agent. This document is what
the runner has to enforce, so the rule does not depend on an agent remembering it.

---

## Rules

### 1. A violation becomes a blocking recovery item

A finding is an **acceptance violation** when it shows one of the task's own acceptance criteria is
not met for a state the criterion covers. It is a **dependency violation** when a task that depends
on this one would build on behaviour the finding shows to be broken or missing.

When a task discovers either, the runner must:

- create a blocking recovery item that names the finding, the task that found it, and the evidence;
- record the dependency: the recovery item blocks the finding task and every dependent the finding
  affects;
- refuse to close the finding task while the recovery item is unresolved;
- stop the graph for the affected dependents. Unaffected ready tasks may continue.

### 2. The out-of-scope condition

"Out of scope" is a valid disposition for a finding only when the affected behavior is removed from
dependents: no dependent offers, accepts, or relies on the behaviour the finding shows to be
unsupported. The disposition must cite the change that removed it.

Without that, "out of scope" is not a disposition. The finding is unresolved and rule 1 applies.
Deferring to "a later task" is the same thing unless that task exists as the recovery item and
blocks the dependents.

### 3. The completion check

Before a task may close, the runner inspects the task journal and its process log for findings and
refuses closure if any is unresolved. Passing verification commands do not override this.

A finding is resolved only by one of:

| Disposition | Requires |
|---|---|
| `fixed` | the change, and the verification that shows the finding no longer holds |
| `recovery-item` | a reference to the blocking recovery item, with the dependency recorded |
| `removed-from-dependents` | a reference to the change that removed the affected behaviour (rule 2) |
| `no-impact` | the reason it touches neither an acceptance criterion nor a dependent |

Anything else is unresolved, including a finding with no disposition and one described only as out
of scope, not worked around, not acted on, or left for later.

`no-impact` is the one disposition an agent can assert without evidence the runner can check, so
the runner records it in the closure report for review rather than accepting it silently.

---

## Automatic recovery, and what still needs a safety gate

**Automatic.** The runner does these without asking, because each is reversible and confined to
its own state:

- refuse to close the task and mark it blocked;
- create the recovery item in the runner's own task graph and record what it blocks;
- stop scheduling the affected dependents;
- write the stop, the finding and the recovery item to the process log;
- re-run the completion check when the journal or the recovery item changes.

**Requires an explicit safety gate.** The runner stops and waits for the owner before any of these:

- accepting `removed-from-dependents`, or removing behaviour from a dependent to satisfy it — what
  the product stops offering is a product decision;
- dismissing a finding, or overriding the completion check to close a task;
- resuming the graph for dependents that were stopped;
- amending acceptance criteria, requirements, or the dependency graph itself;
- anything destructive, irreversible or outward-facing: pushing, opening or merging a pull request,
  creating or closing a GitHub issue, running a migration against hosted data, calling the model
  provider.

Automatic recovery never implements the recovery item. It stops the graph and records the missing
work; working it is a new approved task.

---

## Replay scenario

`docs/process/generation-reliability/task-032-replay.json` is the TASK-032 finding as data: the
journal entry it comes from, the finding, the disposition that was recorded, what actually happened
(`observedOutcome`) and what must happen instead (`expectedOutcome`).

**Expected outcome:** the graph stops and a recovery item is created instead of dependents
completing. The finding is unresolved, out of scope is not accepted because the behaviour was not
removed from dependents, TASK-032 does not close, and the recovery item blocks TASK-032 and the
generation and onboarding dependents.

**Target tool path:** `/Users/eric/Documents/Projects/support-tooling/agent-runner`

**Replay command**, run from the target tool path with `CLEAR_REPO` set to this repository's root:

```sh
npm run replay -- --scenario "$CLEAR_REPO/docs/process/generation-reliability/task-032-replay.json"
```

The command is part of the work handed off; it does not exist until the target project implements
it. It must exit 0 only when the runner's outcome equals `expectedOutcome`, and non-zero when the
runner reproduces `observedOutcome`. The replay runs against the scenario alone: no repository
write, no network, no provider call.

## Done in the target project when

- the replay command above exits 0, and exits non-zero with the completion check disabled;
- a task whose journal holds an unresolved finding cannot be closed by passing verification;
- an out-of-scope disposition without a removal reference is treated as unresolved;
- the gated actions above are not taken by automatic recovery.

## Kept true by

`src/test/generation-reliability/process-prevention.test.ts` fails if the playbook or this document
loses these rules, or if the scenario stops agreeing with the journal entry it replays.
