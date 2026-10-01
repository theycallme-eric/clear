# CLEAR overnight visual-fidelity preflight

**Status:** waiting for the incoming design package and one live-provider credential update  
**Current application baseline:** `main` at `844916e`  
**Current visual authority:** CLEAR Design System 0.9.7, SHA-256
`12620dc5d9b6d7de965f25b80f86a90b8ee3e6a5eeea813eb1b85b0563d74790`  
**Purpose:** make the next visual-fidelity run reviewable in the morning without silently inheriting
stale runner state or pausing for approvals that could have been identified in advance.

## What is already ready

- GitHub delivery, protected checks, Vercel preview/production delivery, Supabase audit access, and
  the Claude Opus 5.5 runner profile have all been exercised successfully.
- The runner profile permits three concurrent claims, uses `claude-opus-5-5`, and bounds each
  worker to 100 turns and USD 10 of model budget.
- CLEAR 0.9.7 has route, state, and interaction evidence on phone, tablet, and desktop. It remains
  the comparison baseline until the owner explicitly promotes a newer package.
- The old Goal/Focus runner database is not the state store for this pass. It contains one failed
  run for TASK-014 even though all implementation tasks are complete. Reusing it would make the
  heartbeat and task counts misleading.

## Inputs that must be settled before the overnight run

1. **Incoming design package.** Record the exact file, SHA-256, package version, and extraction
   inventory. Do not edit the archived source.
2. **Authority ruling.** The owner must state whether the package:
   - supersedes 0.9.7 as the complete source of truth; or
   - is a proposed delta to audit against 0.9.7.
   A newer filename or modification time is not enough to infer authority.
3. **Funded live-generation credential.** Replace `ANTHROPIC_API_KEY` directly in the CLEAR
   Supabase project's Edge Function secrets with a key from the funded Anthropic workspace. Never
   paste it into chat, a shell transcript, source control, or the runner state. The old deployed
   secret was last updated 21 January 2026 and the provider now returns HTTP 400.
4. **Plan approval.** Requirements Builder must produce the exact evidence inventory, acceptance
   criteria, task graph, dependencies, and graph hash before Agent Runner starts. An unseen future
   graph cannot be safely pre-approved; the intended interaction is one compact review and one
   exact graph approval before bed.
5. **Bounded operating authorization.** Capture the owner's authorization scope below once, then
   attach it to the approved handoff so ordinary tasks do not ask again.

## Requirements Builder rules for this pass

- Reconcile every package rule and supplied visual note. Preserve a machine-readable mapping from
  source evidence to acceptance criteria to tasks; no criterion may disappear during task
  generation.
- Prefer shared tokens, primitives, composition components, and layout contracts when a correction
  applies to more than one screen. Route-local CSS is allowed only for genuinely route-specific
  behavior and must be named as an exception.
- Treat current product behavior as binding unless the new package explicitly changes it. A visual
  pass must not rewrite workout generation, Goal/Focus behavior, persistence, authentication, or
  navigation semantics by accident.
- Include phone, tablet, and desktop rendered proof; keyboard, focus, reduced-motion, loading,
  empty, error, disabled, and selected states; contained scrolling and pinned-action clearance;
  typography/font loading; atmospheric layers; and the complete first-use and workout journeys.
- Keep tasks reviewable. Split by shared foundation and independent route families. Do not combine
  the whole application into one implementation task, and serialize tasks that touch the same
  shared files.
- Do not introduce Storybook in this run. The Storybook/design-system repository proposal remains
  a separately documented follow-up so it cannot displace the goal of making CLEAR usable.
- Do not create a database migration, change secrets, alter protected workflow files, or weaken a
  test to make the graph pass. If the incoming package unexpectedly requires one of those actions,
  isolate it as an explicit blocked task rather than stopping unrelated work.

## Default overnight authorization envelope

Once the owner approves this envelope and the exact graph hash, automation may:

- unpack and audit the supplied package; create the fresh Requirements Builder workspace, GitHub
  task issues, and dedicated Agent Runner state; and use up to three concurrent Claude Opus 5.5
  workers;
- create branches, commits, pull requests, review fixes, and narrow conflict resolutions; rerun
  tests and CI; and merge through the normal protected path after every required check passes;
- deploy the web application through the repository's normal Vercel flow;
- create and tear down disposable Supabase test users and test data in the existing project;
- run the deterministic browser matrix and no more than **five** paid live workout generations for
  final validation, stopping the paid lane after repeated identical provider failure;
- automatically recover from transient CI failures, worker turn limits, stale base branches, and
  unambiguous append-only journal conflicts, within the runner's configured retry limits; and
- update the audit, journal, process log, task issues, and heartbeat with factual evidence.

This envelope never authorizes exposing or moving credentials, bypassing branch protection,
force-pushing shared branches, destructive database operations, weakening verification, resolving
a real product/design ambiguity by invention, altering billing, or making an unplanned migration or
protected-workflow change. Those conditions should block only the affected task; independent tasks
must continue.

## Runner and recovery configuration

- Create a new state database and workspace root for this package; never point the new run at
  `requirements-recovery/009-goal-focus/runner/state/state.sqlite`.
- Use profile `claude-opus` from the current CLEAR worker configuration.
- Use concurrency 3 only where the approved DAG says tasks are independent.
- Enable the bounded recovery loop. Maximum task failures: 3. Maximum no-progress passes: 3.
  Maximum CI wait: 60 minutes. Recovery must not transfer a task forever or create a new model run
  for a conflict that can be resolved deterministically.
- The heartbeat must read the new state database, GitHub PR/CI state, and the durable process log.
  It must report active tasks, completed movement, blockers, and whether owner action is actually
  required. It must not keep reporting the stale 009 task count.

## The one older task to reconcile in parallel

GitHub issue #253 / Goal-Focus TASK-014 is deployed journey proof, not missing implementation.
After the funded Supabase Anthropic key is installed, run its three bounded live journeys once,
record latency/tokens/prompt bytes without sensitive text, tear down the disposable namespace, and
close the issue if the evidence passes. A provider failure remains a release blocker and must be
reported honestly; it does not stop visual tasks that do not require a paid generation.

## Morning handoff definition

The run is review-ready only when it provides:

- the authority/version/hash of the design package that was implemented;
- the exact deployed application commit and deployment URL;
- completed/blocked task counts with links to merged PRs and any genuinely unresolved issue;
- green typecheck, lint, unit, build, protected CI, and phone/tablet/desktop journey evidence;
- a visual audit with named screenshots and a short exception ledger;
- the live generation result and Goal/Focus journey result, if the funded key was installed; and
- a concise QA route for the owner that starts with what to inspect, not with setup work.

If any item cannot finish, the report must say exactly what completed, what did not, why automatic
recovery stopped, and the smallest next action. It must never describe a skipped stage as passed.
